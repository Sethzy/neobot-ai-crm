/**
 * GET + PATCH autopilot configuration for the current client.
 * @module app/api/settings/autopilot/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { pulseIntervalValues } from "@/lib/autopilot/constants";
import { resolveClientId } from "@/lib/chat/client-id";

const AUTOPILOT_SELECT =
  "config_id, pulse_interval, quiet_hours_start, quiet_hours_end, timezone, enabled" as const;

const patchBodySchema = z
  .object({
    pulse_interval: z.enum(pulseIntervalValues).optional(),
    quiet_hours_start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    quiet_hours_end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    enabled: z.boolean().optional(),
    timezone: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasStart = data.quiet_hours_start !== undefined;
      const hasEnd = data.quiet_hours_end !== undefined;
      if (hasStart !== hasEnd) return false;
      if (hasStart && hasEnd) {
        const startNull = data.quiet_hours_start === null;
        const endNull = data.quiet_hours_end === null;
        if (startNull !== endNull) return false;
      }
      return true;
    },
    { message: "quiet_hours_start and quiet_hours_end must be set or cleared together" },
  );

export async function GET(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const { data, error } = await supabase
      .from("autopilot_config")
      .select(AUTOPILOT_SELECT)
      .eq("client_id", clientId)
      .single();

    if (error) return jsonError("Failed to load autopilot config.", 500);
    return Response.json(data);
  } catch {
    return jsonError("Failed to load autopilot config.", 500);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  let body: z.infer<typeof patchBodySchema>;
  try {
    body = patchBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const { data, error } = await supabase
      .from("autopilot_config")
      .update(body)
      .eq("client_id", clientId)
      .select(AUTOPILOT_SELECT)
      .single();

    if (error) return jsonError("Failed to update autopilot config.", 500);
    return Response.json(data);
  } catch {
    return jsonError("Failed to update autopilot config.", 500);
  }
}
