/**
 * Vercel cron route that scans and dispatches due triggers.
 * @module app/api/cron/scan/route
 */
import { createAdminClient } from "@/lib/supabase/server";
import { requireCronSecret } from "@/lib/triggers/route-auth";
import { runScan } from "@/lib/triggers/scanner";
import type { TriggerDispatchPayload } from "@/lib/triggers/schemas";

export const maxDuration = 45;

function resolveInternalBaseUrl(): string {
  const directBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (directBaseUrl) {
    return directBaseUrl;
  }

  const vercelUrl = (process.env.VERCEL_URL ?? "").trim();
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }

  throw new Error("NEXT_PUBLIC_APP_URL or VERCEL_URL not configured");
}

async function dispatchTrigger(payload: TriggerDispatchPayload): Promise<{ ok: boolean }> {
  const baseUrl = resolveInternalBaseUrl();
  const response = await fetch(`${baseUrl}/api/trigger/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  return { ok: response.ok };
}

export async function GET(request: Request): Promise<Response> {
  const authError = requireCronSecret(request);
  if (authError) {
    return authError;
  }

  try {
    const supabase = await createAdminClient();
    const result = await runScan({
      supabase,
      dispatch: dispatchTrigger,
    });

    return Response.json({
      success: true,
      claimed: result.claimed,
      dispatched: result.dispatched,
      staleReleased: result.staleReleased,
      errors: result.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scanner error";
    return Response.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}
