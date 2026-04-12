/**
 * manage_active_triggers tool for managed agents.
 *
 * @module lib/managed-agents/tools/triggers/manage-active-triggers
 */
import { z } from "zod";

import { createMessage } from "@/lib/chat/messages";
import { spawnTriggerRun } from "@/lib/managed-agents/spawn-trigger-run";
import { toModelPath } from "@/lib/storage/agent-paths";
import { computeNextFireAt, normalizeTriggerTimezone } from "@/lib/triggers/cron-utils";
import { DEFAULT_RSS_POLLING_INTERVAL_MINUTES, deriveRssCronExpression } from "@/lib/triggers/rss-schedule";
import { CRON_RUN_NUDGE, type triggerTypeValues } from "@/lib/triggers/schemas";
import { buildTriggerEventMessage } from "@/lib/triggers/trigger-event";
import type { Database, Json } from "@/types/database";

import type { ManagedAgentTool } from "../types";

const TRIGGER_ACTIONS = ["list", "view", "delete", "simulate", "edit"] as const;
type TriggerRow = Database["public"]["Tables"]["agent_triggers"]["Row"];
type TriggerUpdate = Database["public"]["Tables"]["agent_triggers"]["Update"];
type TriggerAction = (typeof TRIGGER_ACTIONS)[number];

function formatTriggerArguments(trigger: Pick<TriggerRow, "cron_expression" | "payload">) {
  const payloadArguments =
    typeof trigger.payload === "object" && trigger.payload && !Array.isArray(trigger.payload)
      ? trigger.payload
      : {};

  return {
    cron_expression: trigger.cron_expression,
    ...payloadArguments,
  };
}

function formatTriggerForResponse(trigger: TriggerRow) {
  const { webhook_secret: webhookSecret, ...rest } = trigger;
  void webhookSecret;

  return {
    ...rest,
    instruction_path: toModelPath(trigger.instruction_path),
    title: trigger.trigger_type,
    invocationMessage: trigger.invocation_message,
    arguments: formatTriggerArguments(trigger),
  };
}

async function loadTrigger(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientId: string,
  triggerId: string,
): Promise<{ data: TriggerRow | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("agent_triggers")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", triggerId)
    .single();

  return {
    data: (data as TriggerRow | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

function buildUpdatedTriggerRow(
  trigger: TriggerRow,
  editParams: Record<string, unknown> | undefined,
  invocationMessage: string | null | undefined,
): TriggerUpdate {
  const mergedPayload: Record<string, unknown> = {
    ...(typeof trigger.payload === "object" && trigger.payload && !Array.isArray(trigger.payload)
      ? trigger.payload
      : {}),
    ...(editParams ?? {}),
  };
  const update: TriggerUpdate = {
    payload: mergedPayload as Json,
    retry_count: 0,
  };

  if (invocationMessage !== undefined) {
    update.invocation_message = invocationMessage;
  }

  if (trigger.trigger_type === "schedule") {
    const cron =
      typeof mergedPayload.cron === "string" ? mergedPayload.cron.trim() : trigger.cron_expression ?? "";
    const timezone = normalizeTriggerTimezone(
      typeof mergedPayload.timezone === "string" ? mergedPayload.timezone : undefined,
    );

    update.payload = { ...mergedPayload, cron, timezone } as Json;
    update.cron_expression = cron;
    update.next_fire_at = computeNextFireAt(cron, new Date(), timezone).toISOString();
  }

  if (trigger.trigger_type === "webhook") {
    const { webhook_secret: rawWebhookSecret, ...nextPayload } = mergedPayload;

    update.payload = nextPayload as Json;

    if (rawWebhookSecret === null) {
      update.webhook_secret = null;
    } else if (typeof rawWebhookSecret === "string") {
      update.webhook_secret = rawWebhookSecret;
    } else if (rawWebhookSecret !== undefined) {
      throw new Error("Webhook webhook_secret must be a string or null.");
    }
  }

  if (trigger.trigger_type === "rss") {
    const rawInterval = mergedPayload.polling_interval_minutes;
    const pollingIntervalMinutes =
      typeof rawInterval === "number" ? rawInterval : DEFAULT_RSS_POLLING_INTERVAL_MINUTES;
    const cronExpression = deriveRssCronExpression(pollingIntervalMinutes);

    if (!cronExpression) {
      throw new Error("RSS polling_interval_minutes must be one of 15, 30, 60, 360, or 1440.");
    }

    const timezone = normalizeTriggerTimezone(
      typeof mergedPayload.timezone === "string" ? mergedPayload.timezone : undefined,
    );

    update.payload = {
      ...mergedPayload,
      polling_interval_minutes: pollingIntervalMinutes,
      timezone,
    } as Json;
    update.cron_expression = cronExpression;
    update.next_fire_at = computeNextFireAt(cronExpression, new Date(), timezone).toISOString();
  }

  return update;
}

const inputSchema = z.object({
  action: z.enum(TRIGGER_ACTIONS),
  trigger_instance_id: z.string().uuid().optional(),
  edit_params: z.record(z.string(), z.unknown()).optional(),
  invocation_message: z.string().min(1).max(200).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

type ManageActiveTriggersInput = z.infer<typeof inputSchema>;

export const manageActiveTriggersTool: ManagedAgentTool<ManageActiveTriggersInput> = {
  name: "manage_active_triggers",
  description:
    "Manage the agent's active triggers.\n\nActions:\n- list: Returns all active triggers with their IDs, names, titles, invocationMessage, and arguments.\n- view: Shows detailed information for a specific trigger. Requires trigger_instance_id.\n- delete: Removes an active trigger. Requires trigger_instance_id. This is destructive.\n- simulate: Fires a test event on a trigger to test the agent's response. Requires trigger_instance_id and payload.\n- edit: Modifies an existing trigger's configuration. Requires trigger_instance_id. Use edit_params to modify trigger configuration (matching editSchema, not supported by all triggers) and/or invocation_message to set or clear the invocation title override.\n\nUse list first to see available triggers and get their instance IDs.",
  inputSchema,
  execute: async (input, context) => {
    const action = input.action as TriggerAction;

    if (action !== "list" && !input.trigger_instance_id) {
      return { success: false as const, error: "trigger_instance_id is required." };
    }

    switch (action) {
      case "list": {
        const { data, error } = await context.supabase
          .from("agent_triggers")
          .select("id, name, trigger_type, instruction_path, invocation_message, cron_expression, payload")
          .eq("client_id", context.clientId)
          .neq("trigger_type", "pulse")
          .order("created_at", { ascending: false });

        if (error) {
          return { success: false as const, error: error.message };
        }

        const triggers = (data ?? []).map((trigger) => ({
          id: trigger.id,
          name: trigger.name,
          title: trigger.trigger_type,
          instruction_path: toModelPath(trigger.instruction_path),
          invocationMessage: trigger.invocation_message,
          arguments: formatTriggerArguments(trigger),
        }));

        return { success: true as const, triggers };
      }
      case "view": {
        const { data, error } = await loadTrigger(
          context.supabase,
          context.clientId,
          input.trigger_instance_id!,
        );
        if (error || !data) {
          return { success: false as const, error: error?.message ?? "Trigger not found." };
        }

        return { success: true as const, trigger: formatTriggerForResponse(data) };
      }
      case "delete": {
        const { error } = await context.supabase
          .from("agent_triggers")
          .delete()
          .eq("client_id", context.clientId)
          .eq("id", input.trigger_instance_id!);

        if (error) {
          return { success: false as const, error: error.message };
        }

        return {
          success: true as const,
          deleted: true,
          trigger_id: input.trigger_instance_id!,
        };
      }
      case "edit": {
        if (!input.edit_params && input.invocation_message === undefined) {
          return {
            success: false as const,
            error: "Provide edit_params and/or invocation_message for edit.",
          };
        }

        const { data: trigger, error: loadError } = await loadTrigger(
          context.supabase,
          context.clientId,
          input.trigger_instance_id!,
        );
        if (loadError || !trigger) {
          return { success: false as const, error: loadError?.message ?? "Trigger not found." };
        }

        try {
          const update = buildUpdatedTriggerRow(
            trigger,
            input.edit_params,
            input.invocation_message,
          );
          const { data, error } = await context.supabase
            .from("agent_triggers")
            .update(update)
            .eq("client_id", context.clientId)
            .eq("id", input.trigger_instance_id!)
            .select("*")
            .single();

          if (error || !data) {
            return { success: false as const, error: error?.message ?? "Update failed." };
          }

          return {
            success: true as const,
            trigger: formatTriggerForResponse(data as TriggerRow),
          };
        } catch (error) {
          return {
            success: false as const,
            error: error instanceof Error ? error.message : "Update failed.",
          };
        }
      }
      case "simulate": {
        if (!input.payload) {
          return { success: false as const, error: "payload is required for simulate." };
        }

        const { data: trigger, error } = await loadTrigger(
          context.supabase,
          context.clientId,
          input.trigger_instance_id!,
        );
        if (error || !trigger) {
          return { success: false as const, error: error?.message ?? "Trigger not found." };
        }

        await createMessage(context.supabase, {
          thread_id: trigger.thread_id,
          role: "system",
          content: buildTriggerEventMessage({
            triggerId: trigger.id,
            triggerType: trigger.trigger_type as (typeof triggerTypeValues)[number],
            triggerName: trigger.name,
            instructionPath: toModelPath(trigger.instruction_path),
            invocationMessage: trigger.invocation_message,
            triggerPayload: input.payload,
          }),
        });

        const invocationMessage = buildTriggerEventMessage({
          triggerId: trigger.id,
          triggerType: trigger.trigger_type as (typeof triggerTypeValues)[number],
          triggerName: trigger.name,
          instructionPath: toModelPath(trigger.instruction_path),
          invocationMessage: trigger.invocation_message,
          triggerPayload: input.payload,
        });

        const runResult = await spawnTriggerRun(
          context.supabase,
          {
            clientId: context.clientId,
            threadId: trigger.thread_id,
            triggerType: "cron",
            invocationMessage: `${invocationMessage}\n\n${CRON_RUN_NUDGE}`,
            triggerId: trigger.id,
            triggerName: trigger.name,
          },
        );

        return {
          success: true as const,
          status: "queued" as const,
          message: runResult.taskHandle.id
            ? "Trigger simulation queued for execution."
            : "Trigger simulation started.",
        };
      }
    }
  },
};
