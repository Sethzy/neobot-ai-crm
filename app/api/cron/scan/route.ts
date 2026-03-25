/**
 * Vercel cron route that scans and dispatches due triggers.
 * @module app/api/cron/scan/route
 */
import { checkActiveSpriteJobs } from "@/lib/sandbox/sprite-jobs";
import { getSpritesClient } from "@/lib/sandbox/sprites-client";
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

async function readDispatchError(response: Response): Promise<string | undefined> {
  const responseText = (await response.text()).trim();
  if (!responseText) {
    return undefined;
  }

  try {
    const parsedResponse = JSON.parse(responseText) as Record<string, unknown>;

    if (typeof parsedResponse.error === "string" && parsedResponse.error.trim()) {
      return parsedResponse.error.trim();
    }

    if (typeof parsedResponse.status === "string" && parsedResponse.status.trim()) {
      return parsedResponse.status.trim();
    }
  } catch {
    // Fall back to raw text when the internal route does not return JSON.
  }

  return responseText;
}

async function dispatchTrigger(
  baseUrl: string,
  payload: TriggerDispatchPayload,
): Promise<{
  ok: boolean;
  status: number;
  error?: string;
}> {
  const response = await fetch(`${baseUrl}/api/trigger/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return { ok: true, status: response.status };
  }

  return {
    ok: false,
    status: response.status,
    error: await readDispatchError(response),
  };
}

export async function GET(request: Request): Promise<Response> {
  const authError = requireCronSecret(request);
  if (authError) {
    return authError;
  }

  try {
    const baseUrl = resolveInternalBaseUrl();
    const supabase = await createAdminClient();
    const result = await runScan({
      supabase,
      dispatch: (payload) => dispatchTrigger(baseUrl, payload),
    });

    // Check active sandbox jobs (fallback for missed webhook callbacks)
    let spriteJobs = { checked: 0, delivered: 0, failed: 0 };
    try {
      const spritesClient = getSpritesClient();
      spriteJobs = await checkActiveSpriteJobs(
        supabase,
        (spriteName) => spritesClient.sprite(spriteName),
      );
    } catch {
      // Sprites not configured — skip silently
    }

    return Response.json({
      success: true,
      claimed: result.claimed,
      dispatched: result.dispatched,
      staleReleased: result.staleReleased,
      errors: result.errors,
      spriteJobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scanner error";
    return Response.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}
