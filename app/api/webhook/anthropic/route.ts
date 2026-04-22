/**
 * Anthropic session webhook — safety net for Vercel function deaths.
 *
 * When an Anthropic Managed Agent session goes idle, this webhook checks
 * whether the corresponding run was already finalized by the SSE handler.
 * If not (Vercel function died), it fetches the missed events from
 * Anthropic and persists the assistant message.
 *
 * Register this URL in the Anthropic Console under Settings → Webhooks.
 * Subscribe to `session.status_idled`. Store the `whsec_` signing secret
 * as `ANTHROPIC_WEBHOOK_SECRET`.
 *
 * @module app/api/webhook/anthropic/route
 */
import { after } from "next/server";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { reconcilePendingApprovals } from "@/lib/managed-agents/reconcile-pending-approvals";
import { recoverOrphanedRun } from "@/lib/managed-agents/recover-orphaned-run";
import {
  verifyWebhookSignature,
  type WebhookHeaders,
} from "@/lib/managed-agents/webhook-verify";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const webhookSecret = getServerEnv().ANTHROPIC_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[anthropic-webhook] ANTHROPIC_WEBHOOK_SECRET not configured");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // 1. Verify HMAC signature
  const headers: WebhookHeaders = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  if (!verifyWebhookSignature(rawBody, headers, webhookSecret)) {
    console.warn("[anthropic-webhook] signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. Only handle session.status_idled events
  const eventType = payload.type as string | undefined;
  if (eventType !== "session.status_idled") {
    return Response.json({ received: true, action: "ignored" });
  }

  const data = payload.data as Record<string, unknown> | undefined;
  const sessionId = data?.session_id as string | undefined;
  const stopReasonType =
    (data?.stop_reason as Record<string, unknown> | undefined)?.type as
      | string
      | undefined;

  if (!sessionId) {
    console.warn("[anthropic-webhook] missing session_id in payload");
    return Response.json({ error: "Missing session_id" }, { status: 400 });
  }

  console.log(
    `[anthropic-webhook] session.status_idled session=${sessionId} stop_reason=${stopReasonType ?? "unknown"}`,
  );

  // 4. Look up the run — if already finalized, no-op
  const supabase = await createAdminClient();

  const { data: runRow, error: lookupError } = await supabase
    .from("runs")
    .select("run_id, thread_id, client_id, status, model")
    .eq("session_id", sessionId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("[anthropic-webhook] run lookup failed:", lookupError);
    return Response.json({ error: "Run lookup failed" }, { status: 500 });
  }

  if (!runRow) {
    console.log(
      `[anthropic-webhook] no running run for session ${sessionId} — already finalized`,
    );
    return Response.json({ received: true, action: "no-op" });
  }

  console.log(
    `[anthropic-webhook] orphaned run ${runRow.run_id} — recovering`,
  );

  // 5. Fire recovery in background, return 200 immediately
  after(async () => {
    try {
      const anthropic = getAnthropicClient();
      const run = {
        runId: runRow.run_id,
        threadId: runRow.thread_id,
        clientId: runRow.client_id,
        sessionId,
        model: runRow.model ?? "claude-sonnet-4-6",
      };

      if (stopReasonType === "requires_action") {
        const result = await reconcilePendingApprovals({
          supabase,
          anthropic,
          run,
        });
        console.log(
          `[anthropic-webhook] approval reconcile: reconciled=${result.reconciled} reason=${result.reason}`,
        );
        return;
      }

      const result = await recoverOrphanedRun({
        supabase,
        anthropic,
        run,
        stopReasonType: stopReasonType ?? "unknown",
      });
      console.log(
        `[anthropic-webhook] recovery: recovered=${result.recovered} reason=${result.reason}`,
      );
    } catch (error) {
      console.error("[anthropic-webhook] recovery failed:", error);
    }
  });

  return Response.json({ received: true, action: "recovering" });
}
