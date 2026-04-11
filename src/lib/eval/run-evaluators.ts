/**
 * Evaluator orchestrator — runs all evaluators for a managed-agent run and
 * writes scores into Supabase `run_scores`.
 *
 * This is the H4 event-driven path only. The legacy trace round-trip
 * has been removed so evaluators now read directly from the terminal event
 * array already held in memory by the adapter/listener.
 *
 * @module lib/eval/run-evaluators
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnthropicEvent } from "@/lib/managed-agents/event-types";
import type { Database } from "@/types/database";

import { evaluateCrmHallucinationOnSequence } from "./crm-hallucination-eval";
import { extractToolSequenceFromEvents } from "./extract-tool-sequence";
import { writeRunScore } from "./run-scores-writer";
import { evaluateSafetyGateOnSequence } from "./safety-gate-eval";

/** CRM write tool names that trigger the hallucination evaluator. */
const CRM_WRITE_TOOLS = new Set(["create_record", "update_record"]);

export interface RunEvaluatorsForEventsContext {
  /** The user's input as it was passed to the model. Used by the
   *  hallucination evaluator's grounding check. */
  conversationInput: unknown;
}

/**
 * H3 entry point — runs evaluators directly on an in-memory Anthropic
 * Managed Agents event array (no external trace round-trip) and writes scores
 * into Supabase `run_scores`. Fire-and-forget safe: never throws.
 */
export async function runEvaluatorsForEvents(
  events: ReadonlyArray<AnthropicEvent>,
  runId: string,
  supabase: SupabaseClient<Database>,
  context: RunEvaluatorsForEventsContext,
): Promise<void> {
  try {
    const sequence = extractToolSequenceFromEvents(events);

    // ── Safety gate evaluator (always, deterministic, free) ───────────
    const safety = evaluateSafetyGateOnSequence(sequence);
    await writeRunScore(supabase, runId, {
      evaluator_name: "safety-gate-bypass",
      score_type: "boolean",
      score_value: safety.pass ? 1 : 0,
      comment: safety.pass
        ? "All gated tools had prior ask_user_question"
        : `Violations: ${safety.violations.map((v) => `${v.toolName}: ${v.reason}`).join("; ")}`,
    });

    if (!safety.pass) {
      console.error(`[eval] SAFETY GATE BYPASS detected on run=${runId}`, {
        violations: safety.violations,
      });
    }

    // ── CRM hallucination evaluator (only if CRM writes present) ─────
    const hasCrmWrites = sequence.some((r) => CRM_WRITE_TOOLS.has(r.toolName));
    if (hasCrmWrites) {
      const hallucination = await evaluateCrmHallucinationOnSequence(
        context.conversationInput,
        sequence,
      );

      await writeRunScore(supabase, runId, {
        evaluator_name: "crm-data-grounded",
        score_type: "boolean",
        score_value: hallucination.pass ? 1 : 0,
        comment: hallucination.pass
          ? "All CRM writes grounded in conversation context"
          : `Flagged: ${hallucination.flaggedCalls.map((f) => `${f.field}="${f.value}": ${f.reason}`).join("; ")}`,
      });

      if (!hallucination.pass) {
        console.error(`[eval] CRM DATA HALLUCINATION detected on run=${runId}`, {
          flaggedCalls: hallucination.flaggedCalls,
        });
      }
    }
  } catch (error) {
    console.error(`[eval] runEvaluatorsForEvents failed for run=${runId}:`, error);
  }
}
