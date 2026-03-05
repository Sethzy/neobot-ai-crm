/**
 * Lists all memory files for the authenticated user.
 * @module app/api/memory/files/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { bootstrapMemoryFiles } from "@/lib/memory/bootstrap";
import { listMemoryFiles } from "@/lib/memory/loader";

export async function GET(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;

  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    await bootstrapMemoryFiles(supabase, clientId);
    const files = await listMemoryFiles(supabase, clientId);

    return Response.json({ files });
  } catch (error) {
    console.error("Failed to load memory files.", error);
    return jsonError("Failed to load memory files.", 500);
  }
}
