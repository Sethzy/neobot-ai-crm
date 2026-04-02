/**
 * Shared post-inference persistence logic for run-agent and run-autopilot.
 * Builds assistant parts, persists the assistant message, completes the run,
 * drains queued messages, and fires background compaction.
 * @module lib/runner/run-persistence
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeRunCost } from "@/lib/ai/cost";
import { getModelPricing } from "@/lib/ai/models";
import { createApprovalEvent, expireApprovalEvent } from "@/lib/approvals/queries";
import { captureServerEvents } from "@/lib/analytics/posthog-server";
import { createMessages } from "@/lib/chat/messages";
import {
  deliverToExternalChannels,
  hasExternalDeliverables,
} from "@/lib/channels/deliver";
import { maybeCompactThread } from "@/lib/runner/compaction";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import {
  buildAssistantPartsFromSteps,
  extractApprovalPartsFromPersisted,
  getAssistantTextFromParts,
  type PersistedPart,
  type StepLike,
} from "@/lib/runner/message-utils";
import { completeRun } from "@/lib/runner/run-lifecycle";
import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface FinalizeRunInput {
  supabase: ChatSupabaseClient;
  clientId: string;
  threadId: string;
  runId: string;
  modelId: string;
  triggerType?: "chat" | "webhook" | "cron" | "pulse";
  steps: ReadonlyArray<StepLike>;
  text: string;
  totalUsage: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number };
  };
  logLabel: string;
}

/**
 * Extracts approval-gated tool requests from normalized assistant parts.
 * Delegates to the shared extractor and reshapes for persistence consumers.
 */
export function extractApprovalRequests(
  parts: ReadonlyArray<PersistedPart>,
): Array<{ approvalId: string; toolName: string; toolInput: Record<string, unknown> }> {
  return extractApprovalPartsFromPersisted(parts).map((p) => ({
    approvalId: p.approvalId,
    toolName: p.toolName,
    toolInput: p.input,
  }));
}

/**
 * Shared post-inference persistence: build parts, persist the assistant message,
 * complete the run, drain queue, and compact.
 */
export async function finalizeRun({
  supabase,
  clientId,
  threadId,
  runId,
  modelId,
  triggerType,
  steps,
  text,
  totalUsage,
  logLabel,
}: FinalizeRunInput): Promise<void> {
  const rawParts = buildAssistantPartsFromSteps(steps);

  const contentTextFromParts = getAssistantTextFromParts(rawParts);
  const fallbackContentText = typeof text === "string" ? text.trim() : "";
  const contentText = contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText;
  const hasNonStepParts = rawParts.some((part) => part.type !== "step-start");

  const pricing = getModelPricing(modelId);
  const costUsd = pricing ? computeRunCost(totalUsage, pricing) : undefined;
  const cacheReadTokens = totalUsage.inputTokenDetails?.cacheReadTokens ?? undefined;

  const baseRunCompletion = {
    runId,
    model: modelId,
    tokensIn: totalUsage.inputTokens ?? 0,
    tokensOut: totalUsage.outputTokens ?? 0,
    stepCount: steps.length,
    promptTokens: totalUsage.inputTokens ?? 0,
    costUsd,
    cacheReadTokens,
  };

  const approvalRequests = extractApprovalRequests(rawParts);
  let createdApprovalIds: string[] = [];
  if (approvalRequests.length > 0) {
    const approvalResults = await Promise.all(
      approvalRequests.map((request) =>
        createApprovalEvent(supabase, {
          clientId,
          threadId,
          runId,
          toolName: request.toolName,
          toolInput: request.toolInput,
          approvalId: request.approvalId,
        }),
      ),
    );

    const approvalPersistenceFailure = approvalResults.find(
      (result) => !result.success && result.status === "error",
    );

    if (approvalPersistenceFailure) {
      console.error(
        `[${logLabel}] approval event persistence failed:`,
        approvalPersistenceFailure.error,
      );
      await completeRun(supabase, { ...baseRunCompletion, status: "partial" });
      return;
    }

    createdApprovalIds = approvalResults.flatMap((result, index) =>
      result.success && result.status === "created"
        ? [approvalRequests[index]?.approvalId].filter((approvalId): approvalId is string => typeof approvalId === "string")
        : [],
    );

    await captureServerEvents(
      approvalRequests.map((request) => ({
        distinctId: clientId,
        event: "approval_requested",
        properties: {
          approval_id: request.approvalId,
          run_id: runId,
          thread_id: threadId,
          tool_name: request.toolName,
          ...(triggerType ? { trigger_type: triggerType } : {}),
        },
      })),
    );
  }

  if (hasNonStepParts || contentText.length > 0) {
    try {
      await createMessages(supabase, [
        {
          thread_id: threadId,
          role: "assistant",
          content: contentText,
          parts: hasNonStepParts
            ? (rawParts as Json)
            : ([{ type: "text", text: contentText }] as Json),
        },
      ]);
    } catch (messageError) {
      if (createdApprovalIds.length > 0) {
        const cleanupResults = await Promise.all(
          createdApprovalIds.map((approvalId) =>
            expireApprovalEvent(supabase, {
              clientId,
              approvalId,
            }),
          ),
        );
        const cleanupFailure = cleanupResults.find(
          (result) => !result.success,
        );

        if (cleanupFailure) {
          console.error(
            `[${logLabel}] approval cleanup failed after message persistence error:`,
            cleanupFailure.error,
          );
        }
      }

      console.error(
        `[${logLabel}] message persistence failed after approval events:`,
        messageError,
      );
      await completeRun(supabase, { ...baseRunCompletion, status: "partial" });
      return;
    }
  }

  await completeRun(supabase, { ...baseRunCompletion, status: "completed" });

  if (hasExternalDeliverables(contentText, rawParts)) {
    await deliverToExternalChannels(supabase, threadId, clientId, contentText, rawParts)
      .catch((deliveryError) => {
        console.error(`[${logLabel}] external channel delivery failed:`, deliveryError);
      });
  }

  // Drain any queued messages that arrived while this run was active.
  await drainAndContinue(supabase, { clientId, threadId });
  void maybeCompactThread(supabase, clientId, threadId, {
    promptTokens: baseRunCompletion.promptTokens,
    modelId,
  }).catch((compactionError) => {
    console.error(`[${logLabel}] post-run compaction failed:`, compactionError);
  });
}
