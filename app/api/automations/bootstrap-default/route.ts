/**
 * Authenticated bootstrap endpoint for seeding the default Daily Orchestrator automation.
 * @module app/api/automations/bootstrap-default/route
 */
import { z } from "zod";

import { bootstrapDefaultDailyOrchestrator } from "@/lib/automations/default-daily-orchestrator";
import { authenticateAndParseBody } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { ensureMainThreadForClient } from "@/lib/chat/threads";
import { createAdminClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  timezone: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const requestResult = await authenticateAndParseBody(request, bodySchema);
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  const { supabase, userId, body } = requestResult;
  const clientId = await resolveClientId(supabase, userId);
  const adminSupabase = await createAdminClient();
  const primaryThread = await ensureMainThreadForClient(adminSupabase, clientId);

  const result = await bootstrapDefaultDailyOrchestrator({
    supabase: adminSupabase,
    clientId,
    threadId: primaryThread.thread_id,
    timezone: body.timezone,
  });

  return Response.json(result);
}
