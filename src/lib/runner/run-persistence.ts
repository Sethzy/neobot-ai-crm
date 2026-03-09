/**
 * Shared post-inference persistence logic for run-agent and run-autopilot.
 * Builds assistant parts, truncates oversized tool outputs, persists the
 * assistant message, completes the run, drains queued messages, and fires
 * background compaction.
 * @module lib/runner/run-persistence
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createApprovalEvent } from "@/lib/approvals/queries";
import { createMessages } from "@/lib/chat/messages";
import { maybeCompactThread } from "@/lib/runner/compaction";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import {
  buildAssistantPartsFromSteps,
  getAssistantTextFromParts,
  type PersistedPart,
  type StepLike,
} from "@/lib/runner/message-utils";
import { completeRun } from "@/lib/runner/run-lifecycle";
import {
  saveToolcallBlock,
  truncateOversizedParts,
} from "@/lib/runner/toolcall-artifacts";
import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface FinalizeRunInput {
  supabase: ChatSupabaseClient;
  clientId: string;
  threadId: string;
  runId: string;
  modelId: string;
  steps: ReadonlyArray<StepLike>;
  text: string;
  totalUsage: { inputTokens?: number; outputTokens?: number };
  logLabel: string;
}

/**
 * Extracts approval-gated tool requests from normalized assistant parts.
 */
export function extractApprovalRequests(
  parts: ReadonlyArray<PersistedPart>,
): ApprovalRequest[] {
  return parts.flatMap((part) => {
    if (part.state !== "approval-requested") {
      return [];
    }

    const approval = typeof part.approval === "object" && part.approval !== null
      ? part.approval as { id?: unknown }
      : null;
    const approvalId = typeof approval?.id === "string" ? approval.id : null;
    const partType = typeof part.type === "string" ? part.type : "";

    if (!approvalId || !partType.startsWith("tool-")) {
      return [];
    }

    return [{
      approvalId,
      toolName: partType.slice(5),
      toolInput: typeof part.input === "object" && part.input !== null
        ? part.input as Record<string, unknown>
        : {},
    }];
  });
}

/**
 * Shared post-inference persistence: build parts, truncate oversized outputs,
 * persist the assistant message, complete the run, drain queue, and compact.
 */
export async function finalizeRun({
  supabase,
  clientId,
  threadId,
  runId,
  modelId,
  steps,
  text,
  totalUsage,
  logLabel,
}: FinalizeRunInput): Promise<void> {
  const rawParts = buildAssistantPartsFromSteps(steps);

  // Block storage: save ALL tool call args + results to storage.
  // Start early so uploads overlap with truncation work, but await completion
  // before finalizeRun returns so recovery data is actually durable.
  const toolParts = rawParts.filter(
    (part) =>
      part.state === "output-available" &&
      typeof part.toolCallId === "string",
  );
  const blockStoragePromise = toolParts.length > 0
    ? Promise.all(
      toolParts.map((part) =>
        saveToolcallBlock(
          supabase,
          clientId,
          part.toolCallId as string,
          part.input ?? null,
          part.output ?? null,
        ),
      ),
    )
    : null;

  let parts: PersistedPart[] = rawParts;

  try {
    const truncatedResult = await truncateOversizedParts(supabase, clientId, rawParts);
    parts = truncatedResult.parts;
  } catch (artifactError) {
    console.error(`[${logLabel}] toolcall artifact persistence failed:`, artifactError);
  }

  if (blockStoragePromise) {
    try {
      await blockStoragePromise;
    } catch (blockStorageError) {
      console.error(`[${logLabel}] block storage failed:`, blockStorageError);
    }
  }

  const contentTextFromParts = getAssistantTextFromParts(parts);
  const fallbackContentText = typeof text === "string" ? text.trim() : "";
  const contentText = contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText;
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

  const approvalRequests = extractApprovalRequests(parts);
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
      await completeRun(supabase, {
        runId,
        status: "partial",
        model: modelId,
        tokensIn: totalUsage.inputTokens ?? 0,
        tokensOut: totalUsage.outputTokens ?? 0,
        stepCount: steps.length,
      });
      return;
    }
  }

  await completeRun(supabase, {
    runId,
    status: "completed",
    model: modelId,
    tokensIn: totalUsage.inputTokens ?? 0,
    tokensOut: totalUsage.outputTokens ?? 0,
    stepCount: steps.length,
  });

  // Drain any queued messages that arrived while this run was active.
  await drainAndContinue(supabase, { clientId, threadId });
  void maybeCompactThread(supabase, clientId, threadId).catch((compactionError) => {
    console.error(`[${logLabel}] post-run compaction failed:`, compactionError);
  });
}
