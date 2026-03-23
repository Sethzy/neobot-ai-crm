/**
 * Thread compaction constants, schemas, and helpers for long-lived runner threads.
 * @module lib/runner/compaction
 */
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { COMPACTION_MODEL, gateway, gatewayProviderOptions } from "@/lib/ai/gateway";
import { getCompactionTextFromParts } from "@/lib/runner/message-utils";
import type { Database, Json } from "@/types/database";

/**
 * Prefix prepended to compacted summaries so later runs can recognize the
 * stored text as a prior-model handoff instead of an ordinary user message.
 */
export const SUMMARY_PREFIX =
  "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:";

/** Fraction of context window that triggers compaction. Deep Agents default: 0.85 */
const COMPACTION_TRIGGER_FRACTION = 0.85;

/** Fallback: fixed token count if model profile unavailable. Deep Agents default: 170000 */
const COMPACTION_TRIGGER_TOKENS_FALLBACK = 170_000;

/** Fallback: message count if no token data. Preserves existing behavior. */
const COMPACTION_MESSAGE_FALLBACK = 80;

/** Known context windows for our models. */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "google/gemini-3-flash": 1_000_000,
  "google/gemini-2.5-flash-lite": 1_000_000,
};

/** Determines whether compaction should be triggered for the current run. */
export function shouldTriggerCompaction(input: {
  promptTokens: number;
  modelId: string;
  messageCount?: number;
}): boolean {
  const { promptTokens, modelId, messageCount } = input;

  // If we have token data, use fraction-based or fixed-token trigger
  if (promptTokens > 0) {
    const contextWindow = MODEL_CONTEXT_WINDOWS[modelId];
    if (contextWindow) {
      return promptTokens >= contextWindow * COMPACTION_TRIGGER_FRACTION;
    }
    return promptTokens >= COMPACTION_TRIGGER_TOKENS_FALLBACK;
  }

  // No token data — fall back to message count
  if (messageCount != null) {
    return messageCount > COMPACTION_MESSAGE_FALLBACK;
  }

  return false;
}

/** The newest messages that always remain verbatim after each compaction pass. */
export const COMPACTION_KEEP_RECENT = 30;

/**
 * Structured compaction summary instructions matching Tasklet's 4-section format.
 * Replaces the free-form SUMMARIZATION_PROMPT + CRM_COMPACTION_INSTRUCTIONS combo.
 */
export const STRUCTURED_SUMMARY_INSTRUCTIONS = [
  "You are performing a CONTEXT CHECKPOINT COMPACTION for a real estate CRM agent.",
  "Create a structured handoff summary for another LLM that will resume the work.",
  "",
  "You MUST use exactly these four sections:",
  "",
  "## User Instructions",
  "Explicit user preferences, boundaries, communication style, and standing orders.",
  "Include any constraints the user has stated.",
  "",
  "## Workflow",
  "Current progress, key decisions made, and what remains to be done.",
  "Preserve deal names, deal stages, prices, and rationale.",
  "Preserve contact names, phone numbers, emails, and relationship context.",
  "Preserve task statuses, deadlines, commitments, and follow-up obligations.",
  "",
  "## Resources",
  "Important data, file paths, references, trigger configurations, and connection state.",
  "Include any tool call IDs or storage paths the agent may need to recover data from.",
  "",
  "## Current Focus",
  "Clear next steps for the resuming LLM. What should it do first?",
  "",
  "Be concise. Omit filler. Keep concrete facts that affect future work.",
].join("\n");

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Parsed thread row shape when a compaction summary is present. */
export const threadCompactionStateSchema = z.object({
  thread_id: uuidSchema,
  client_id: uuidSchema,
  compaction_summary: z.string().min(1),
  compaction_compacted_through_at: isoDateTimeSchema,
  compaction_compacted_through_message_id: uuidSchema,
  compaction_summary_model: z.string().min(1),
  compaction_summary_tokens_used: z.number().int().nonnegative(),
});

/** Thread-level compaction state derived from the database row. */
export type ThreadCompactionState = z.infer<typeof threadCompactionStateSchema>;

type ChatSupabaseClient = SupabaseClient<Database>;

const COMPACTION_STATE_COLUMNS = [
  "thread_id",
  "client_id",
  "compaction_summary",
  "compaction_compacted_through_at",
  "compaction_compacted_through_message_id",
  "compaction_summary_model",
  "compaction_summary_tokens_used",
].join(", ");

export interface PersistThreadCompactionStateInput {
  threadId: string;
  clientId: string;
  summaryText: string;
  compactedThroughAt: string;
  compactedThroughMessageId: string;
  model: string;
  tokensUsed: number;
}

export interface GenerateCompactionSummaryInput {
  existingSummary?: string;
  messages: Array<{ role: string; content: string }>;
}

export interface GeneratedCompactionSummary {
  summaryText: string;
  tokensUsed: number;
  model: string;
}

interface CompactionMessageRow {
  message_id: string;
  created_at: string;
  role: string;
  content: string | null;
  parts: Json | null;
}

function getCompactionContentFromRow(row: CompactionMessageRow): string {
  if (Array.isArray(row.parts) && row.parts.length > 0) {
    return getCompactionTextFromParts(row.parts);
  }

  return row.content ?? "";
}

/**
 * Returns true when the provided text matches the persisted handoff-summary format.
 */
export function isSummaryMessage(message: string): boolean {
  return message.startsWith(`${SUMMARY_PREFIX}\n`);
}

/**
 * Returns true when the message content is a trigger-event envelope
 * injected by the trigger executor (not user conversation).
 */
export function isTriggerEventMessage(content: string): boolean {
  return content.trimStart().startsWith("<trigger-event>");
}

/**
 * Mechanically prunes trigger-event messages into a compact `<context-removed>` summary.
 * Only preserves trigger name and type — full payloads are discarded during compaction.
 */
export function pruneTriggerEvents(
  triggerMessages: Array<{ role: string; content: string }>,
): string {
  if (triggerMessages.length === 0) return "";

  const entries = triggerMessages.map((msg) => {
    const nameMatch = msg.content.match(/trigger_name:\s*(.+)/);
    const typeMatch = msg.content.match(/trigger_type:\s*(.+)/);
    const name = nameMatch?.[1]?.trim() ?? "unknown";
    const type = typeMatch?.[1]?.trim() ?? "unknown";
    return `${name} (${type})`;
  });

  return [
    "<context-removed>",
    `Omitted ${triggerMessages.length} trigger invocation(s) to reduce context size:`,
    ...entries.map((entry) => `- ${entry}`),
    "</context-removed>",
  ].join("\n");
}

function addSummaryPrefix(message: string): string {
  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    return "";
  }

  return `${SUMMARY_PREFIX}\n${trimmedMessage}`;
}

function stripSummaryPrefix(message: string): string {
  if (!isSummaryMessage(message)) {
    return message;
  }

  return message.slice(`${SUMMARY_PREFIX}\n`.length).trim();
}

/**
 * Loads the current thread-level compaction state, if one exists.
 */
export async function fetchThreadCompactionState(
  supabase: ChatSupabaseClient,
  threadId: string,
): Promise<ThreadCompactionState | null> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select(COMPACTION_STATE_COLUMNS)
    .eq("thread_id", threadId)
    .maybeSingle();

  const threadRow = data as Record<string, unknown> | null;

  if (error || !threadRow || threadRow.compaction_summary == null) {
    return null;
  }

  return threadCompactionStateSchema.parse(threadRow);
}

/**
 * Persists the latest summary and cutoff boundary onto the owning thread row.
 */
export async function persistThreadCompactionState(
  supabase: ChatSupabaseClient,
  input: PersistThreadCompactionStateInput,
): Promise<ThreadCompactionState> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .update({
      compaction_summary: input.summaryText,
      compaction_compacted_through_at: input.compactedThroughAt,
      compaction_compacted_through_message_id: input.compactedThroughMessageId,
      compaction_summary_model: input.model,
      compaction_summary_tokens_used: input.tokensUsed,
    })
    .eq("thread_id", input.threadId)
    .eq("client_id", input.clientId)
    .select(COMPACTION_STATE_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to persist thread compaction state");
  }

  return threadCompactionStateSchema.parse(data as unknown as Record<string, unknown>);
}

function buildCompactionPrompt(input: GenerateCompactionSummaryInput): string {
  const sections: string[] = [];
  const existingSummary = stripSummaryPrefix(input.existingSummary?.trim() ?? "");

  if (existingSummary.length > 0) {
    sections.push(["<existing-summary>", existingSummary, "</existing-summary>"].join("\n"));
  }

  const transcript = input.messages
    .map(({ role, content }) => `${role}: ${content}`)
    .join("\n");

  if (transcript.length > 0) {
    sections.push(["<new-messages>", transcript, "</new-messages>"].join("\n"));
  }

  return sections.join("\n\n");
}

export function isAfterThreadCompactionBoundary(
  row: Pick<CompactionMessageRow, "created_at" | "message_id">,
  compactionState?: ThreadCompactionState | null,
): boolean {
  if (!compactionState) {
    return true;
  }

  if (row.created_at > compactionState.compaction_compacted_through_at) {
    return true;
  }

  if (row.created_at < compactionState.compaction_compacted_through_at) {
    return false;
  }

  return row.message_id > compactionState.compaction_compacted_through_message_id;
}

/**
 * Generates an updated compaction summary from the previous summary plus newly compacted messages.
 */
export async function generateCompactionSummary(
  input: GenerateCompactionSummaryInput,
): Promise<GeneratedCompactionSummary> {
  const prompt = buildCompactionPrompt(input);

  if (prompt.trim().length === 0) {
    return {
      summaryText: "",
      tokensUsed: 0,
      model: COMPACTION_MODEL,
    };
  }

  const result = await generateText({
    model: gateway(COMPACTION_MODEL),
    system: STRUCTURED_SUMMARY_INSTRUCTIONS,
    prompt,
    providerOptions: gatewayProviderOptions,
    experimental_telemetry: { isEnabled: true },
  });

  return {
    summaryText: result.text,
    tokensUsed: result.usage?.totalTokens ?? 0,
    model: COMPACTION_MODEL,
  };
}

/**
 * Summarizes the uncompacted portion of a thread when the rolling window exceeds the threshold.
 */
export async function maybeCompactThread(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
  modelId?: string,
): Promise<boolean> {
  // Query the latest run's prompt_tokens for fraction-based triggering.
  // Cast needed: prompt_tokens column is added by migration but not yet in generated DB types.
  const { data: lastRun } = await supabase
    .from("runs")
    .select("prompt_tokens, model")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastRunRow = lastRun as { prompt_tokens?: number | null; model?: string | null } | null;
  const promptTokens = lastRunRow?.prompt_tokens ?? 0;
  const runModelId = modelId ?? lastRunRow?.model ?? "";

  const compactionState = await fetchThreadCompactionState(supabase, threadId);

  let messageQuery = supabase
    .from("conversation_messages")
    .select("message_id, created_at, role, content, parts")
    .eq("thread_id", threadId);

  if (compactionState) {
    messageQuery = messageQuery.gte(
      "created_at",
      compactionState.compaction_compacted_through_at,
    );
  }

  const { data, error } = await messageQuery
    .order("created_at", { ascending: true })
    .order("message_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load thread messages for compaction: ${error.message}`);
  }

  const uncompactedRows = ((data as CompactionMessageRow[] | null) ?? [])
    .filter((row) => isAfterThreadCompactionBoundary(row, compactionState));

  const shouldCompact = shouldTriggerCompaction({
    promptTokens,
    modelId: runModelId,
    messageCount: uncompactedRows.length,
  });

  if (!shouldCompact) {
    return false;
  }

  const rowsToCompact = uncompactedRows.slice(
    0,
    Math.max(0, uncompactedRows.length - COMPACTION_KEEP_RECENT),
  );
  const lastCompactedRow = rowsToCompact.at(-1);

  if (!lastCompactedRow) {
    return false;
  }

  const allMessages = rowsToCompact
    .map((row) => ({
      role: row.role,
      content: getCompactionContentFromRow(row),
    }))
    .filter((row) => row.content.trim().length > 0);

  const triggerMessages = allMessages.filter(
    (msg) => msg.role === "system" && isTriggerEventMessage(msg.content),
  );
  const conversationMessages = allMessages.filter(
    (msg) => msg.role !== "system" || !isTriggerEventMessage(msg.content),
  );

  const summary = await generateCompactionSummary({
    existingSummary: compactionState?.compaction_summary ?? "",
    messages: conversationMessages,
  });

  const prunedTriggerSummary = pruneTriggerEvents(triggerMessages);

  const combinedSummary = [summary.summaryText, prunedTriggerSummary]
    .filter((s) => s.trim().length > 0)
    .join("\n\n");

  if (combinedSummary.trim().length === 0) {
    return false;
  }

  const prefixedSummary = addSummaryPrefix(combinedSummary);

  await persistThreadCompactionState(supabase, {
    threadId,
    clientId,
    summaryText: prefixedSummary,
    compactedThroughAt: lastCompactedRow.created_at,
    compactedThroughMessageId: lastCompactedRow.message_id,
    model: summary.model,
    tokensUsed: summary.tokensUsed,
  });

  return true;
}
