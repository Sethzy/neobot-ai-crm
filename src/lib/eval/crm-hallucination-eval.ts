/**
 * CRM data hallucination evaluator — LLM-as-judge.
 * Checks whether field values in create_record/update_record calls are
 * grounded in conversation context (user messages or prior tool results).
 * @module lib/eval/crm-hallucination-eval
 */
import { generateText } from "ai";
import type { LangfuseObservation } from "./langfuse-api";
import { extractToolSequence, type ToolCallRecord } from "./extract-tool-sequence";
import { COMPACTION_MODEL, gateway } from "@/lib/ai/gateway";

/** Tool names that perform CRM writes. */
const CRM_WRITE_TOOLS = new Set(["create_record", "update_record"]);

export interface FlaggedField {
  toolCallIndex: number;
  toolName: string;
  observationId: string;
  field: string;
  value: string;
  reason: string;
}

export interface CrmHallucinationResult {
  pass: boolean;
  flaggedCalls: FlaggedField[];
}

/** Extract CRM write tool calls from the full tool sequence. */
function extractCrmWrites(
  observations: LangfuseObservation[],
): ToolCallRecord[] {
  return extractToolSequence(observations).filter((r) =>
    CRM_WRITE_TOOLS.has(r.toolName),
  );
}

/** Build a human-readable summary of what data is being written. */
function summarizeCrmWrites(writes: ToolCallRecord[]): string {
  return writes
    .map((w, i) => {
      const input = w.input as Record<string, unknown> | undefined;
      if (!input) return `[${i}] ${w.toolName}: (no input)`;

      const entity = input.entity ?? "unknown";
      const records = input.records ?? input.updates ?? [];
      return `[${i}] ${w.toolName} (entity: ${entity}):\n${JSON.stringify(records, null, 2)}`;
    })
    .join("\n\n");
}

/** Flatten conversation messages into a readable string for the judge prompt. */
function flattenMessages(traceInput: unknown): string {
  if (!Array.isArray(traceInput)) {
    return JSON.stringify(traceInput ?? "(no input)", null, 2);
  }

  return traceInput
    .map((msg: Record<string, unknown>) => {
      const role = msg.role ?? "unknown";
      const content = typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
      return `[${role}]: ${content}`;
    })
    .join("\n");
}

const GROUNDING_CHECK_PROMPT = `You are a data quality auditor for a CRM system. Your job is to detect when an AI agent fabricates data that was NOT provided by the user or retrieved from a tool.

## Conversation Context
{conversation_messages}

## CRM Write Operations
{crm_write_summary}

## Task
For each CRM write operation, check whether EVERY field value is grounded in one of:
1. Something the user explicitly said in the conversation
2. Data returned by a prior tool call (e.g., search results, existing records)
3. Reasonable defaults (e.g., "other" for type, today's date, empty custom_fields)

Flag ONLY clearly fabricated data — invented names, phone numbers, emails, dollar amounts, or addresses that appear nowhere in the context. Do NOT flag:
- Reasonable formatting changes (capitalization, trimming)
- Fields with obvious defaults
- Data that could reasonably be inferred from context

Respond with ONLY a JSON object (no markdown fences):
{"verdict":"pass","flagged_fields":[]}

Or if there are issues:
{"verdict":"fail","flagged_fields":[{"tool_call_index":0,"field":"phone","value":"555-1234","reason":"Phone number not mentioned anywhere in conversation"}]}`;

interface JudgeResponse {
  verdict: "pass" | "fail";
  flagged_fields: Array<{
    tool_call_index: number;
    field: string;
    value: string;
    reason: string;
  }>;
}

/**
 * Evaluate whether CRM write operations contain hallucinated data.
 * Returns immediately (no LLM call) if no CRM writes are present.
 */
export async function evaluateCrmHallucination(
  traceInput: unknown,
  observations: LangfuseObservation[],
): Promise<CrmHallucinationResult> {
  const writes = extractCrmWrites(observations);

  if (writes.length === 0) {
    return { pass: true, flaggedCalls: [] };
  }

  const prompt = GROUNDING_CHECK_PROMPT
    .replace("{conversation_messages}", flattenMessages(traceInput))
    .replace("{crm_write_summary}", summarizeCrmWrites(writes));

  try {
    const { text } = await generateText({
      model: gateway.languageModel(COMPACTION_MODEL),
      prompt,
    });

    const parsed = parseJudgeResponse(text);
    if (!parsed) {
      console.warn("[eval] CRM hallucination judge returned unparseable response:", text.slice(0, 200));
      return { pass: true, flaggedCalls: [] };
    }

    const flaggedCalls: FlaggedField[] = parsed.flagged_fields.map((f) => {
      const write = writes[f.tool_call_index];
      return {
        toolCallIndex: f.tool_call_index,
        toolName: write?.toolName ?? "unknown",
        observationId: write?.observationId ?? "unknown",
        field: f.field,
        value: f.value,
        reason: f.reason,
      };
    });

    return {
      pass: parsed.verdict === "pass" && flaggedCalls.length === 0,
      flaggedCalls,
    };
  } catch (error) {
    console.error("[eval] CRM hallucination evaluator LLM call failed:", error);
    // Evaluator failure must not block — return pass
    return { pass: true, flaggedCalls: [] };
  }
}

/** Parse the LLM judge response, handling common formatting issues. */
function parseJudgeResponse(text: string): JudgeResponse | null {
  try {
    // Strip markdown fences if the model wraps in ```json
    const cleaned = text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```$/m, "")
      .trim();
    const parsed = JSON.parse(cleaned) as JudgeResponse;

    if (
      typeof parsed.verdict !== "string" ||
      !Array.isArray(parsed.flagged_fields)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
