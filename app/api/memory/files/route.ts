/**
 * Lists all memory files for the authenticated user.
 * @module app/api/memory/files/route
 */
import { resolveClientId } from "@/lib/chat/client-id";
import { bootstrapMemoryFiles } from "@/lib/memory/bootstrap";
import { listMemoryFiles } from "@/lib/memory/loader";
import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function logServerError(context: string, error: unknown): void {
  console.error(context, error);
}

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Unauthorized.", 401);
  }

  try {
    const clientId = await resolveClientId(supabase, user.id);
    await bootstrapMemoryFiles(supabase, clientId);
    const files = await listMemoryFiles(supabase, clientId);

    return Response.json({ files });
  } catch (unexpectedError) {
    logServerError("Failed to load memory files.", unexpectedError);
    return jsonError("Failed to load memory files.", 500);
  }
}
