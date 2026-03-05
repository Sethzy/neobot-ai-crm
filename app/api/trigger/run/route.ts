/**
 * Internal trigger execution route called by the cron scanner.
 * @module app/api/trigger/run/route
 */
import { createAdminClient } from "@/lib/supabase/server";
import { executeTrigger } from "@/lib/triggers/executor";
import { requireCronSecret } from "@/lib/triggers/route-auth";
import { triggerDispatchPayloadSchema } from "@/lib/triggers/schemas";

export const maxDuration = 900;

export async function POST(request: Request): Promise<Response> {
  const authError = requireCronSecret(request);
  if (authError) {
    return authError;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsedPayload = triggerDispatchPayloadSchema.safeParse(body);
  if (!parsedPayload.success) {
    return Response.json(
      {
        error: "Invalid payload",
        details: parsedPayload.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const supabase = await createAdminClient();
    const result = await executeTrigger({
      supabase,
      payload: parsedPayload.data,
    });

    if (result.status === "claim_mismatch") {
      return Response.json(
        { status: "claim_mismatch", error: "Trigger claim no longer valid" },
        { status: 409 },
      );
    }

    return Response.json({ status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";
    return Response.json({ error: `Execution failed: ${message}` }, { status: 500 });
  }
}
