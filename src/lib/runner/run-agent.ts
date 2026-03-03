/**
 * Runner core loop entrypoint for streaming model calls.
 * @module lib/runner/run-agent
 */
import { stepCountIs, streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { assembleContext } from "@/lib/runner/context";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import type { RunnerPayload } from "@/lib/runner/schemas";
import { createCrmTools, createStorageTools } from "@/lib/runner/tools";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import type { Database } from "@/types/database";

const MAX_STEPS_TIER_1 = 4;
const ENABLE_CRM_WRITE_TOOLS_ENV = "RUNNER_ENABLE_CRM_WRITE_TOOLS";

type ChatSupabaseClient = SupabaseClient<Database>;
type RunnerTools = ReturnType<typeof createCrmTools> & ReturnType<typeof createStorageTools>;
type StreamResult = ReturnType<typeof streamText<RunnerTools>>;

export type RunAgentResult =
  | { status: "streaming"; streamResult: StreamResult }
  | { status: "queued" };

function areCrmWriteToolsEnabled(): boolean {
  const deploymentEnv = process.env.VERCEL_ENV;
  const isProductionDeployment = deploymentEnv
    ? deploymentEnv === "production"
    : process.env.NODE_ENV === "production";

  if (isProductionDeployment) {
    return false;
  }

  return process.env[ENABLE_CRM_WRITE_TOOLS_ENV] === "1";
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

  await markStaleRunsFailed(supabase, { threadId, staleMinutes: 15 });

  const lockResult = await createRun(supabase, { threadId, clientId });
  if (!lockResult.created) {
    await enqueueMessage(supabase, {
      threadId,
      clientId,
      content: input,
      channel: "web",
    });
    return { status: "queued" };
  }

  try {
    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: input,
    });
    const crmTools = createCrmTools(supabase, clientId, {
      allowWriteTools: areCrmWriteToolsEnabled(),
    });
    const storageTools = createStorageTools(supabase, clientId);
    const tools = {
      ...crmTools,
      ...storageTools,
    };

    const streamResult = streamText({
      model: gateway(modelId),
      system,
      messages,
      stopWhen: stepCountIs(MAX_STEPS_TIER_1),
      tools,
      onFinish: async ({ steps, totalUsage }) => {
        await completeRun(supabase, {
          runId: lockResult.runId,
          status: "completed",
          model: modelId,
          tokensIn: totalUsage.inputTokens ?? 0,
          tokensOut: totalUsage.outputTokens ?? 0,
          stepCount: steps.length,
        });
        await drainAndContinue(supabase, { clientId, threadId });
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
