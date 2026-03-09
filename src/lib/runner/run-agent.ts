/**
 * Runner core loop entrypoint for streaming model calls.
 * @module lib/runner/run-agent
 */
import { stepCountIs, streamText, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { createMessages } from "@/lib/chat/messages";
import { loadActivatedConnectionTools } from "@/lib/composio";
import { getActiveConnections } from "@/lib/connections/queries";
import { loadCrmConfig } from "@/lib/crm/config";
import { assembleContext } from "@/lib/runner/context";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import { finalizeRun } from "@/lib/runner/run-persistence";
import type { RunType } from "@/lib/runner/run-types";
import type { RunnerPayload } from "@/lib/runner/schemas";
import { createRunnerTools } from "@/lib/runner/tool-registry";
import { createSubagentTool } from "@/lib/runner/tools";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import type { Database, Json } from "@/types/database";

const MAX_STEPS_TIER_1 = 9;

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
export function buildPrepareStep(_modelId: string, maxSteps = MAX_STEPS_TIER_1) {
  return ({ stepNumber }: { stepNumber: number }) => {
    const result: Record<string, unknown> = {};

    if (stepNumber >= maxSteps - 1) {
      result.activeTools = [];
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };
}

/**
 * Executes one thread run if no active run exists, otherwise queues the input.
 */
export async function runAgent(
  payload: RunnerPayload,
  supabase: ChatSupabaseClient,
): Promise<RunAgentResult> {
  const { clientId, threadId, input } = payload;
  const modelId = TIER_1_MODEL;
  const crmMode = payload.crmMode ?? "normal";

  const runType: RunType = payload.triggerType === "pulse"
    ? "autopilot"
    : payload.triggerType;

  await markStaleRunsFailed(supabase, { threadId });

  const lockResult = await createRun(supabase, { threadId, clientId, runType });
  if (!lockResult.created) {
    await enqueueMessage(supabase, {
      threadId,
      clientId,
      content: input,
      fileParts: payload.fileParts,
      channel: "web",
      ...(payload.triggerType === "chat" ? {} : { triggerType: payload.triggerType }),
    });
    return { status: "queued" };
  }

  try {
    if (payload.triggerType !== "cron") {
      const userMessageParts = [
        ...(payload.fileParts ?? []),
        ...(input.length > 0 ? [{ type: "text", text: input }] : []),
      ];

      await createMessages(supabase, [
        {
          thread_id: threadId,
          role: "user",
          content: input.length > 0 ? input : null,
          parts: userMessageParts as Json,
        },
      ]);
    }

    const { config: crmConfig } = await loadCrmConfig(supabase, clientId);

    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
      clientId,
      crmConfig,
      crmMode,
    });
    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: payload.triggerType === "chat",
      crmMode,
      crmConfig,
    });
    const subagentTools = createSubagentTool(supabase, clientId, threadId, {
      parentRunId: lockResult.runId,
      crmConfig,
      crmMode,
    });
    let composioTools: ToolSet = {};

    try {
      const connections = await getActiveConnections(supabase, clientId);
      composioTools = await loadActivatedConnectionTools(connections);
    } catch (error) {
      console.error("[composio] Failed to load activated connection tools for runner.", error);
    }

    const tools: CombinedRunnerTools = {
      ...runnerTools,
      ...subagentTools,
      ...composioTools,
    };

    const streamResult = streamText({
      model: gateway(modelId),
      system,
      messages,
      stopWhen: stepCountIs(MAX_STEPS_TIER_1),
      tools,
      prepareStep: buildPrepareStep(modelId),
      onFinish: async ({ text, steps, totalUsage }) => {
        await finalizeRun({
          supabase,
          clientId,
          threadId,
          runId: lockResult.runId,
          modelId,
          steps,
          text,
          totalUsage,
          logLabel: "runner",
        });
      },
    });

    return { status: "streaming", streamResult };
  } catch (error) {
    await completeRun(supabase, {
      runId: lockResult.runId,
      status: "failed",
      model: modelId,
      tokensIn: 0,
      tokensOut: 0,
    });
    throw error;
  }
}
