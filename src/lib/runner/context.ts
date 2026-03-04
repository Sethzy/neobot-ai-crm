/**
 * Context assembly for the runner engine.
 * @module lib/runner/context
 */
import type { ModelMessage } from "ai";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { extractTextContent } from "@/lib/runner/message-utils";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database";
/** Roles that can be replayed as simple { role, content } messages. */
type ReplayableRole = "system" | "user" | "assistant";

interface AssembleContextParams {
  supabase: AppSupabaseClient;
  threadId: string;
  currentMessage: string;
}

interface AssembledContext {
  system: string;
  messages: ModelMessage[];
}

interface HistoryRow {
  role: string;
  content: string | null;
  parts: Json | null;
}

const replayableRoles: ReplayableRole[] = ["system", "user", "assistant"];

/** Max messages loaded from thread history to bound context size. */
const MAX_HISTORY_MESSAGES = 200;

function isReplayableRole(role: string): role is ReplayableRole {
  return replayableRoles.includes(role as ReplayableRole);
}

/**
 * Builds the runner context from persisted thread history plus the inbound message.
 */
export async function assembleContext({
  supabase,
  threadId,
  currentMessage,
}: AssembleContextParams): Promise<AssembledContext> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("role, content, parts")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) {
    throw new Error(`Failed to load thread history: ${error.message}`);
  }

  const rows = ((data as HistoryRow[] | null) ?? []).reverse();
  const historyMessages: ModelMessage[] = rows
    .filter((row) => isReplayableRole(row.role))
    .map((row) => ({
      role: row.role as ReplayableRole,
      content: row.content ?? extractTextContent(row.parts),
    }));

  const trimmedCurrentMessage = currentMessage.trim();
  const currentMessageTurn = trimmedCurrentMessage.length > 0
    ? [{
      role: "user" as const,
      content: trimmedCurrentMessage,
    }]
    : [];

  return {
    system: SYSTEM_PROMPT,
    messages: [
      ...historyMessages,
      ...currentMessageTurn,
    ],
  };
}
