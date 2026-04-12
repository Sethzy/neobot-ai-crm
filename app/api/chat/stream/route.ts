/**
 * GET /api/chat/stream?threadId=<uuid>
 *
 * Long-lived SSE endpoint that tails the Anthropic Managed Agents session
 * cached on a conversation thread and forwards AI SDK UI chunks to the
 * browser. Open once when the thread becomes visible; close when the user
 * navigates away or the tab closes. Independent of any `send` POST — the
 * session keeps running whether or not a subscriber is attached.
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

export const runtime = "nodejs";
/** Keep the SSE connection alive for up to 5 minutes. */
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return jsonError("Missing threadId", 400);

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
      )) {
        await dispatchEventToCallbacks(event, callbacks);
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
