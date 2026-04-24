/**
 * GET + PUT the current client's agent-context fields.
 * This is a thin authenticated CRUD surface over `clients.client_profile`
 * and `clients.user_preferences`.
 *
 * @module app/api/settings/agent-context/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

const AGENT_CONTEXT_SELECT = "client_profile, user_preferences" as const;
const MAX_CONTEXT_LENGTH = 100_000;

const putBodySchema = z
  .object({
    client_profile: z.string().max(MAX_CONTEXT_LENGTH).optional(),
    user_preferences: z.string().max(MAX_CONTEXT_LENGTH).optional(),
  })
  .refine(
    (data) => data.client_profile !== undefined || data.user_preferences !== undefined,
    { message: "At least one field must be provided." },
  );

export async function GET(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const { data, error } = await supabase
      .from("clients")
      .select(AGENT_CONTEXT_SELECT)
      .eq("client_id", clientId)
      .single();

    if (error) return jsonError("Failed to load agent context.", 500);
    return Response.json(data);
  } catch {
    return jsonError("Failed to load agent context.", 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  let body: z.infer<typeof putBodySchema>;
  try {
    body = putBodySchema.parse(await request.json());
  } catch {
    return jsonError(
      `Invalid request body. Each field must be ${MAX_CONTEXT_LENGTH} characters or fewer.`,
      400,
    );
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase } = authResult;

  // The clients table is read-only via RLS (see 20260301000006_harden_clients_rls).
  // update_my_agent_context is the one whitelisted, auth.uid()-scoped write path.
  try {
    const { data, error } = await supabase.rpc("update_my_agent_context", {
      p_client_profile: body.client_profile ?? null,
      p_user_preferences: body.user_preferences ?? null,
    });

    if (error || !data) return jsonError("Failed to update agent context.", 500);
    return Response.json(data);
  } catch {
    return jsonError("Failed to update agent context.", 500);
  }
}
