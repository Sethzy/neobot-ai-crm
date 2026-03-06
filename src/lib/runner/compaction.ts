/**
 * Thread compaction constants, schemas, and helpers for long-lived runner threads.
 * @module lib/runner/compaction
 */
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { COMPACTION_MODEL, gateway } from "@/lib/ai/gateway";
import { getTextFromParts } from "@/lib/runner/message-utils";
import type { Database, Json } from "@/types/database";

/**
 * Base compaction prompt copied from Codex's local compaction flow.
 * It frames the summarization step as a handoff checkpoint for a future run.
 */
export const SUMMARIZATION_PROMPT = [
  "You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.",
  "",
  "Include:",
  "- Current progress and key decisions made",
  "- Important context, constraints, or user preferences",
  "- What remains to be done (clear next steps)",
  "- Any critical data, examples, or references needed to continue",
  "",
  "Be concise, structured, and focused on helping the next LLM seamlessly continue the work.",
].join("\n");

/**
 * Prefix prepended to compacted summaries so later runs can recognize the
 * stored text as a prior-model handoff instead of an ordinary user message.
 */
export const SUMMARY_PREFIX =
  "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:";

/** Tool results at or above this persisted size are stored as artifacts instead. */
export const ARTIFACT_SIZE_THRESHOLD_BYTES = 5_000;

/** Uncompacted message windows above this count should be summarized. */
export const COMPACTION_MESSAGE_THRESHOLD = 40;

/** The newest messages that always remain verbatim after each compaction pass. */
export const COMPACTION_KEEP_RECENT = 15;

/**
 * CRM-tuned instructions for summary generation.
 * Preserve concrete business state so future runs can recover thread context safely.
 */
export const CRM_COMPACTION_INSTRUCTIONS = [
  "Summarize older CRM conversation context for future agent runs.",
  "Preserve deal names, deal stages, prices, and any decisions or rationale.",
  "Preserve contact names, phone numbers, email addresses, and relationship context.",
  "Preserve task statuses, deadlines, commitments, and follow-up obligations.",
  "Omit filler, but keep concrete facts that affect future work.",
].join(" ");

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

/**
 * Returns true when the provided text matches the persisted handoff-summary format.
 */
export function isSummaryMessage(message: string): boolean {
  return message.startsWith(`${SUMMARY_PREFIX}\n`);
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
    .select([
      "thread_id",
      "client_id",
      "compaction_summary",
      "compaction_compacted_through_at",
      "compaction_compacted_through_message_id",
      "compaction_summary_model",
      "compaction_summary_tokens_used",
    ].join(", "))
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
    .select([
      "thread_id",
      "client_id",
      "compaction_summary",
      "compaction_compacted_through_at",
      "compaction_compacted_through_message_id",
      "compaction_summary_model",
      "compaction_summary_tokens_used",
    ].join(", "))
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
    system: `${SUMMARIZATION_PROMPT}\n\n${CRM_COMPACTION_INSTRUCTIONS}`,
    prompt,
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
): Promise<boolean> {
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

  if (uncompactedRows.length <= COMPACTION_MESSAGE_THRESHOLD) {
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

  const summary = await generateCompactionSummary({
    existingSummary: compactionState?.compaction_summary ?? "",
    messages: rowsToCompact
      .map((row) => ({
        role: row.role,
        content: row.content ?? getTextFromParts(row.parts),
      }))
      .filter((row) => row.content.trim().length > 0),
  });

  if (summary.summaryText.trim().length === 0) {
    return false;
  }

  const prefixedSummary = addSummaryPrefix(summary.summaryText);

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
