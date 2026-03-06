/**
 * Context assembly for the runner engine.
 * @module lib/runner/context
 */
import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PLATFORM_INSTRUCTIONS } from "@/lib/ai/platform-instructions";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { bootstrapMemoryFiles } from "@/lib/memory/bootstrap";
import { loadMemoryContext } from "@/lib/memory/loader";
import type { MemoryContext } from "@/lib/memory/loader";
import {
  fetchThreadCompactionState,
  isAfterThreadCompactionBoundary,
  type ThreadCompactionState,
} from "@/lib/runner/compaction";
import { getTextFromParts } from "@/lib/runner/message-utils";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type MessageRole = "system" | "user" | "assistant";

interface AssembleContextParams {
  supabase: ChatSupabaseClient;
  threadId: string;
  currentMessage: string;
  clientId?: string;
  instructions?: string;
}

interface AssembledContext {
  system: string;
  messages: ModelMessage[];
}

interface HistoryRow {
  message_id: string;
  created_at: string;
  role: string;
  content: string | null;
  parts: Json | null;
}

const allowedRoles: MessageRole[] = ["system", "user", "assistant"];
const MAX_CONTEXT_MESSAGES = 240;

function normalizeRole(role: string): MessageRole {
  return allowedRoles.includes(role as MessageRole) ? (role as MessageRole) : "assistant";
}

interface BuildSystemPromptOptions {
  memory?: MemoryContext;
  compactionSummary?: string;
  systemReminder?: string;
  instructions?: string;
}

function buildSystemPrompt({
  memory,
  compactionSummary,
  systemReminder,
  instructions,
}: BuildSystemPromptOptions): string {
  if (!memory) {
    return instructions
      ? [SYSTEM_PROMPT, instructions.trim()].join("\n\n")
      : SYSTEM_PROMPT;
  }

  const sections: string[] = [];

  // Layer 1: platform-level operational instructions.
  sections.push(PLATFORM_INSTRUCTIONS);

  // Layer 2: core personality, tool usage, approvals, and output guidance.
  sections.push(SYSTEM_PROMPT);

  if (instructions && instructions.trim().length > 0) {
    sections.push(instructions.trim());
  }

  if (memory.soul.length > 0) {
    sections.push(`<soul>\n${memory.soul}\n</soul>`);
  }

  if (memory.user.length > 0) {
    sections.push(`<user-profile>\n${memory.user}\n</user-profile>`);
  }

  if (memory.memory.length > 0) {
    sections.push(`<working-memory>\n${memory.memory}\n</working-memory>`);
  }

  if (compactionSummary && compactionSummary.trim().length > 0) {
    sections.push(`<compaction-summary>\n${compactionSummary.trim()}\n</compaction-summary>`);
  }

  if (systemReminder) {
    sections.push(systemReminder);
  }

  return sections.join("\n\n");
}

/**
 * Builds the runner context from persisted thread history plus the inbound message.
 */
export async function assembleContext({
  supabase,
  threadId,
  currentMessage,
  clientId,
  instructions,
}: AssembleContextParams): Promise<AssembledContext> {
  let memoryContext: MemoryContext | undefined;
  let systemReminder: string | undefined;
  let compactionState: ThreadCompactionState | null = null;

  if (clientId) {
    // Bootstrap must complete before loadMemoryContext reads the files it seeds.
    // buildSystemReminder and fetchThreadCompactionState are independent — start them early.
    const reminderPromise = buildSystemReminder(supabase, clientId, threadId);
    const compactionPromise = fetchThreadCompactionState(supabase, threadId);

    await bootstrapMemoryFiles(supabase, clientId);
    [memoryContext, systemReminder, compactionState] = await Promise.all([
      loadMemoryContext(supabase, clientId),
      reminderPromise,
      compactionPromise,
    ]);
  }

  let historyQuery = supabase
    .from("conversation_messages")
    .select("message_id, created_at, role, content, parts")
    .eq("thread_id", threadId);

  if (compactionState) {
    historyQuery = historyQuery.gte(
      "created_at",
      compactionState.compaction_compacted_through_at,
    );
  }

  const { data, error } = await historyQuery
    .order("created_at", { ascending: false })
    .order("message_id", { ascending: false })
    .limit(MAX_CONTEXT_MESSAGES);

  if (error) {
    throw new Error(`Failed to load thread history: ${error.message}`);
  }

  const historyMessages: ModelMessage[] = ((data as HistoryRow[] | null) ?? [])
    .filter((row) => isAfterThreadCompactionBoundary(row, compactionState))
    .slice(0, MAX_CONTEXT_MESSAGES)
    .reverse()
    .map((row) => ({
      role: normalizeRole(row.role),
      content: row.content ?? getTextFromParts(row.parts),
    }));

  const trimmedCurrentMessage = currentMessage.trim();
  const currentMessageTurn = trimmedCurrentMessage.length > 0
    ? [{
      role: "user" as const,
      content: trimmedCurrentMessage,
    }]
    : [];

  return {
    system: buildSystemPrompt({
      memory: memoryContext,
      compactionSummary: compactionState?.compaction_summary,
      systemReminder,
      instructions,
    }),
    messages: [
      ...historyMessages,
      ...currentMessageTurn,
    ],
  };
}
