/**
 * GET /api/chat/stream?threadId=<uuid>
 *
 * Per-turn SSE endpoint that tails the Anthropic Managed Agents session
 * cached on a conversation thread and forwards AI SDK UI chunks to the
 * browser. Closes after each turn (session.status_idle) so no Vercel
 * function stays alive between turns or during approval waits. The
 * browser's SessionChatTransport reopens the SSE lazily on the next send.
 *
 * **Read-only.** This endpoint does not persist messages, dispatch tools,
 * or create runs. Persistence belongs to the write path (`POST
 * /api/chat/send`), not the read path.
 *
 * @module app/api/chat/stream/route
 */
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { dispatchEventToCallbacks } from "@/lib/managed-agents/dispatch-event-to-callbacks";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { buildUiStreamCallbacks } from "@/lib/managed-agents/session-stream-forwarder";
import { iterateSessionEventsForever } from "@/lib/managed-agents/session-reconnect";
import type { AnthropicEvent } from "@/lib/managed-agents/event-types";

export const runtime = "nodejs";
/** Keep the SSE connection alive for up to 5 minutes. */
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return jsonError("Missing threadId", 400);

  // Optional cursor from the client's last-seen source event id. When
  // present, the stream tails from that point (reconnect). When absent,
  // drains all history from the session start (first connection).
  const afterId = searchParams.get("afterId"); // string | null

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;
  const clientId = await resolveClientId(auth.supabase, auth.userId);

  const { data: thread } = await auth.supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!thread?.session_id) return jsonError("Thread not found", 404);

  const sessionId = thread.session_id;
  const anthropic = getAnthropicClient();

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const callbacks = buildUiStreamCallbacks(writer);
      for await (const event of iterateSessionEventsForever(
        anthropic,
        sessionId,
        request.signal,
        { afterId },
      )) {
        const typed = event as AnthropicEvent;

        // Emit a source-event-id marker so the client transport can dedup
        // events on SSE reconnect. Every Anthropic event has a unique id;
        // the client tracks which ids it has already processed.
        if (typed.id) {
          writer.write({
            type: "data-source-event-id",
            data: { id: typed.id },
          } as never);
        }

        await dispatchEventToCallbacks(event, callbacks);

        // Emit a finish chunk when the agent turn completes so the client
        // transport can close its per-turn ReadableStream (which makes
        // useChat set status → ready). The SSE connection stays open —
        // only the logical turn ends.
        if (typed.type === "session.status_idle") {
          const reason = typed.stop_reason.type;
          if (reason === "end_turn" || reason === "retries_exhausted" || reason === "requires_action") {
            writer.write({
              type: "finish",
              finishReason:
                reason === "end_turn"
                  ? "stop"
                  : reason === "requires_action"
                    ? "tool-calls"
                    : "error",
            } as never);
            return; // Turn complete — close the stream, let the function die.
          }
        }
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
