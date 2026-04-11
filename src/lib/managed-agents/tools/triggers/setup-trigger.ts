/**
 * setup_trigger tool for managed agents.
 *
 * @module lib/managed-agents/tools/triggers/setup-trigger
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { toModelPath, toStoragePath } from "@/lib/storage/agent-paths";
import { computeNextFireAt, normalizeTriggerTimezone } from "@/lib/triggers/cron-utils";
import { DEFAULT_RSS_POLLING_INTERVAL_MINUTES, deriveRssCronExpression } from "@/lib/triggers/rss-schedule";
import type { Database } from "@/types/database";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  trigger_id: z.string().min(1).describe("The ID of the trigger type to set up (e.g., \"schedule\", \"webhook\", \"rss\")"),
  name: z.string().min(1).describe("A human-readable name for this trigger instance."),
  instruction_path: z.string().min(1).describe("Path to the instruction file the agent should follow when this trigger fires."),
  params: z.record(z.string(), z.unknown()).describe("Setup parameters as defined by the trigger's setupSchema"),
  invocation_message: z.string().min(1).max(200).optional().describe("Optional short message that is included each time this trigger runs. Max 200 characters."),
});

type SetupTriggerInput = z.infer<typeof inputSchema>;
type AgentTriggerInsert = Database["public"]["Tables"]["agent_triggers"]["Insert"];

function toAnalyticsTriggerType(triggerId: string): "cron" | "webhook" | "rss" | "pulse" {
  switch (triggerId) {
    case "schedule":
      return "cron";
    case "webhook":
    case "rss":
    case "pulse":
      return triggerId;
    default:
      return "cron";
  }
}

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
    payload: { ...args.params, cron, timezone },
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
  const webhookSecret =
    typeof args.params.webhook_secret === "string" ? args.params.webhook_secret : null;

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
  const pollingIntervalMinutes =
    typeof rawInterval === "number" ? rawInterval : DEFAULT_RSS_POLLING_INTERVAL_MINUTES;
  const cronExpression = deriveRssCronExpression(pollingIntervalMinutes);

  if (!cronExpression) {
    throw new Error("RSS polling_interval_minutes must be one of 15, 30, 60, 360, or 1440.");
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

export const setupTriggerTool: ManagedAgentTool<SetupTriggerInput> = {
  name: "setup_trigger",
  description:
    "Set up a new trigger instance. First use search_triggers to find available triggers and their setup schemas, then call this tool with the trigger ID and required parameters.\nOn completion, shows the user a UI card with the trigger details.",
  inputSchema,
  execute: async ({ trigger_id, name, instruction_path, params, invocation_message }, context) => {
    if (!context.threadId) {
      return { success: false as const, error: "Thread ID is required." };
    }

    try {
      const internalInstructionPath = toStoragePath(instruction_path);
      let insertRow: AgentTriggerInsert;

      switch (trigger_id) {
        case "schedule":
          insertRow = buildScheduleInsertRow({
            clientId: context.clientId,
            threadId: context.threadId,
            name,
            instructionPath: internalInstructionPath,
            params,
            invocationMessage: invocation_message,
          });
          break;
        case "webhook":
          insertRow = buildWebhookInsertRow({
            clientId: context.clientId,
            threadId: context.threadId,
            name,
            instructionPath: internalInstructionPath,
            params,
            invocationMessage: invocation_message,
          });
          break;
        case "rss":
          insertRow = buildRssInsertRow({
            clientId: context.clientId,
            threadId: context.threadId,
            name,
            instructionPath: internalInstructionPath,
            params,
            invocationMessage: invocation_message,
          });
          break;
        default:
          return { success: false as const, error: `Unknown trigger type: ${trigger_id}` };
      }

      const { data, error } = await context.supabase
        .from("agent_triggers")
        .insert(insertRow)
        .select("*")
        .single();

      if (error || !data) {
        return { success: false as const, error: error?.message ?? "Failed to create trigger." };
      }

      await captureServerEvent({
        distinctId: context.clientId,
        event: "trigger_created",
        properties: { trigger_type: toAnalyticsTriggerType(trigger_id) },
      });

      const webhookBaseUrl = trigger_id === "webhook" ? resolvePublicAppBaseUrl() : null;

      return {
        success: true as const,
        trigger: {
          ...data,
          instruction_path: toModelPath(data.instruction_path),
          webhook_url: webhookBaseUrl ? `${webhookBaseUrl}/api/trigger/webhook/${data.id}` : null,
        },
      };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Failed to create trigger.",
      };
    }
  },
};
