/**
 * Autonomous autopilot pulse runner.
 * @module lib/runner/run-autopilot
 */
import { generateText, stepCountIs } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import { createMessages } from "@/lib/chat/messages";
import { maybeCompactThread } from "@/lib/runner/compaction";
import { assembleContext } from "@/lib/runner/context";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import {
  buildAssistantPartsFromSteps,
  getAssistantTextFromParts,
} from "@/lib/runner/message-utils";
import {
  appendArtifactRecoveryNote,
  buildPrepareStep,
  createRunnerTools,
} from "@/lib/runner/run-agent";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import { truncateOversizedParts } from "@/lib/runner/toolcall-artifacts";
import type { Database, Json } from "@/types/database";

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

  await markStaleRunsFailed(supabase, { threadId, staleMinutes: 15 });

  const lockResult = await createRun(supabase, { threadId, clientId });
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

    const result = await generateText({
      model: gateway(modelId),
      system,
      messages,
      stopWhen: stepCountIs(MAX_STEPS_AUTOPILOT),
      tools: createRunnerTools(supabase, clientId, threadId),
      prepareStep: buildPrepareStep(modelId, MAX_STEPS_AUTOPILOT),
    });

    const rawParts = buildAssistantPartsFromSteps(result.steps);
    let parts = rawParts;
    let recoveryPaths: string[] = [];

    try {
      const truncatedResult = await truncateOversizedParts(
        supabase,
        clientId,
        rawParts,
      );
      parts = truncatedResult.parts;
      recoveryPaths = truncatedResult.recoveryPaths;
    } catch (artifactError) {
      console.error("[autopilot] toolcall artifact persistence failed:", artifactError);
    }

    const contentTextFromParts = getAssistantTextFromParts(parts);
    const fallbackContentText = typeof result.text === "string" ? result.text.trim() : "";
    const contentText = appendArtifactRecoveryNote(
      contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText,
      recoveryPaths,
    );
    const hasNonStepParts = parts.some((part) => part.type !== "step-start");

    if (hasNonStepParts || contentText.length > 0) {
      await createMessages(supabase, [
        {
          thread_id: threadId,
          role: "assistant",
          content: contentText,
          parts: hasNonStepParts
            ? (parts as Json)
            : ([{ type: "text", text: contentText }] as Json),
        },
      ]);
    }

    await completeRun(supabase, {
      runId: lockResult.runId,
      status: "completed",
      model: modelId,
      tokensIn: result.totalUsage.inputTokens ?? 0,
      tokensOut: result.totalUsage.outputTokens ?? 0,
      stepCount: result.steps.length,
    });

    await drainAndContinue(supabase, { clientId, threadId });
    void maybeCompactThread(supabase, clientId, threadId).catch((compactionError) => {
      console.error("[autopilot] post-run compaction failed:", compactionError);
    });

    return { status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown autopilot error";

    await completeRun(supabase, {
      runId: lockResult.runId,
      status: "failed",
      model: modelId,
      tokensIn: 0,
      tokensOut: 0,
    });

    return { status: "failed", error: message };
  }
}
