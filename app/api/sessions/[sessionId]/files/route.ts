/**
 * Returns session-produced files mirrored into Supabase Storage.
 * @module app/api/sessions/[sessionId]/files/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { downloadSessionFiles } from "@/lib/managed-agents/download-session-files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  if (!sessionId) {
    return jsonError("Missing sessionId.", 400);
  }

  const auth = await authenticateRequest();
  if (auth.kind === "error") {
    return auth.response;
  }

  const clientId = await resolveClientId(auth.supabase, auth.userId);
  const { data: thread } = await auth.supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!thread?.session_id) {
    return jsonError("Session not found.", 404);
  }

  const files = await downloadSessionFiles({
    supabase: auth.supabase,
    clientId,
    sessionId,
  });

  return Response.json({ files });
}
