/**
 * Context assembly for the runner engine.
 * @module lib/runner/context
 */
import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPlatformInstructions,
  PLATFORM_INSTRUCTIONS,
} from "@/lib/ai/platform-instructions";
import { CRM_SETUP_SYSTEM_PROMPT, SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import type { CrmVocabConfig } from "@/lib/crm/config";
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
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
  platformInstructions?: string;
  systemPrompt?: string;
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
  platformInstructions?: string;
  systemPrompt?: string;
}

function buildSystemPrompt({
  memory,
  compactionSummary,
  systemReminder,
  instructions,
  platformInstructions,
  systemPrompt,
}: BuildSystemPromptOptions): string {
  const activeSystemPrompt = systemPrompt ?? SYSTEM_PROMPT;
  const activePlatformInstructions = platformInstructions ?? PLATFORM_INSTRUCTIONS;

  if (!memory) {
    return instructions
      ? [activeSystemPrompt, instructions.trim()].join("\n\n")
      : activeSystemPrompt;
  }

  const sections: string[] = [];

  // Layer 1: platform-level operational instructions.
  sections.push(activePlatformInstructions);

  // Layer 2: core personality, tool usage, approvals, and output guidance.
  sections.push(activeSystemPrompt);

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

function buildUiMessageParts(row: HistoryRow): UIMessage["parts"] | null {
  if (Array.isArray(row.parts) && row.parts.length > 0) {
    return row.parts as UIMessage["parts"];
  }

  const fallbackText = row.content ?? getTextFromParts(row.parts);
  if (!fallbackText || fallbackText.length === 0) {
    return null;
  }

  return [{ type: "text", text: fallbackText }];
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
  crmConfig,
  crmMode = "normal",
  platformInstructions,
  systemPrompt,
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

  const historyMessages = ((data as HistoryRow[] | null) ?? [])
    .filter((row) => isAfterThreadCompactionBoundary(row, compactionState))
    .slice(0, MAX_CONTEXT_MESSAGES)
    .reverse()
    .map((row) => {
      const parts = buildUiMessageParts(row);
      if (!parts) {
        return null;
      }

      return {
        role: normalizeRole(row.role),
        parts,
      } satisfies Omit<UIMessage, "id">;
    })
    .filter((message): message is Omit<UIMessage, "id"> => message !== null);

  const trimmedCurrentMessage = currentMessage.trim();
  const currentMessageTurn = trimmedCurrentMessage.length > 0
    ? [{
      role: "user" as const,
      parts: [{ type: "text" as const, text: trimmedCurrentMessage }],
    }]
    : [];
  const modelMessages = await convertToModelMessages([
    ...historyMessages,
    ...currentMessageTurn,
  ]);

  return {
    system: buildSystemPrompt({
      memory: memoryContext,
      compactionSummary: compactionState?.compaction_summary,
      systemReminder,
      instructions,
      platformInstructions: platformInstructions ?? (crmConfig
        ? buildPlatformInstructions(crmConfig)
        : PLATFORM_INSTRUCTIONS),
      systemPrompt: systemPrompt ?? (crmMode === "setup"
        ? CRM_SETUP_SYSTEM_PROMPT
        : SYSTEM_PROMPT),
    }),
    messages: modelMessages,
  };
}
