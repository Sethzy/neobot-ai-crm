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
import { isModelVisible } from "@/lib/chat/attachment-config";
import {
  BROWSER_AUTOMATION_PROMPT,
  CRM_SETUP_SYSTEM_PROMPT,
  MARKET_DATA_PROMPT,
  PROPERTY_LISTING_PROMPT,
  SANDBOX_PROMPT,
  SYSTEM_PROMPT,
} from "@/lib/ai/system-prompt";
import type { CrmVocabConfig } from "@/lib/crm/config";
import { escapeXml } from "@/lib/runner/system-reminder";
import { loadMemoryContext } from "@/lib/memory/loader";
import type { MemoryContext } from "@/lib/memory/loader";
import {
  fetchThreadMetadata,
  isAfterThreadCompactionBoundary,
  type ThreadCompactionState,
  type ThreadMetadata,
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

/** Return type of {@link loadSystemPromptState} so callers can pre-load and pass it in. */
export type PreloadedSystemPromptState = Awaited<ReturnType<typeof loadSystemPromptState>>;

interface AssembleContextParams {
  supabase: ChatSupabaseClient;
  threadId: string;
  currentMessage: string;
  currentMessageParts?: UIMessage["parts"];
  clientId?: string;
  instructions?: string;
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
  includeBrowserAutomation?: boolean;
  includeMarketData?: boolean;
  includePropertyListings?: boolean;
  includeSandbox?: boolean;
  platformInstructions?: string;
  systemPrompt?: string;
  /** Pre-loaded state from {@link loadSystemPromptState} — skips redundant IO when provided. */
  preloadedState?: PreloadedSystemPromptState;
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
  includePropertyListings?: boolean;
  includeSandbox?: boolean;
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
const MAX_CONTEXT_MESSAGES = 240;

/** Threads idle for longer than this are treated as stale — old messages are skipped. */
const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours — matches Dorabot pattern

function normalizeRole(role: string): MessageRole {
  return allowedRoles.includes(role as MessageRole) ? (role as MessageRole) : "assistant";
}

interface BuildSystemPromptOptions {
  userSkills?: SkillMetadata[];
  instructions?: string;
  platformInstructions?: string;
  includeBrowserAutomation?: boolean;
  includeMarketData?: boolean;
  includePropertyListings?: boolean;
  includeSandbox?: boolean;
  systemPrompt?: string;
}

function sanitizeSkillPromptText(value: string): string {
  return escapeXml(value.trim().replace(/\s+/g, " "));
}

function formatAvailableSkills(userSkills?: SkillMetadata[]): string | null {
  if (!userSkills || userSkills.length === 0) {
    return null;
  }

  const listing = userSkills
    .map((skill) => {
      const safeName = sanitizeSkillPromptText(skill.name);
      const safeDescription = sanitizeSkillPromptText(skill.description);
      const hint = `read_file(${JSON.stringify(skill.path)})`;

      return `- **${safeName}** (slug: ${skill.slug ?? skill.name}): ${safeDescription}\n  -> \`${hint}\``;
    })
    .join("\n");

  return `<available-skills>\n${listing}\n</available-skills>`;
}

function buildSystemPrompt({
  userSkills,
  instructions,
  platformInstructions,
  includeBrowserAutomation,
  includeMarketData,
  includePropertyListings,
  includeSandbox,
  systemPrompt,
}: BuildSystemPromptOptions): string {
  const activeSystemPrompt = systemPrompt ?? SYSTEM_PROMPT;
  const activePlatformInstructions = platformInstructions ?? PLATFORM_INSTRUCTIONS;
  const availableSkillsSection = formatAvailableSkills(userSkills);

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

  if (includePropertyListings) {
    sections.push(PROPERTY_LISTING_PROMPT);
  }

  if (includeSandbox) {
    sections.push(SANDBOX_PROMPT);
  }

  if (instructions && instructions.trim().length > 0) {
    sections.push(instructions.trim());
  }

  // Skills change rarely — keep in the stable prefix zone for LLM cache-friendliness.
  if (availableSkillsSection) {
    sections.push(availableSkillsSection);
  }

  return sections.join("\n\n");
}

/** Resolves platform instructions and system prompt based on CRM config/mode overrides. */
function resolvePromptOverrides(params: {
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
  platformInstructions?: string;
  systemPrompt?: string;
}): Pick<BuildSystemPromptOptions, "platformInstructions" | "systemPrompt"> {
  return {
    platformInstructions: params.platformInstructions ?? (params.crmConfig
      ? buildPlatformInstructions(params.crmConfig)
      : PLATFORM_INSTRUCTIONS),
    systemPrompt: params.systemPrompt ?? (params.crmMode === "setup"
      ? CRM_SETUP_SYSTEM_PROMPT
      : SYSTEM_PROMPT),
  };
}

/** Formats memory context + compaction summary into a single string for message injection. */
function formatMemoryMessage(memory: MemoryContext, compactionSummary?: string): string | null {
  const sections: string[] = [];

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

  return sections.length > 0 ? sections.join("\n\n") : null;
}

function buildUiMessageParts(row: HistoryRow): UIMessage["parts"] | null {
  if (Array.isArray(row.parts) && row.parts.length > 0) {
    const filteredParts = (row.parts as UIMessage["parts"]).filter((part) => {
      if (part.type !== "file") {
        return true;
      }

      return isModelVisible(part.mediaType);
    });

    if (filteredParts.length > 0) {
      return filteredParts;
    }
  }

  const fallbackText = row.content ?? getTextFromParts(row.parts);
  if (!fallbackText || fallbackText.length === 0) {
    return null;
  }

  return [{ type: "text", text: fallbackText }];
}

function buildCurrentMessageParts(
  currentMessage: string,
  currentMessageParts?: UIMessage["parts"],
): UIMessage["parts"] | null {
  const trimmedCurrentMessage = currentMessage.trim();

  if (currentMessageParts && currentMessageParts.length > 0) {
    const hasMatchingTextPart = currentMessageParts.some((part) =>
      part.type === "text" && part.text === trimmedCurrentMessage
    );

    if (trimmedCurrentMessage.length > 0 && !hasMatchingTextPart) {
      return [
        ...currentMessageParts,
        { type: "text", text: trimmedCurrentMessage },
      ];
    }

    return currentMessageParts;
  }

  if (trimmedCurrentMessage.length === 0) {
    return null;
  }

  return [{ type: "text", text: trimmedCurrentMessage }];
}

export async function loadSystemPromptState({
  supabase,
  threadId,
  clientId,
  includeCompactionState = true,
}: Pick<AssembleContextParams, "supabase" | "threadId" | "clientId"> & {
  includeCompactionState?: boolean;
}): Promise<{
  memoryContext?: MemoryContext;
  userSkills: SkillMetadata[];
  systemReminder?: string;
  compactionState: ThreadCompactionState | null;
  /** Combined thread metadata (compaction + staleness) from a single query. */
  threadMetadata: ThreadMetadata | null;
}> {
  if (!clientId) {
    return {
      memoryContext: undefined,
      userSkills: [],
      systemReminder: undefined,
      compactionState: null,
      threadMetadata: null,
    };
  }

  const reminderPromise = buildSystemReminder(supabase, clientId, threadId);

  // When compaction state is needed, use the combined fetchThreadMetadata query
  // to also load staleness fields (updated_at, context_reset_at) in the same
  // round-trip — eliminates the duplicate conversation_threads query that
  // assembleContext previously ran separately.
  const threadMetadataPromise = includeCompactionState
    ? fetchThreadMetadata(supabase, threadId)
    : Promise.resolve(null);

  const [memoryContext, userSkills, systemReminder, threadMetadata] = await Promise.all([
    loadMemoryContext(supabase, clientId),
    discoverUserSkills(supabase, clientId),
    reminderPromise,
    threadMetadataPromise,
  ]);

  return {
    memoryContext,
    userSkills,
    systemReminder,
    compactionState: threadMetadata?.compactionState ?? null,
    threadMetadata,
  };
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
  includePropertyListings,
  includeSandbox,
  platformInstructions,
  systemPrompt,
}: AssembleSystemOnlyParams): Promise<string> {
  const { memoryContext, userSkills } = await loadSystemPromptState({
    supabase,
    threadId,
    clientId,
    includeCompactionState: false,
  });

  const system = buildSystemPrompt({
    userSkills,
    ...resolvePromptOverrides({ crmConfig, crmMode, platformInstructions, systemPrompt }),
    includeBrowserAutomation,
    includeMarketData,
    includePropertyListings,
    includeSandbox,
  });

  // For subagent system-only assembly, append memory directly to the system string
  // (there's no messages array to inject into).
  if (memoryContext) {
    const memoryText = formatMemoryMessage(memoryContext);
    if (memoryText) {
      return `${system}\n\n${memoryText}`;
    }
  }

  return system;
}

/**
 * Builds the runner context from persisted thread history plus the inbound message.
 */
export async function assembleContext({
  supabase,
  threadId,
  currentMessage,
  currentMessageParts,
  clientId,
  instructions,
  crmConfig,
  crmMode = "normal",
  includeBrowserAutomation,
  includeMarketData,
  includePropertyListings,
  includeSandbox,
  platformInstructions,
  systemPrompt,
  preloadedState,
}: AssembleContextParams): Promise<AssembledContext> {
  const { memoryContext, userSkills, systemReminder, compactionState, threadMetadata } = preloadedState
    ?? await loadSystemPromptState({ supabase, threadId, clientId });

  // Check for stale thread — skip old messages after 4h idle (Dorabot pattern).
  // Agent starts fresh with system prompt + memory + new message.
  // Old messages stay in DB — user can still scroll back in the UI.
  // Thread staleness fields (updated_at, context_reset_at) are preloaded by
  // loadSystemPromptState via fetchThreadMetadata — no extra query needed.
  let contextResetAt: string | null = null;

  if (clientId && threadMetadata) {
    const gap = Date.now() - new Date(threadMetadata.updatedAt).getTime();
    if (gap > IDLE_TIMEOUT_MS) {
      // Thread is stale — set (or advance) context_reset_at so old messages are skipped.
      // Anchor the reset boundary to the thread's last persisted activity so the
      // next inbound message still lands after the cutoff even if app/db clocks differ.
      contextResetAt = threadMetadata.updatedAt;
      await supabase
        .from("conversation_threads")
        .update({ context_reset_at: contextResetAt })
        .eq("thread_id", threadId);
    } else {
      contextResetAt = threadMetadata.contextResetAt;
    }
  }

  let historyQuery = supabase
    .from("conversation_messages")
    .select("message_id, created_at, role, content, parts")
    .eq("thread_id", threadId);

  if (contextResetAt) {
    historyQuery = historyQuery.gt("created_at", contextResetAt);
  } else if (compactionState) {
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

  const liveMessageParts = buildCurrentMessageParts(currentMessage, currentMessageParts);
  const currentMessageTurn = liveMessageParts
    ? [{
      role: "user" as const,
      parts: liveMessageParts,
    }]
    : [];
  const modelMessages = await convertToModelMessages([
    ...historyMessages,
    ...currentMessageTurn,
  ], { ignoreIncompleteToolCalls: true });

  // Inject system reminder and memory as user messages after the cache boundary
  // (not in the system prompt) so the stable prefix remains cacheable.
  const injectedMessages: ModelMessage[] = [];

  if (systemReminder) {
    injectedMessages.push({ role: "user" as const, content: [{ type: "text" as const, text: systemReminder }] });
  }

  if (memoryContext) {
    // When context has been reset (stale thread), skip the old compaction summary —
    // it was built from messages the agent no longer sees.
    const compactionSummary = contextResetAt ? undefined : compactionState?.compaction_summary;
    const memoryText = formatMemoryMessage(memoryContext, compactionSummary);
    if (memoryText) {
      injectedMessages.push({ role: "user" as const, content: [{ type: "text" as const, text: memoryText }] });
    }
  }


  return {
    system: buildSystemPrompt({
      userSkills,
      instructions,
      ...resolvePromptOverrides({ crmConfig, crmMode, platformInstructions, systemPrompt }),
      includeBrowserAutomation,
      includeMarketData,
      includePropertyListings,
      includeSandbox,
    }),
    messages: [...injectedMessages, ...modelMessages],
  };
}
