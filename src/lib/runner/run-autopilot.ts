/**
 * Autonomous autopilot pulse runner.
 * @module lib/runner/run-autopilot
 */
import { generateText, stepCountIs, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import { loadActivatedConnectionTools } from "@/lib/composio";
import { getActiveConnections } from "@/lib/connections/queries";
import { assembleContext } from "@/lib/runner/context";
import { buildPrepareStep } from "@/lib/runner/run-agent";
import { createRunnerTools } from "@/lib/runner/tool-registry";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import { finalizeRun } from "@/lib/runner/run-persistence";
import { createSubagentTool } from "@/lib/runner/tools";
import type { Database } from "@/types/database";

const MAX_STEPS_AUTOPILOT = 9;

type ChatSupabaseClient = SupabaseClient<Database>;

export interface RunAutopilotInput {
  clientId: string;
  threadId: string;
  supabase: ChatSupabaseClient;
}

export type RunAutopilotResult =
  | { status: "completed" }
  | { status: "skipped_busy" }
  | { status: "failed"; error: string };

/**
 * Executes one autopilot pulse without client streaming.
 * Busy threads are skipped rather than queued into the chat-message backlog.
 */
export async function runAutopilot({
  clientId,
  threadId,
  supabase,
}: RunAutopilotInput): Promise<RunAutopilotResult> {
  const modelId = TIER_1_MODEL;

  await markStaleRunsFailed(supabase, { threadId });

  const lockResult = await createRun(supabase, { threadId, clientId, runType: "autopilot" });
  if (!lockResult.created) {
    return { status: "skipped_busy" };
  }

  try {
    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
      clientId,
      instructions: AUTOPILOT_INSTRUCTION_PROMPT,
    });
    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: false,
      allowConnectionMutations: false,
    });
    const subagentTools = createSubagentTool(supabase, clientId, threadId, {
      parentRunId: lockResult.runId,
    });
    let composioTools: ToolSet = {};

    try {
      const connections = await getActiveConnections(supabase, clientId);
      composioTools = await loadActivatedConnectionTools(clientId, connections);
    } catch (error) {
      console.error("[composio] Failed to load activated connection tools for autopilot.", error);
    }

    const result = await generateText({
      model: gateway(modelId),
      system,
      messages,
      stopWhen: stepCountIs(MAX_STEPS_AUTOPILOT),
      tools: {
        ...runnerTools,
        ...subagentTools,
        ...composioTools,
      },
      prepareStep: buildPrepareStep(modelId, MAX_STEPS_AUTOPILOT),
    });

    await finalizeRun({
      supabase,
      clientId,
      threadId,
      runId: lockResult.runId,
      modelId,
      steps: result.steps,
      text: result.text,
      totalUsage: result.totalUsage,
      logLabel: "autopilot",
    });

    return { status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown autopilot error";

    try {
      await completeRun(supabase, {
        runId: lockResult.runId,
        status: "failed",
        model: modelId,
        tokensIn: 0,
        tokensOut: 0,
      });
    } catch (lifecycleError) {
      console.error("[autopilot] completeRun failed during error handling:", lifecycleError);
    }

    return { status: "failed", error: message };
  }
}
