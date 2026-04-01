/**
 * API route for fetching the resolved CRM configuration for the current client.
 * @module app/api/crm/config/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { loadCrmConfig, resolveCrmConfig, type CrmConfigRow } from "@/lib/crm/config";

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

/**
 * PATCH handler — updates field config (column order, visibility, width, etc.)
 * Saves a snapshot to crm_config_history before writing.
 */
export async function PATCH(request: Request) {
  const auth = await authenticateRequest();

  if (auth.kind === "error") {
    return auth.response;
  }

  try {
    const clientId = await resolveClientId(auth.supabase, auth.userId);
    const body = await request.json();

    // Snapshot current config before writing
    const { data: currentConfig } = await auth.supabase
      .from("crm_config")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    if (currentConfig) {
      await auth.supabase.from("crm_config_history").insert({
        client_id: clientId,
        config_snapshot: currentConfig,
      });

      // Trim to last 20 versions
      const { data: history } = await auth.supabase
        .from("crm_config_history")
        .select("id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (history && history.length > 20) {
        const idsToDelete = history.slice(20).map((h: { id: string }) => h.id);
        await auth.supabase.from("crm_config_history").delete().in("id", idsToDelete);
      }
    }

    // Extract only the field-related updates
    const updates: Record<string, unknown> = {};
    for (const key of ["contact_fields", "company_fields", "deal_fields"]) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("No field config updates provided.", 400);
    }

    const { data, error } = await auth.supabase
      .from("crm_config")
      .upsert(
        { client_id: clientId, ...updates },
        { onConflict: "client_id" },
      )
      .select("*")
      .single();

    if (error || !data) {
      return jsonError(error?.message ?? "Failed to update CRM config.", 500);
    }

    return Response.json({
      hasConfig: true,
      config: resolveCrmConfig(data as CrmConfigRow),
    });
  } catch {
    return jsonError("Failed to update CRM config.", 500);
  }
}
