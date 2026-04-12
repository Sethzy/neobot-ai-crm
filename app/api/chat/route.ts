/**
 * Chat API endpoint backed by the Managed Agents runner.
 * @module app/api/chat/route
 */
import type { UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
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
import { checkRateLimit } from "@/lib/rate-limit";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

/** Pro-plan ceiling (300s). Most runs finish in <30s; this just prevents early kills on complex subagent work. */
export const maxDuration = 300;

function getTextFromUnknownParts(parts: unknown[]): string | null {
  const text = parts
    .filter((part): part is { type: string; text?: unknown } =>
      typeof part === "object" && part !== null && "type" in part
    )
    .filter((part): part is { type: "text"; text: string } =>
      part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
}

function getFilePartsFromUnknownParts(parts: unknown[]): ManagedFilePart[] {
  return parts
    .filter((part): part is {
      type: string;
      url?: unknown;
      filename?: unknown;
      mediaType?: unknown;
      storagePath?: unknown;
    } =>
      typeof part === "object" && part !== null && "type" in part
    )
    .filter((part): part is ManagedFilePart =>
      part.type === "file" &&
      typeof part.url === "string" &&
      typeof part.mediaType === "string" &&
      (part.filename === undefined || typeof part.filename === "string") &&
      (part.storagePath === undefined || typeof part.storagePath === "string"),
    )
    .map((part) => ({
      type: "file",
      url: part.url,
      mediaType: part.mediaType,
      ...(part.filename ? { filename: part.filename } : {}),
      ...(part.storagePath ? { storagePath: part.storagePath } : {}),
    }));
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
  supabase: { from: (table: string) => any },
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
    input = latestUserMessage
      ? getTextFromUnknownParts(latestUserMessage.parts) ?? ""
      : "";
    fileParts = latestUserMessage
      ? getFilePartsFromUnknownParts(latestUserMessage.parts)
      : [];
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
      const firstApproval = approvalResponses[0];
      if (!firstApproval) {
        return jsonError("No approval response found.", 400);
      }

      const resumeResult = await resumeManagedAgentFromApproval({
        anthropic,
        supabase,
        clientId: resolvedClientId,
        approvalId: firstApproval.approvalId,
        approved: firstApproval.approved,
      });
      _t("resume_from_approval_returned");

      if (resumeResult.status === "missing") {
        return jsonError("Approval not found.", 404);
      }

      if (resumeResult.status === "already_resolved") {
        return jsonError("Approval already resolved.", 409);
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
          approval_id: firstApproval.approvalId,
          outcome: firstApproval.approved ? "approved" : "denied",
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
      return createUIMessageStreamResponse({ stream: approvalStream });
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
    return createUIMessageStreamResponse({ stream });
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
