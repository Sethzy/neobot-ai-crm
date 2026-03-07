/**
 * API route for fetching the resolved CRM configuration for the current client.
 * @module app/api/crm/config/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { loadCrmConfig } from "@/lib/crm/config";

export async function GET() {
  const auth = await authenticateRequest();

  if (auth.kind === "error") {
    return auth.response;
  }

  try {
    const clientId = await resolveClientId(auth.supabase, auth.userId);
    const result = await loadCrmConfig(auth.supabase, clientId);

    return Response.json(result);
  } catch {
    return jsonError("Failed to load CRM config.", 500);
  }
}
