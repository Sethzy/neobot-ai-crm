/**
 * manage_active_triggers tool for listing, inspecting, editing, deleting, and simulating triggers.
 * @module lib/runner/tools/triggers/manage-triggers
 */
import { tool } from "ai";
import { z } from "zod";

import { createMessage } from "@/lib/chat/messages";
import {
  computeNextFireAt,
  normalizeTriggerTimezone,
} from "@/lib/triggers/cron-utils";
import {
  DEFAULT_RSS_POLLING_INTERVAL_MINUTES,
  deriveRssCronExpression,
} from "@/lib/triggers/rss-schedule";
import { CRON_RUN_NUDGE, type TriggerSupabaseClient } from "@/lib/triggers/schemas";
import { buildTriggerEventMessage } from "@/lib/triggers/trigger-event";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database, Json } from "@/types/database";

const TRIGGER_ACTIONS = ["list", "view", "delete", "simulate", "edit"] as const;
const READ_ONLY_ACTIONS = ["list", "view"] as const;

type TriggerRow = Database["public"]["Tables"]["agent_triggers"]["Row"];
type TriggerUpdate = Database["public"]["Tables"]["agent_triggers"]["Update"];

export interface CreateManageTriggersToolOptions {
  readOnly?: boolean;
}

function formatTriggerArguments(trigger: Pick<TriggerRow, "cron_expression" | "payload">) {
  return {
    cron_expression: trigger.cron_expression,
    ...(typeof trigger.payload === "object" && trigger.payload ? trigger.payload : {}),
  };
}

function formatTriggerForResponse(trigger: TriggerRow) {
  const { webhook_secret: _secret, ...rest } = trigger;
  return {
    ...rest,
    title: trigger.trigger_type,
    invocationMessage: trigger.invocation_message,
    arguments: formatTriggerArguments(trigger),
  };
}

async function loadTrigger(
  supabase: TriggerSupabaseClient,
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
    ...(typeof trigger.payload === "object" && trigger.payload && !Array.isArray(trigger.payload) ? trigger.payload : {}),
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
    const cron = typeof mergedPayload.cron === "string"
      ? mergedPayload.cron.trim()
      : trigger.cron_expression ?? "";
    const timezone = normalizeTriggerTimezone(
      typeof mergedPayload.timezone === "string" ? mergedPayload.timezone : undefined,
    );

    update.payload = {
      ...mergedPayload,
      cron,
      timezone,
    } as Json;
    update.cron_expression = cron;
    update.next_fire_at = computeNextFireAt(cron, new Date(), timezone).toISOString();
  }

  if (trigger.trigger_type === "webhook") {
    const {
      webhook_secret: rawWebhookSecret,
      ...nextPayload
    } = mergedPayload;

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
    const pollingIntervalMinutes = typeof rawInterval === "number"
      ? rawInterval
      : DEFAULT_RSS_POLLING_INTERVAL_MINUTES;
    const cronExpression = deriveRssCronExpression(pollingIntervalMinutes);

    if (!cronExpression) {
      throw new Error(
        "RSS polling_interval_minutes must be one of 15, 30, 60, 360, or 1440.",
      );
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
    update.next_fire_at = computeNextFireAt(
      cronExpression,
      new Date(),
      timezone,
    ).toISOString();
  }

  return update;
}

/**
 * Creates the trigger management tool scoped to the current client.
 */
export function createManageTriggersTool(
  supabase: TriggerSupabaseClient,
  clientId: string,
  options?: CreateManageTriggersToolOptions,
) {
  const readOnly = options?.readOnly ?? false;
  const actionSchema = readOnly ? z.enum(READ_ONLY_ACTIONS) : z.enum(TRIGGER_ACTIONS);

  const manage_active_triggers = tool({
    description: readOnly
      ? "List and inspect active user-created triggers for the current client."
      : "List, inspect, edit, delete, or simulate active user-created triggers for the current client.",
    inputSchema: z.object({
      action: actionSchema,
      trigger_instance_id: z.string().uuid().optional(),
      edit_params: z.record(z.string(), z.unknown()).optional(),
      invocation_message: z.string().min(1).max(200).nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: async (input) => {
      if (input.action !== "list" && !input.trigger_instance_id) {
        return { success: false as const, error: "trigger_instance_id is required." };
      }

      switch (input.action) {
        case "list": {
          const { data, error } = await supabase
            .from("agent_triggers")
            .select("*")
            .eq("client_id", clientId)
            .neq("trigger_type", "pulse")
            .order("created_at", { ascending: false });

          if (error) {
            return { success: false as const, error: error.message };
          }

          const triggers = ((data as TriggerRow[] | null) ?? []).map((trigger) => ({
            id: trigger.id,
            name: trigger.name,
            title: trigger.trigger_type,
            invocationMessage: trigger.invocation_message,
            arguments: formatTriggerArguments(trigger),
          }));

          return { success: true as const, triggers };
        }
        case "view": {
          const { data, error } = await loadTrigger(supabase, clientId, input.trigger_instance_id!);
          if (error || !data) {
            return { success: false as const, error: error?.message ?? "Trigger not found." };
          }

          return { success: true as const, trigger: formatTriggerForResponse(data) };
        }
        case "delete": {
          const { error } = await supabase
            .from("agent_triggers")
            .delete()
            .eq("client_id", clientId)
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
            supabase,
            clientId,
            input.trigger_instance_id!,
          );
          if (loadError || !trigger) {
            return {
              success: false as const,
              error: loadError?.message ?? "Trigger not found.",
            };
          }

          try {
            const update = buildUpdatedTriggerRow(
              trigger,
              input.edit_params,
              input.invocation_message,
            );
            const { data, error } = await supabase
              .from("agent_triggers")
              .update(update)
              .eq("client_id", clientId)
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
            supabase,
            clientId,
            input.trigger_instance_id!,
          );
          if (error || !trigger) {
            return { success: false as const, error: error?.message ?? "Trigger not found." };
          }

          await createMessage(supabase, {
            thread_id: trigger.thread_id,
            role: "system",
            content: buildTriggerEventMessage({
              triggerId: trigger.id,
              triggerType: trigger.trigger_type,
              triggerName: trigger.name,
              instructionPath: trigger.instruction_path,
              invocationMessage: trigger.invocation_message,
              triggerPayload: input.payload,
            }),
          });

          const runResult = await runAgent(
            {
              clientId,
              threadId: trigger.thread_id,
              triggerType: "cron",
              input: CRON_RUN_NUDGE,
            },
            supabase,
          );

          return {
            success: true as const,
            status: runResult.status,
            message: runResult.status === "queued"
              ? "Trigger simulation queued for execution."
              : "Trigger simulation started.",
          };
        }
      }
    },
  });

  return { manage_active_triggers };
}
