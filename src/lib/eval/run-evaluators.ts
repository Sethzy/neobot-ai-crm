/**
 * Evaluator orchestrator — runs all evaluators for an agent run and writes
 * scores back. Two entry points:
 *
 * - `runEvaluatorsForTrace(traceId)` — legacy Langfuse path. Used by the
 *   trace-driven runner during the H3 → H4 transition.
 * - `runEvaluatorsForEvents(events, runId, supabase, ctx)` — H3 path.
 *   Used by the Managed Agents adapter; reads the in-memory event array
 *   and writes scores into Supabase `run_scores`.
 *
 * Both functions are fire-and-forget safe: they catch their own errors so
 * a broken evaluator never blocks a successful run from completing.
 *
 * @module lib/eval/run-evaluators
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnthropicEvent } from "@/lib/managed-agents/event-types";
import type { Database } from "@/types/database";

import { evaluateCrmHallucination, evaluateCrmHallucinationOnSequence } from "./crm-hallucination-eval";
import { extractToolSequence, extractToolSequenceFromEvents } from "./extract-tool-sequence";
import {
  createScore,
  getObservationsForTrace,
  getTraceById,
} from "./langfuse-api";
import { writeRunScore } from "./run-scores-writer";
import { evaluateSafetyGate, evaluateSafetyGateOnSequence } from "./safety-gate-eval";

/** CRM write tool names that trigger the hallucination evaluator. */
const CRM_WRITE_TOOLS = new Set(["create_record", "update_record"]);

/**
 * Fetch trace data with retries to handle Langfuse ingestion lag.
 * The trace may not be queryable immediately after forceFlush().
 */
async function fetchTraceWithRetry(
  traceId: string,
  maxAttempts = 4,
): Promise<
  [Awaited<ReturnType<typeof getTraceById>>, Awaited<ReturnType<typeof getObservationsForTrace>>]
> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await Promise.all([
        getTraceById(traceId),
        getObservationsForTrace(traceId),
      ]);
    } catch (error) {
      const is404 =
        error instanceof Error && error.message.includes("404");
      if (!is404 || attempt === maxAttempts) throw error;
      // Exponential backoff: 2s, 4s, 8s
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
    }
  }
  // Unreachable — the loop always returns or throws
  throw new Error("fetchTraceWithRetry: unreachable");
}

/**
 * Run all evaluators for a trace and write scores to Langfuse.
 * Safe to call from after() callbacks — never throws.
 */
export async function runEvaluatorsForTrace(traceId: string): Promise<void> {
  try {
    const [trace, observations] = await fetchTraceWithRetry(traceId);

    // ── Safety gate evaluator (always, deterministic, free) ───────────
    const safetyResult = evaluateSafetyGate(observations);

    await createScore({
      traceId,
      name: "safety-gate-bypass",
      value: safetyResult.pass ? 1 : 0,
      dataType: "BOOLEAN",
      comment: safetyResult.pass
        ? "All gated tools had prior ask_user_question"
        : `Violations: ${safetyResult.violations.map((v) => `${v.toolName}: ${v.reason}`).join("; ")}`,
    });

    if (!safetyResult.pass) {
      console.error(
        `[eval] SAFETY GATE BYPASS detected on trace=${traceId}`,
        { violations: safetyResult.violations },
      );
    }

    // ── CRM hallucination evaluator (only if CRM writes present) ─────
    const toolSequence = extractToolSequence(observations);
    const hasCrmWrites = toolSequence.some((t) =>
      CRM_WRITE_TOOLS.has(t.toolName),
    );

    if (hasCrmWrites) {
      const hallucinationResult = await evaluateCrmHallucination(
        trace.input,
        observations,
      );

      await createScore({
        traceId,
        name: "crm-data-grounded",
        value: hallucinationResult.pass ? 1 : 0,
        dataType: "BOOLEAN",
        comment: hallucinationResult.pass
          ? "All CRM writes grounded in conversation context"
          : `Flagged: ${hallucinationResult.flaggedCalls.map((f) => `${f.field}="${f.value}": ${f.reason}`).join("; ")}`,
      });

      if (!hallucinationResult.pass) {
        console.error(
          `[eval] CRM DATA HALLUCINATION detected on trace=${traceId}`,
          { flaggedCalls: hallucinationResult.flaggedCalls },
        );
      }
    }
  } catch (error) {
    // Evaluator infrastructure failure — log and move on
    console.error(`[eval] Evaluator pipeline failed for trace=${traceId}:`, error);
  }
}

export interface RunEvaluatorsForEventsContext {
  /** The user's input as it was passed to the model. Used by the
   *  hallucination evaluator's grounding check. */
  conversationInput: unknown;
}

/**
 * H3 entry point — runs evaluators directly on an in-memory Anthropic
 * Managed Agents event array (no Langfuse round-trip) and writes scores
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
