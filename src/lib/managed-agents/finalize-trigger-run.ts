/**
 * Terminal-state finalization for trigger-run Managed Agents sessions.
 *
 * The session runner owns live event consumption and tool dispatch. This
 * helper persists the final run status, records cost totals, and runs the
 * existing event-based evaluator pipeline once the session reaches a
 * terminal state.
 *
 * @module lib/managed-agents/finalize-trigger-run
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { runEvaluatorsForEvents } from "@/lib/eval/run-evaluators";
import { completeRun } from "@/lib/runner/run-lifecycle";
import type { Database } from "@/types/database";

import { computeTurnCost } from "./adapter-cost";
import type { AnthropicEvent } from "./event-types";

const MANAGED_AGENT_MODEL = "claude-sonnet-4-6";

export interface FinalizedRunCost {
  inputTokens: number;
  outputTokens: number;
  runtimeSeconds: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

function getConversationInput(events: ReadonlyArray<AnthropicEvent>): string {
  return events
    .filter((event): event is Extract<AnthropicEvent, { type: "user.message" }> =>
      event.type === "user.message",
    )
    .flatMap((event) => event.content)
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

function getTerminalRunStatus(
  events: ReadonlyArray<AnthropicEvent>,
): "completed" | "failed" {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "session.status_idle") {
      return event.stop_reason.type === "end_turn" ? "completed" : "failed";
    }

    if (
      event.type === "session.status_terminated" ||
      event.type === "session.error"
    ) {
      return "failed";
    }
  }

  return "failed";
}

export async function finalizeTriggerRun(
  supabase: SupabaseClient<Database>,
  runId: string,
  events: unknown[],
  cost: FinalizedRunCost,
): Promise<void> {
  const typedEvents = events as AnthropicEvent[];
  const status = getTerminalRunStatus(typedEvents);

  await completeRun(supabase, {
    runId,
    status,
    model: MANAGED_AGENT_MODEL,
    tokensIn: cost.inputTokens,
    tokensOut: cost.outputTokens,
    cacheReadTokens: cost.cacheReadInputTokens ?? 0,
    costUsd: computeTurnCost({
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      cacheReadInputTokens: cost.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: cost.cacheCreationInputTokens ?? 0,
      activeSeconds: cost.runtimeSeconds,
    }),
  });

  if (status !== "completed") {
    return;
  }

  await runEvaluatorsForEvents(typedEvents, runId, supabase, {
    conversationInput: getConversationInput(typedEvents),
  });
}
