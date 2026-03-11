/**
 * Chat API endpoint backed by the runner engine.
 * @module app/api/chat/route
 */
import type { UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

import {
  captureServerEvent,
  captureServerEvents,
} from "@/lib/analytics/posthog-server";
import { resolveApprovalEvent } from "@/lib/approvals/queries";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { generateTitleFromUserMessage } from "@/lib/ai/title";
import { clearActiveStreamId, setActiveStreamId } from "@/lib/redis";
import { runAgent } from "@/lib/runner/run-agent";
import type { RunnerFilePart } from "@/lib/runner/schemas";
import {
  isMessageQuotaError,
  messageQuotaErrorCodes,
} from "@/lib/usage/message-quota";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

/** Allows longer streaming runs on Vercel functions. */
export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

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

function getFilePartsFromUnknownParts(parts: unknown[]): RunnerFilePart[] {
  return parts
    .filter((part): part is { type: string; url?: unknown; filename?: unknown; mediaType?: unknown } =>
      typeof part === "object" && part !== null && "type" in part
    )
    .filter((part): part is RunnerFilePart =>
      part.type === "file" &&
      typeof part.url === "string" &&
      typeof part.mediaType === "string" &&
      (part.filename === undefined || typeof part.filename === "string"),
    )
    .map((part) => ({
      type: "file",
      url: part.url,
      mediaType: part.mediaType,
      ...(part.filename ? { filename: part.filename } : {}),
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

function getApprovalResponses(
  messages: PostRequestBody["messages"],
): ApprovalResponse[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // Approval-responded parts only appear on the most recent assistant message,
  // so scan in reverse and stop after the first message with approvals.
  const approvalsById = new Map<string, boolean>();

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
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

    if (approvalsById.size > 0) break;
  }

  return [...approvalsById.entries()].map(([approvalId, approved]) => ({
    approvalId,
    approved,
  }));
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return jsonError("Server misconfiguration: AI_GATEWAY_API_KEY is required.", 500);
  }

  let body: PostRequestBody;
  try {
    body = postRequestBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const threadId = body.id;
  const approvalResponses = getApprovalResponses(body.messages);
  const isApprovalContinuation = !body.message && approvalResponses.length > 0;

  if (!body.message && Array.isArray(body.messages) && !isApprovalContinuation) {
    return jsonError("Invalid request body: normal user turns must use `message`.", 400);
  }

  const latestUserMessage = body.message?.role === "user"
    ? body.message
    : getLatestUserMessage(body.messages);
  const input = latestUserMessage
    ? getTextFromUnknownParts(latestUserMessage.parts) ?? ""
    : null;
  const fileParts = latestUserMessage
    ? getFilePartsFromUnknownParts(latestUserMessage.parts)
    : [];

  if (input === null || (input.length === 0 && fileParts.length === 0)) {
    return jsonError("Invalid request body: could not resolve latest user message text.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const { data: thread, error: threadLookupError } = await supabase
      .from("conversation_threads")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("client_id", clientId)
      .eq("is_archived", false)
      .maybeSingle();
    let isNewThread = false;

    if (threadLookupError) {
      return jsonError("Failed to process chat request.", 500);
    }

    if (!thread) {
      if (!body.message || body.message.role !== "user") {
        return jsonError("Thread not found.", 404);
      }

      const { error: insertError } = await supabase
        .from("conversation_threads")
        .insert({ thread_id: threadId, client_id: clientId, title: null });

      if (insertError) {
        return jsonError("Failed to process chat request.", 500);
      }

      isNewThread = true;
    }

    if (approvalResponses.length > 0) {
      const resolutionResults = await Promise.all(
        approvalResponses.map((response) =>
          resolveApprovalEvent(supabase, {
            clientId,
            approvalId: response.approvalId,
            approved: response.approved,
          }),
        ),
      );

      const failed = resolutionResults.find(
        (r) => !r.success || (r.status !== "updated" && r.status !== "already_resolved"),
      );
      if (failed) {
        return jsonError("Failed to process chat request.", 500);
      }

      await captureServerEvents(
        resolutionResults.flatMap((result, index) => {
          if (!result.success || result.status !== "updated" || !("event" in result)) {
            return [];
          }

          return [{
            distinctId: clientId,
            event: "approval_resolved",
            properties: {
              tool_name: result.event.tool_name,
              approval_id: approvalResponses[index]?.approvalId,
              outcome: approvalResponses[index]?.approved ? "approved" : "denied",
            },
          }];
        }),
      );
    }

    const result = await runAgent(
      {
        clientId,
        threadId,
        triggerType: "chat",
        consumeMessageQuota: body.message?.role === "user",
        input,
        ...(fileParts.length > 0 ? { fileParts } : {}),
        crmMode: body.crmMode,
      },
      supabase,
    );

    if (result.status === "queued") {
      return Response.json({ status: "queued" }, { status: 202 });
    }

    if (body.message?.role === "user") {
      await captureServerEvent({
        distinctId: clientId,
        event: "chat_message_sent",
        properties: {
          thread_id: threadId,
          is_new_thread: isNewThread,
          has_files: fileParts.length > 0,
          file_count: fileParts.length,
        },
      });
    }

    const titlePromise = isNewThread && input.length > 0
      ? generateTitleFromUserMessage(input)
      : null;

    const stream = createUIMessageStream({
      originalMessages: body.messages as UIMessage[] | undefined,
      execute: async ({ writer }) => {
        writer.merge(result.streamResult.toUIMessageStream());

        if (titlePromise) {
          const title = await titlePromise;
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
      onFinish: async () => {
        if (!process.env.REDIS_URL) {
          return;
        }

        try {
          await clearActiveStreamId(threadId);
        } catch (_) {
          // Ignore Redis cleanup failures to avoid breaking completed responses.
        }
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }

        try {
          const streamContext = getStreamContext();
          if (!streamContext) {
            return;
          }

          const streamId = generateId();
          await setActiveStreamId(threadId, streamId);
          await streamContext.createNewResumableStream(streamId, () => sseStream);
        } catch (_) {
          clearActiveStreamId(threadId).catch(() => {});
        }
      },
    });
  } catch (error) {
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

    return jsonError("Failed to process chat request.", 500);
  }
}
