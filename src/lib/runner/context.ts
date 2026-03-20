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
import {
  BROWSER_AUTOMATION_PROMPT,
  CRM_SETUP_SYSTEM_PROMPT,
  MARKET_DATA_PROMPT,
  SYSTEM_PROMPT,
} from "@/lib/ai/system-prompt";
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
import {
  discoverUserSkills,
  type SkillMetadata,
} from "@/lib/runner/skills/discover-skills";
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
  includeBrowserAutomation?: boolean;
  includeMarketData?: boolean;
  /** When true, injects CRM config mode notice into the system reminder. */
  crmConfigModeActive?: boolean;
  platformInstructions?: string;
  systemPrompt?: string;
}

interface AssembledContext {
  system: string;
  messages: ModelMessage[];
}

interface AssembleSystemOnlyParams {
  supabase: ChatSupabaseClient;
  threadId: string;
  clientId?: string;
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
  includeBrowserAutomation?: boolean;
  includeMarketData?: boolean;
  platformInstructions?: string;
  systemPrompt?: string;
}

interface HistoryRow {
  message_id: string;
  created_at: string;
  role: string;
  content: string | null;
  parts: Json | null;
}

const allowedRoles: MessageRole[] = ["system", "user", "assistant"];
const MAX_CONTEXT_MESSAGES = 80;

function normalizeRole(role: string): MessageRole {
  return allowedRoles.includes(role as MessageRole) ? (role as MessageRole) : "assistant";
}

interface BuildSystemPromptOptions {
  memory?: MemoryContext;
  userSkills?: SkillMetadata[];
  compactionSummary?: string;
  systemReminder?: string;
  instructions?: string;
  platformInstructions?: string;
  includeBrowserAutomation?: boolean;
  includeMarketData?: boolean;
  systemPrompt?: string;
}

function sanitizeSkillPromptText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatAvailableSkills(userSkills?: SkillMetadata[]): string | null {
  if (!userSkills || userSkills.length === 0) {
    return null;
  }

  const listing = userSkills
    .map((skill) => {
      const safeName = sanitizeSkillPromptText(skill.name);
      const safeDescription = sanitizeSkillPromptText(skill.description);
      const readFileCall = `read_file(${JSON.stringify(skill.path)})`;

      return `- **${safeName}**: ${safeDescription}\n  -> \`${readFileCall}\``;
    })
    .join("\n");

  return `<available-skills>\n${listing}\n</available-skills>`;
}

function buildSystemPrompt({
  memory,
  userSkills,
  compactionSummary,
  systemReminder,
  instructions,
  platformInstructions,
  includeBrowserAutomation,
  includeMarketData,
  systemPrompt,
}: BuildSystemPromptOptions): string {
  const activeSystemPrompt = systemPrompt ?? SYSTEM_PROMPT;
  const activePlatformInstructions = platformInstructions ?? PLATFORM_INSTRUCTIONS;
  const availableSkillsSection = formatAvailableSkills(userSkills);

  if (!memory) {
    const sections = [activeSystemPrompt];

    if (includeBrowserAutomation) {
      sections.push(BROWSER_AUTOMATION_PROMPT);
    }

    if (includeMarketData) {
      sections.push(MARKET_DATA_PROMPT);
    }

    if (instructions && instructions.trim().length > 0) {
      sections.push(instructions.trim());
    }

    if (availableSkillsSection) {
      sections.push(availableSkillsSection);
    }

    return sections.join("\n\n");
  }

  const sections: string[] = [];

  // Layer 1: platform-level operational instructions.
  sections.push(activePlatformInstructions);

  // Layer 2: core personality, tool usage, approvals, and output guidance.
  sections.push(activeSystemPrompt);

  if (includeBrowserAutomation) {
    sections.push(BROWSER_AUTOMATION_PROMPT);
  }

  if (includeMarketData) {
    sections.push(MARKET_DATA_PROMPT);
  }

  if (instructions && instructions.trim().length > 0) {
    sections.push(instructions.trim());
  }

  // Skills change rarely — keep in the stable prefix zone for LLM cache-friendliness.
  if (availableSkillsSection) {
    sections.push(availableSkillsSection);
  }

  // --- Dynamic tail (changes between turns) ---
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

async function loadSystemPromptState({
  supabase,
  threadId,
  clientId,
  crmConfigModeActive,
  includeCompactionState = true,
}: Pick<AssembleContextParams, "supabase" | "threadId" | "clientId" | "crmConfigModeActive"> & {
  includeCompactionState?: boolean;
}): Promise<{
  memoryContext?: MemoryContext;
  userSkills: SkillMetadata[];
  systemReminder?: string;
  compactionState: ThreadCompactionState | null;
}> {
  let memoryContext: MemoryContext | undefined;
  let userSkills: SkillMetadata[] = [];
  let systemReminder: string | undefined;
  let compactionState: ThreadCompactionState | null = null;

  if (!clientId) {
    return { memoryContext, userSkills, systemReminder, compactionState };
  }

  const reminderPromise = buildSystemReminder(supabase, clientId, threadId, {
    crmConfigModeActive,
  });
  const compactionPromise = includeCompactionState
    ? fetchThreadCompactionState(supabase, threadId)
    : Promise.resolve(null);

  await bootstrapMemoryFiles(supabase, clientId);
  [memoryContext, userSkills, systemReminder, compactionState] = await Promise.all([
    loadMemoryContext(supabase, clientId),
    discoverUserSkills(supabase, clientId),
    reminderPromise,
    compactionPromise,
  ]);

  return { memoryContext, userSkills, systemReminder, compactionState };
}

/**
 * Builds only the reusable system layers for an isolated subagent call.
 * Excludes thread history, compaction summary, and parent-specific instructions.
 */
export async function assembleSystemOnly({
  supabase,
  threadId,
  clientId,
  crmConfig,
  crmMode = "normal",
  includeBrowserAutomation,
  includeMarketData,
  platformInstructions,
  systemPrompt,
}: AssembleSystemOnlyParams): Promise<string> {
  const { memoryContext, userSkills, systemReminder } = await loadSystemPromptState({
    supabase,
    threadId,
    clientId,
    includeCompactionState: false,
  });

  return buildSystemPrompt({
    memory: memoryContext,
    userSkills,
    systemReminder,
    platformInstructions: platformInstructions ?? (crmConfig
      ? buildPlatformInstructions(crmConfig)
      : PLATFORM_INSTRUCTIONS),
    includeBrowserAutomation,
    includeMarketData,
    systemPrompt: systemPrompt ?? (crmMode === "setup"
      ? CRM_SETUP_SYSTEM_PROMPT
      : SYSTEM_PROMPT),
  });
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
  includeBrowserAutomation,
  includeMarketData,
  crmConfigModeActive,
  platformInstructions,
  systemPrompt,
}: AssembleContextParams): Promise<AssembledContext> {
  const { memoryContext, userSkills, systemReminder, compactionState } = await loadSystemPromptState({
    supabase,
    threadId,
    clientId,
    crmConfigModeActive,
  });

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
      userSkills,
      compactionSummary: compactionState?.compaction_summary,
      systemReminder,
      instructions,
      includeBrowserAutomation,
      includeMarketData,
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
