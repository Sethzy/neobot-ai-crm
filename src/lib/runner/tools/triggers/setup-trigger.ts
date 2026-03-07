/**
 * setup_trigger tool for creating user-defined trigger instances.
 * @module lib/runner/tools/triggers/setup-trigger
 */
import { tool } from "ai";
import { z } from "zod";

import {
  computeNextFireAt,
  normalizeTriggerTimezone,
} from "@/lib/triggers/cron-utils";
import {
  DEFAULT_RSS_POLLING_INTERVAL_MINUTES,
  deriveRssCronExpression,
} from "@/lib/triggers/rss-schedule";
import type { TriggerSupabaseClient } from "@/lib/triggers/schemas";
import type { Database } from "@/types/database";

const setupTriggerInputSchema = z.object({
  trigger_id: z.string().min(1),
  name: z.string().min(1),
  instruction_path: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  invocation_message: z.string().min(1).max(200).optional(),
});
type AgentTriggerInsert = Database["public"]["Tables"]["agent_triggers"]["Insert"];

function resolvePublicAppBaseUrl(): string | null {
  const directBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (directBaseUrl) {
    return directBaseUrl;
  }

  const vercelUrl = (process.env.VERCEL_URL ?? "").trim();
  if (!vercelUrl) {
    return null;
  }

  return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
}

function buildScheduleInsertRow(args: {
  clientId: string;
  threadId: string;
  name: string;
  instructionPath: string;
  params: Record<string, unknown>;
  invocationMessage?: string;
}): AgentTriggerInsert {
  const cron = typeof args.params.cron === "string" ? args.params.cron.trim() : "";

  if (!cron) {
    throw new Error("Schedule triggers require params.cron.");
  }

  const timezone = normalizeTriggerTimezone(
    typeof args.params.timezone === "string" ? args.params.timezone : undefined,
  );
  const nextFireAt = computeNextFireAt(cron, new Date(), timezone);

  return {
    client_id: args.clientId,
    thread_id: args.threadId,
    trigger_type: "schedule",
    name: args.name,
    instruction_path: args.instructionPath,
    cron_expression: cron,
    next_fire_at: nextFireAt.toISOString(),
    invocation_message: args.invocationMessage ?? null,
    payload: {
      ...args.params,
      cron,
      timezone,
    },
    retry_count: 0,
    webhook_secret: null,
  };
}

function buildWebhookInsertRow(args: {
  clientId: string;
  threadId: string;
  name: string;
  instructionPath: string;
  params: Record<string, unknown>;
  invocationMessage?: string;
}): AgentTriggerInsert {
  const webhookSecret = typeof args.params.webhook_secret === "string"
    ? args.params.webhook_secret
    : null;

  return {
    client_id: args.clientId,
    thread_id: args.threadId,
    trigger_type: "webhook",
    name: args.name,
    instruction_path: args.instructionPath,
    cron_expression: null,
    next_fire_at: null,
    invocation_message: args.invocationMessage ?? null,
    payload: {},
    retry_count: 0,
    webhook_secret: webhookSecret,
  };
}

function buildRssInsertRow(args: {
  clientId: string;
  threadId: string;
  name: string;
  instructionPath: string;
  params: Record<string, unknown>;
  invocationMessage?: string;
}): AgentTriggerInsert {
  const feedUrl = typeof args.params.feed_url === "string" ? args.params.feed_url.trim() : "";
  if (!feedUrl) {
    throw new Error("RSS triggers require params.feed_url.");
  }

  const rawInterval = args.params.polling_interval_minutes;
  const pollingIntervalMinutes = typeof rawInterval === "number"
    ? rawInterval
    : DEFAULT_RSS_POLLING_INTERVAL_MINUTES;
  const cronExpression = deriveRssCronExpression(pollingIntervalMinutes);

  if (!cronExpression) {
    throw new Error(
      "RSS polling_interval_minutes must be one of 15, 30, 60, 360, or 1440.",
    );
  }

  const timezone = normalizeTriggerTimezone(undefined);
  const nextFireAt = computeNextFireAt(cronExpression, new Date(), timezone);

  return {
    client_id: args.clientId,
    thread_id: args.threadId,
    trigger_type: "rss",
    name: args.name,
    instruction_path: args.instructionPath,
    cron_expression: cronExpression,
    next_fire_at: nextFireAt.toISOString(),
    invocation_message: args.invocationMessage ?? null,
    payload: {
      feed_url: feedUrl,
      polling_interval_minutes: pollingIntervalMinutes,
      timezone,
    },
    retry_count: 0,
    webhook_secret: null,
  };
}

/**
 * Creates the trigger setup tool scoped to the active client and thread.
 */
export function createSetupTriggerTool(
  supabase: TriggerSupabaseClient,
  clientId: string,
  threadId: string,
) {
  const setup_trigger = tool({
    description:
      "Create a new trigger instance for the current thread using the trigger ID and params returned by search_triggers.",
    inputSchema: setupTriggerInputSchema,
    execute: async ({
      trigger_id,
      name,
      instruction_path,
      params,
      invocation_message,
    }) => {
      try {
        let insertRow: AgentTriggerInsert;

        switch (trigger_id) {
          case "schedule":
            insertRow = buildScheduleInsertRow({
              clientId,
              threadId,
              name,
              instructionPath: instruction_path,
              params,
              invocationMessage: invocation_message,
            });
            break;
          case "webhook":
            insertRow = buildWebhookInsertRow({
              clientId,
              threadId,
              name,
              instructionPath: instruction_path,
              params,
              invocationMessage: invocation_message,
            });
            break;
          case "rss":
            insertRow = buildRssInsertRow({
              clientId,
              threadId,
              name,
              instructionPath: instruction_path,
              params,
              invocationMessage: invocation_message,
            });
            break;
          default:
            return {
              success: false as const,
              error: `Unknown trigger type: ${trigger_id}`,
            };
        }

        const { data, error } = await supabase
          .from("agent_triggers")
          .insert(insertRow)
          .select("*")
          .single();

        if (error || !data) {
          return {
            success: false as const,
            error: error?.message ?? "Failed to create trigger.",
          };
        }

        const webhookBaseUrl = trigger_id === "webhook" ? resolvePublicAppBaseUrl() : null;

        return {
          success: true as const,
          trigger: {
            ...data,
            webhook_url: webhookBaseUrl
              ? `${webhookBaseUrl}/api/trigger/webhook/${data.id}`
              : null,
          },
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Failed to create trigger.",
        };
      }
    },
  });

  return { setup_trigger };
}
