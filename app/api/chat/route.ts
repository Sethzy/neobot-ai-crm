/**
 * Chat API endpoint backed by the Managed Agents runner.
 * @module app/api/chat/route
 */
import type { UIMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { extractUserInput } from "@/lib/chat/extract-user-input";
import { generateTitleFromUserMessage } from "@/lib/ai/title";
import { allowedModelIds } from "@/lib/ai/models";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import {
  resumeManagedAgentFromApproval,
  runManagedAgent,
} from "@/lib/managed-agents/adapter";
import type { ManagedFilePart } from "@/lib/managed-agents/types";
import {
  isMessageQuotaError,
  messageQuotaErrorCodes,
} from "@/lib/usage/message-quota";
import type { Database } from "@/types/database";
import { checkRateLimit } from "@/lib/rate-limit";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

/**
 * Next.js defaults route handlers to Node.js, but pinning it here makes the
 * streaming contract explicit for the chat hot path.
 */
export const runtime = "nodejs";
/** Pro-plan ceiling (300s). Most runs finish in <30s; this just prevents early kills on complex long-running work. */
export const maxDuration = 300;

const streamResponseHeaders = {
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
} satisfies Record<string, string>;

function createChatStreamResponse(stream: ReadableStream): Response {
  return createUIMessageStreamResponse({
    stream,
    headers: streamResponseHeaders,
  });
}

function getLatestUserMessage(
  messages: PostRequestBody["messages"],
): NonNullable<PostRequestBody["messages"]>[number] | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }
    return message;
  }

  return null;
}

interface ApprovalResponse {
  approvalId: string;
  approved: boolean;
}

async function deleteThreadIfEmpty(
  supabase: Pick<SupabaseClient<Database>, "from">,
  threadId: string,
  clientId: string,
): Promise<void> {
  const { data: firstMessage, error: messageLookupError } = await supabase
    .from("conversation_messages")
    .select("message_id")
    .eq("thread_id", threadId)
    .limit(1)
    .maybeSingle();

  if (messageLookupError) {
    console.error("[chat/route] Failed to check thread message state before cleanup:", messageLookupError);
    return;
  }

  if (firstMessage) {
    return;
  }

  await supabase
    .from("conversation_threads")
    .delete()
    .eq("thread_id", threadId)
    .eq("client_id", clientId);
}

/**
 * Scans the trailing messages for an AI SDK approval-responded part
 * (`state: "approval-responded"` with an `approval: { id, approved }`
 * body). The AI SDK's `addToolApprovalResponse()` helper attaches these
 * to the last assistant message before re-submitting, so we look at the
 * last two slots to cover both "assistant is last" (pending continuation)
 * and "user is last" (continuation already flushed into history).
 */
function getApprovalResponses(
  messages: PostRequestBody["messages"],
): ApprovalResponse[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const trailingMessages = messages.slice(-2);
  const approvalsById = new Map<string, boolean>();

  for (let i = trailingMessages.length - 1; i >= 0; i -= 1) {
    const message = trailingMessages[i];
    if (!Array.isArray(message?.parts)) {
      continue;
    }

    for (const part of message.parts) {
      if (typeof part !== "object" || part === null) {
        continue;
      }

      const state = "state" in part ? part.state : undefined;
      const approval = "approval" in part ? part.approval : undefined;
      const approvalRecord = typeof approval === "object" && approval !== null
        ? approval as Record<string, unknown>
        : null;

      if (
        state !== "approval-responded" ||
        !approvalRecord ||
        typeof approvalRecord.id !== "string" ||
        typeof approvalRecord.approved !== "boolean"
      ) {
        continue;
      }

      approvalsById.set(approvalRecord.id, approvalRecord.approved);
    }
  }

  return [...approvalsById.entries()].map(([approvalId, approved]) => ({
    approvalId,
    approved,
  }));
}

export async function POST(request: Request): Promise<Response> {
  const t0 = performance.now();
  const _t = (label: string) => console.log(`[chat/timing] ${label}: ${(performance.now() - t0).toFixed(0)}ms`);

  // AI_GATEWAY_API_KEY is validated by getServerEnv() on first access — no runtime check needed.

  let body: PostRequestBody;
  try {
    body = postRequestBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  // TODO(h5-cleanup): drop selectedChatModel from the schema; model is pinned by ANTHROPIC_AGENT_VERSION.
  if (body.selectedChatModel !== undefined && !allowedModelIds.has(body.selectedChatModel)) {
    return jsonError("Invalid selected chat model.", 400);
  }

  const threadId = body.id;
  const approvalResponses = getApprovalResponses(body.messages);
  const isApprovalContinuation = !body.message && approvalResponses.length > 0;

  if (!body.message && Array.isArray(body.messages) && !isApprovalContinuation) {
    return jsonError("Invalid request body: normal user turns must use `message`.", 400);
  }

  // Approval continuations carry no new user message — use empty input so the
  // model context doesn't duplicate the last user turn from history.
  let input: string;
  let fileParts: ManagedFilePart[] = [];
  let userMessageSourceId: string | undefined;

  if (isApprovalContinuation) {
    input = "";
  } else {
    const latestUserMessage = body.message?.role === "user"
      ? body.message
      : getLatestUserMessage(body.messages);
    const extractedUserInput = latestUserMessage
      ? extractUserInput(latestUserMessage)
      : null;
    input = extractedUserInput?.text ?? "";
    fileParts = extractedUserInput?.fileParts ?? [];
    userMessageSourceId =
      latestUserMessage && typeof latestUserMessage.id === "string"
        ? latestUserMessage.id
        : undefined;

    if (input.length === 0 && fileParts.length === 0) {
      return jsonError("Invalid request body: could not resolve latest user message text.", 400);
    }
  }

  _t("body_parsed");

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;
  _t("auth");

  const { allowed, retryAfter } = await checkRateLimit(
    `chat:${userId}`,
    30, // 30 requests per minute
    60,
  );
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error:
          "Rate limit exceeded. Please wait before sending more messages.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter ?? 60),
        },
      },
    );
  }

  let clientId: string | null = null;
  let didCreateThread = false;

  try {
    const resolvedClientId = await resolveClientId(supabase, userId);
    clientId = resolvedClientId;
    _t("resolve_client_id");

    const clientContextPromise = supabase
      .from("clients")
      .select("client_profile, user_preferences")
      .eq("client_id", resolvedClientId)
      .single();

    const { data: thread, error: threadLookupError } = await supabase
      .from("conversation_threads")
      .select("thread_id, title")
      .eq("thread_id", threadId)
      .eq("client_id", resolvedClientId)
      .eq("is_archived", false)
      .maybeSingle();
    let isNewThread = false;
    _t("thread_lookup");

    if (threadLookupError) {
      return jsonError("Failed to process chat request.", 500);
    }

    if (!thread) {
      if (!body.message || body.message.role !== "user") {
        return jsonError("Thread not found.", 404);
      }

      const { error: insertError } = await supabase
        .from("conversation_threads")
        .insert({ thread_id: threadId, client_id: resolvedClientId, title: null });

      if (insertError) {
        return jsonError("Failed to process chat request.", 500);
      }

      isNewThread = true;
      didCreateThread = true;
      _t("thread_insert");
    }

    // Start title generation early so it runs in parallel with managed-agent setup.
    // .catch ensures a flaky title model never jeopardizes chat delivery.
    const titlePromise = isNewThread && input.length > 0
      ? generateTitleFromUserMessage(input).catch(() => "")
      : null;

    const [{ data: clientContext, error: clientContextError }] = await Promise.all([
      clientContextPromise,
    ]);

    if (clientContextError) {
      return jsonError("Failed to process chat request.", 500);
    }

    const anthropic = getAnthropicClient();

    // ── Approval continuation branch ────────────────────────────────────────
    // The AI SDK `useChat` transport re-POSTs to /api/chat with an
    // `approval-responded` part embedded in the assistant message. We route
    // this through `resumeManagedAgentFromApproval`, which resolves the
    // stored approval event, kicks the paused Anthropic session with a
    // `user.tool_confirmation`, consumes the post-approval events, and
    // finalizes the run identically to a fresh turn.
    if (isApprovalContinuation) {
      // The AI SDK client re-POSTs the entire message history on every
      // continuation, so `approvalResponses` accumulates every approval the
      // user has ever resolved in this thread — not just the one they just
      // clicked. Walk the list from newest → oldest and resume on the first
      // one that still has a claimable (pending) approval row. Already-
      // resolved entries from prior continuations are skipped silently.
      //
      // Managed Agents can legitimately have multiple pending approvals in
      // one turn (`requires_action.event_ids[]` is plural), but the current
      // Sunder flow always pauses on one at a time and the client auto-sends
      // after each click, so "resume the newest unresolved" is the correct
      // single-step behavior — each click produces its own POST.
      if (approvalResponses.length === 0) {
        return jsonError("No approval response found.", 400);
      }

      let resumeResult:
        | Awaited<ReturnType<typeof resumeManagedAgentFromApproval>>
        | null = null;
      let resolvedApproval: ApprovalResponse | null = null;
      let sawAlreadyResolved = false;

      for (let i = approvalResponses.length - 1; i >= 0; i -= 1) {
        const candidate = approvalResponses[i]!;
        const attempt = await resumeManagedAgentFromApproval({
          anthropic,
          supabase,
          clientId: resolvedClientId,
          approvalId: candidate.approvalId,
          approved: candidate.approved,
        });
        if (attempt.status === "already_resolved") {
          sawAlreadyResolved = true;
          continue;
        }
        resumeResult = attempt;
        resolvedApproval = candidate;
        break;
      }
      _t("resume_from_approval_returned");

      if (!resumeResult || !resolvedApproval) {
        // Every approval in the request was already resolved in a prior
        // continuation — safe no-op. Return 200 with an empty stream so the
        // client's useChat state settles without surfacing a spurious error.
        if (sawAlreadyResolved) {
          const emptyStream = createUIMessageStream({
            originalMessages: body.messages as UIMessage[] | undefined,
            execute: async () => {},
          });
          return createChatStreamResponse(emptyStream);
        }
        return jsonError("Approval not found.", 404);
      }

      if (resumeResult.status === "missing") {
        return jsonError("Approval not found.", 404);
      }

      if (resumeResult.status === "error") {
        console.error(
          "[chat/route] resumeManagedAgentFromApproval error:",
          resumeResult.error,
        );
        return jsonError("Failed to process approval.", 500);
      }

      await captureServerEvent({
        distinctId: resolvedClientId,
        event: "approval_resolved",
        properties: {
          approval_id: resolvedApproval.approvalId,
          outcome: resolvedApproval.approved ? "approved" : "denied",
          source: "web",
        },
      });

      const approvalStream = createUIMessageStream({
        originalMessages: body.messages as UIMessage[] | undefined,
        execute: async ({ writer }) => {
          writer.merge(resumeResult.stream as never);
        },
      });

      _t("approval_response_returned");
      return createChatStreamResponse(approvalStream);
    }

    // ── Fresh turn branch ───────────────────────────────────────────────────
    _t("pre_run_managed_agent");
    const managedResult = await runManagedAgent({
      anthropic,
      supabase,
      clientId: resolvedClientId,
      threadId,
      input,
      fileParts,
      userMessageSourceId,
      clientProfile: clientContext?.client_profile ?? null,
      userPreferences: clientContext?.user_preferences ?? null,
      threadTitle: thread?.title ?? null,
    });
    _t("run_managed_agent_returned");

    if (
      typeof managedResult === "object" &&
      managedResult !== null &&
      !(managedResult instanceof ReadableStream) &&
      "status" in managedResult &&
      managedResult.status === "queued"
    ) {
      return Response.json(
        { error: "Another response is still in progress for this thread. Please wait and try again." },
        { status: 409 },
      );
    }

    const uiStream = managedResult as ReadableStream;

    if (body.message?.role === "user") {
      await captureServerEvent({
        distinctId: resolvedClientId,
        event: "chat_message_sent",
        properties: {
          thread_id: threadId,
          is_new_thread: isNewThread,
          has_files: fileParts.length > 0,
          file_count: fileParts.length,
        },
      });
    }

    const stream = createUIMessageStream({
      originalMessages: body.messages as UIMessage[] | undefined,
      execute: async ({ writer }) => {
        _t("stream_execute_start");
        writer.merge(uiStream as never);

        if (titlePromise) {
          const title = await titlePromise;
          _t("title_gen_resolved");
          if (title.length > 0) {
            writer.write({ type: "data-chat-title", data: title });
            supabase
              .from("conversation_threads")
              .update({ title })
              .eq("thread_id", threadId)
              .then(() => {});
          }
        }
      },
    });

    _t("response_returned");
    return createChatStreamResponse(stream);
  } catch (error) {
    if (didCreateThread && clientId) {
      await deleteThreadIfEmpty(supabase, threadId, clientId);
    }

    if (
      isMessageQuotaError(error) &&
      error.code === messageQuotaErrorCodes.limitReached
    ) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
          quota: error.quota,
        },
        { status: 402 },
      );
    }

    console.error("[chat/route] Unhandled error:", error);
    return jsonError("Failed to process chat request.", 500);
  }
}
