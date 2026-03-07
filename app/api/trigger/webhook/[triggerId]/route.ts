/**
 * Public webhook ingress for user-created webhook triggers.
 * @module app/api/trigger/webhook/[triggerId]/route
 */
import { after } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { executeTrigger } from "@/lib/triggers/executor";
import type { TriggerSupabaseClient } from "@/lib/triggers/schemas";
import {
  getWebhookSignatureHeader,
  parseWebhookRequestPayload,
  verifyWebhookSignature,
} from "@/lib/triggers/webhook-auth";
import { claimWebhookTrigger } from "@/lib/triggers/webhook-claim";

export const maxDuration = 60;

const triggerIdSchema = z.string().uuid();
const webhookTriggerSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  trigger_type: z.literal("webhook"),
  name: z.string().min(1),
  instruction_path: z.string().min(1),
  invocation_message: z.string().nullable(),
  webhook_secret: z.string().nullable(),
  enabled: z.boolean(),
});

async function loadWebhookTrigger(
  supabase: TriggerSupabaseClient,
  triggerId: string,
) {
  const { data, error } = await supabase
    .from("agent_triggers")
    .select(
      "id, client_id, thread_id, trigger_type, name, instruction_path, invocation_message, webhook_secret, enabled",
    )
    .eq("id", triggerId)
    .single();

  if (error || !data) {
    return null;
  }

  const parsedTrigger = webhookTriggerSchema.safeParse(data);
  return parsedTrigger.success ? parsedTrigger.data : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ triggerId: string }> },
): Promise<Response> {
  const { triggerId: rawTriggerId } = await params;
  const parsedTriggerId = triggerIdSchema.safeParse(rawTriggerId);

  if (!parsedTriggerId.success) {
    return Response.json({ error: "Invalid trigger id" }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const trigger = await loadWebhookTrigger(supabase, parsedTriggerId.data);

  if (!trigger || !trigger.enabled) {
    return Response.json({ error: "Webhook trigger not found" }, { status: 404 });
  }

  const rawBody = await request.text();

  if (trigger.webhook_secret) {
    const signature = getWebhookSignatureHeader(request.headers);

    if (
      !signature
      || !verifyWebhookSignature({
        secret: trigger.webhook_secret,
        body: rawBody,
        signature,
      })
    ) {
      return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  const claim = await claimWebhookTrigger(supabase, trigger.id);
  if (!claim) {
    return Response.json({ error: "Webhook trigger is already running" }, { status: 409 });
  }

  const triggerPayload = parseWebhookRequestPayload(
    rawBody,
    request.headers.get("content-type"),
  );

  after(async () => {
    try {
      await executeTrigger({
        supabase,
        payload: {
          triggerId: trigger.id,
          clientId: trigger.client_id,
          threadId: trigger.thread_id,
          currentRunId: claim.currentRunId,
          triggerType: "webhook",
          triggerName: trigger.name,
          instructionPath: trigger.instruction_path,
          invocationMessage: trigger.invocation_message,
          triggerPayload,
        },
      });
    } catch (error) {
      console.error("[webhook] execution failed:", error);
    }
  });

  return Response.json({ accepted: true, status: "queued" }, { status: 202 });
}
