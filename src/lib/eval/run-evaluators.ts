/**
 * Evaluator orchestrator — runs all evaluators for a given Langfuse trace
 * and writes scores back. Used by both the online (after() callback) and
 * offline (CLI script) paths.
 *
 * This function is fire-and-forget safe: it never throws. Evaluator failures
 * are logged but do not affect the user.
 * @module lib/eval/run-evaluators
 */
import {
  getTraceById,
  getObservationsForTrace,
  createScore,
} from "./langfuse-api";
import { evaluateSafetyGate } from "./safety-gate-eval";
import { evaluateCrmHallucination } from "./crm-hallucination-eval";
import { extractToolSequence } from "./extract-tool-sequence";

/** CRM write tool names that trigger the hallucination evaluator. */
const CRM_WRITE_TOOLS = new Set(["create_record", "update_record"]);

/**
 * Run all evaluators for a trace and write scores to Langfuse.
 * Safe to call from after() callbacks — never throws.
 */
export async function runEvaluatorsForTrace(traceId: string): Promise<void> {
  try {
    const [trace, observations] = await Promise.all([
      getTraceById(traceId),
      getObservationsForTrace(traceId),
    ]);

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
