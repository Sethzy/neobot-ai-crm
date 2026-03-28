/**
 * Runner core loop entrypoint for streaming model calls.
 * @module lib/runner/run-agent
 */
import { stepCountIs, streamText, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { propagateAttributes } from "@langfuse/tracing";

import { withTracing } from "@posthog/ai";

import { captureServerEvent, getPostHogServer } from "@/lib/analytics/posthog-server";
import { gateway, gatewayProviderOptions, TIER_1_MODEL } from "@/lib/ai/gateway";
import { isApifyConfigured } from "@/lib/apify/env";
import { isBrowserUseConfigured } from "@/lib/browser-use/client";
import { createMessages } from "@/lib/chat/messages";
import { loadActivatedConnectionTools } from "@/lib/composio";
import { getActiveConnections } from "@/lib/connections/queries";
import { loadCrmConfig } from "@/lib/crm/config";
import { assembleContext, loadSystemPromptState } from "@/lib/runner/context";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import { finalizeRun } from "@/lib/runner/run-persistence";
import type { RunType } from "@/lib/runner/run-types";
import type { RunnerPayload } from "@/lib/runner/schemas";
import { createRunnerTools } from "@/lib/runner/tool-registry";
import { createSubagentTool } from "@/lib/runner/tools";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import {
  type ConsumedMessageQuota,
  consumeMessageQuota,
  MessageQuotaError,
  messageQuotaErrorCodes,
  releaseMessageQuota,
} from "@/lib/usage/message-quota";
import type { Database, Json } from "@/types/database";

/** Per-run-type step limits. Chat is tight for responsiveness; background runs get more headroom. */
const MAX_STEPS: Record<RunType, number> = {
  chat: 12,
  webhook: 12,
  cron: 16,
  autopilot: 16,
  subagent: 9,
};

type ChatSupabaseClient = SupabaseClient<Database>;
type RunnerTools = ReturnType<typeof createRunnerTools>;
type CombinedRunnerTools = RunnerTools & ToolSet;
type StreamResult = ReturnType<typeof streamText<CombinedRunnerTools>>;

export type RunAgentResult =
  | { status: "streaming"; streamResult: StreamResult }
  | { status: "queued" };

/**
 * Builds per-step overrides for the active model.
 * The only current override is disabling tools on the final allowed step.
 */
export function buildPrepareStep(_modelId: string, maxSteps: number) {
  return ({ stepNumber }: { stepNumber: number }) => {
    const result: Record<string, unknown> = {};

    if (stepNumber >= maxSteps - 1) {
      result.activeTools = [];
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };
}

function extractUniqueToolNames(steps: ReadonlyArray<{
  toolCalls?: ReadonlyArray<unknown>;
  toolResults?: ReadonlyArray<unknown>;
}>): string[] {
  const toolNames = new Set<string>();

  for (const step of steps) {
    for (const item of [...(step.toolCalls ?? []), ...(step.toolResults ?? [])]) {
      if (
        typeof item === "object" &&
        item !== null &&
        "toolName" in item &&
        typeof item.toolName === "string" &&
        item.toolName.length > 0
      ) {
        toolNames.add(item.toolName);
      }
    }
  }

  return [...toolNames];
}

function getTotalTokenCount(totalUsage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): number {
  if (typeof totalUsage.totalTokens === "number") {
    return totalUsage.totalTokens;
  }

  return (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0);
}

/**
 * Executes one thread run if no active run exists, otherwise queues the input.
 */
export async function runAgent(
  payload: RunnerPayload,
  supabase: ChatSupabaseClient,
): Promise<RunAgentResult> {
  const t0 = performance.now();
  const _t = process.env.NODE_ENV === "development"
    ? (label: string) => console.log(`[runner/timing] ${label}: ${(performance.now() - t0).toFixed(0)}ms`)
    : (_label: string) => {};

  const { clientId, threadId, input } = payload;
  const modelId = TIER_1_MODEL;
  const crmMode = payload.crmMode ?? "normal";

  const runType: RunType = payload.triggerType === "pulse"
    ? "autopilot"
    : payload.triggerType;
  const shouldConsumeMessageQuota =
    payload.consumeMessageQuota === true && payload.triggerType === "chat";
  let consumedQuota: ConsumedMessageQuota | null = null;
  // Quota release guard: set true after consuming a quota unit, cleared to false
  // once the unit is "settled" (user message persisted or run queued). If an error
  // occurs while true, the catch block releases the consumed unit back.
  let shouldReleaseConsumedQuota = false;

  if (shouldConsumeMessageQuota) {
    const quota = await consumeMessageQuota(supabase, clientId);
    _t("consume_quota");

    if (!quota.allowed) {
      throw new MessageQuotaError(
        messageQuotaErrorCodes.limitReached,
        "Monthly message limit reached.",
        { quota },
      );
    }

    consumedQuota = quota;
    shouldReleaseConsumedQuota = true;
  }

  let lockResult: Awaited<ReturnType<typeof createRun>> | null = null;
  const startedAt = Date.now();
  let hasRecordedTerminalState = false;

  const recordFailedRun = async (
    error: unknown,
    errorStage: "startup" | "stream",
  ) => {
    if (hasRecordedTerminalState || !lockResult?.created) {
      return;
    }

    hasRecordedTerminalState = true;

    await completeRun(supabase, {
      runId: lockResult.runId,
      status: "failed",
      model: modelId,
      tokensIn: 0,
      tokensOut: 0,
    });

    await captureServerEvent({
      distinctId: clientId,
      event: "agent_run_failed",
      properties: {
        run_id: lockResult.runId,
        thread_id: threadId,
        trigger_type: payload.triggerType,
        run_type: runType,
        duration_ms: Date.now() - startedAt,
        error_stage: errorStage,
        error_name: error instanceof Error ? error.name : "UnknownError",
        error: error instanceof Error ? error.message : "Unknown runner error",
      },
    });
  };

  try {
    await markStaleRunsFailed(supabase, { threadId });
    _t("mark_stale_runs");

    lockResult = await createRun(supabase, { threadId, clientId, runType });
    _t("create_run_lock");
    if (!lockResult.created) {
      if (payload.triggerType === "pulse") {
        return { status: "queued" };
      }
      await enqueueMessage(supabase, {
        threadId,
        clientId,
        content: input,
        fileParts: payload.fileParts,
        channel: payload.channel ?? "web",
        ...(payload.triggerType === "chat" ? {} : { triggerType: payload.triggerType }),
      });
      shouldReleaseConsumedQuota = false;
      return { status: "queued" };
    }
    const runId = lockResult.runId;

    const userMessageParts = [
      ...(payload.fileParts ?? []),
      ...(input.length > 0 ? [{ type: "text" as const, text: input }] : []),
    ];

    const composioPromise = getActiveConnections(supabase, clientId)
      .then((connections) => {
        _t("get_connections");
        return loadActivatedConnectionTools(connections, { supabase, clientId });
      })
      .then((tools) => {
        _t("load_composio_tools");
        return tools;
      })
      .catch((error) => {
        _t("composio_failed");
        console.error("[composio] Failed to load activated connection tools for runner.", error);
        return {} as ToolSet;
      });

    // Start all IO in one parallel batch — CRM config, Composio tools, and
    // system prompt state (memory, skills, reminder, compaction) are independent.
    const [{ config: crmConfig }, composioTools, preloadedState] = await Promise.all([
      loadCrmConfig(supabase, clientId).then((result) => {
        _t("load_crm_config");
        return result;
      }),
      composioPromise,
      loadSystemPromptState({
        supabase,
        threadId,
        clientId,
        crmConfigModeActive: payload.includeConfigTool,
      }).then((state) => {
        _t("load_system_prompt_state");
        return state;
      }),
    ]);

    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: input,
      currentMessageParts: userMessageParts.length > 0 ? userMessageParts : undefined,
      clientId,
      instructions: payload.instructions,
      crmConfig,
      crmMode,
      includeBrowserAutomation:
        payload.triggerType === "chat" && isBrowserUseConfigured(),
      includeMarketData: isPropertySupabaseConfigured(),
      includePropertyListings:
        payload.triggerType === "chat" && isApifyConfigured(),
      crmConfigModeActive: payload.includeConfigTool,
      preloadedState,
    });
    _t("assemble_context");

    if (payload.triggerType !== "cron" && payload.triggerType !== "pulse") {
      await createMessages(supabase, [
        {
          thread_id: threadId,
          role: "user",
          content: input.length > 0 ? input : null,
          parts: userMessageParts as Json,
        },
      ]);
      shouldReleaseConsumedQuota = false;
      _t("create_messages");
    }

    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: payload.triggerType === "chat",
      allowConnectionMutations: payload.triggerType !== "pulse",
      crmMode,
      crmConfig,
      includeConfigTool: payload.includeConfigTool,
    });
    const subagentTools = createSubagentTool(supabase, clientId, threadId, {
      parentRunId: lockResult.runId,
      crmConfig,
      crmMode,
    });
    _t("create_tools");

    const tools: CombinedRunnerTools = {
      ...runnerTools,
      ...subagentTools,
      ...composioTools,
    };

    const maxSteps = MAX_STEPS[runType];

    _t("pre_stream_text");
    const streamResult = await propagateAttributes(
      {
        traceName: `sunder-${payload.triggerType}`,
        sessionId: threadId,
        userId: clientId,
        tags: [payload.triggerType],
      },
      async () =>
        streamText({
          model: withTracing(gateway(modelId), getPostHogServer(), {
            posthogDistinctId: clientId,
            posthogProperties: {
              thread_id: threadId,
              run_id: runId,
              trigger_type: payload.triggerType,
              run_type: runType,
              model_id: modelId,
              environment: process.env.VERCEL_ENV ?? "development",
            },
          }),
          system,
          messages,
          stopWhen: stepCountIs(maxSteps),
          tools,
          prepareStep: buildPrepareStep(modelId, maxSteps),
          providerOptions: gatewayProviderOptions,
          // AI SDK default is 2 retries. We use 6 to match LangChain Deep Agents'
          // recommendation for production agents — covers transient network errors,
          // 429 rate limits, and 5xx from the gateway. Uses exponential backoff.
          maxRetries: 6,
          experimental_telemetry: { isEnabled: true },
          onError: async ({ error }) => {
            console.error(`[runner] streamText onError for thread=${threadId} run=${runId}:`, error);
            await recordFailedRun(error, "stream");
          },
          onFinish: async ({ text, steps, totalUsage }) => {
            if (hasRecordedTerminalState) {
              console.warn(`[runner] onFinish skipped (terminal state already recorded) for thread=${threadId} run=${runId}`);
              return;
            }

            hasRecordedTerminalState = true;

            await finalizeRun({
              supabase,
              clientId,
              threadId,
              runId,
              modelId,
              triggerType: payload.triggerType,
              steps,
              text,
              totalUsage,
              logLabel: "runner",
            });

            await captureServerEvent({
              distinctId: clientId,
              event: "agent_run_completed",
              properties: {
                run_id: runId,
                thread_id: threadId,
                trigger_type: payload.triggerType,
                duration_ms: Date.now() - startedAt,
                steps: steps.length,
                total_tokens: getTotalTokenCount(totalUsage),
                tools_called: extractUniqueToolNames(steps),
              },
            });
          },
        }),
    );

    _t("stream_text_returned");
    return { status: "streaming", streamResult };
  } catch (error) {
    if (shouldReleaseConsumedQuota && consumedQuota) {
      try {
        await releaseMessageQuota(supabase, consumedQuota.clientId, consumedQuota.periodStart);
      } catch (releaseError) {
        console.error("[quota] Failed to release consumed message quota.", releaseError);
      }
    }

    await recordFailedRun(error, "startup");
    throw error;
  }
}
