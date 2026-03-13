/**
 * Enable/disable CRM configuration mode for the current client.
 * @module app/api/settings/crm-config-mode/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

const CRM_CONFIG_MODE_TTL_MS = 60 * 60 * 1000; // 1 hour

const requestBodySchema = z.object({
  action: z.enum(["enable", "disable"]),
});

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof requestBodySchema>;
  try {
    body = requestBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body. Expected { action: 'enable' | 'disable' }.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);

    const configModeUntil = body.action === "enable"
      ? new Date(Date.now() + CRM_CONFIG_MODE_TTL_MS).toISOString()
      : null;

    const { error } = await supabase
      .from("clients")
      .update({ crm_config_mode_until: configModeUntil })
      .eq("client_id", clientId);

    if (error) {
      return jsonError("Failed to update CRM configuration mode.", 500);
    }

    return Response.json({
      success: true,
      action: body.action,
      ...(configModeUntil ? { expiresAt: configModeUntil } : {}),
    });
  } catch {
    return jsonError("Failed to update CRM configuration mode.", 500);
  }
}
