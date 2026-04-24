/**
 * Interrupt route for Managed Agents chat sessions.
 *
 * Sends a `user.interrupt` event to the Anthropic session cached on the
 * conversation thread. The route returns once Anthropic accepts the event;
 * the thread's live session stream is responsible for surfacing the follow-up
 * status change to the client.
 *
 * @module app/api/chat/interrupt/route
 */
import { z } from "zod";

import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { interruptSession } from "@/lib/managed-agents/interrupt-session";

const requestSchema = z.object({
  threadId: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const requestResult = await authenticateAndParseBody(request, requestSchema);
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
  const { data: thread, error } = await requestResult.supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", requestResult.body.threadId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up thread session: ${error.message}`);
  }

  if (!thread?.session_id) {
    return jsonError("No active session for thread.", 404);
  }

  await interruptSession(getAnthropicClient(), thread.session_id);
  return new Response(null, { status: 204 });
}
