/**
 * Context assembly for the runner engine.
 * @module lib/runner/context
 */
import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type MessageRole = "system" | "user" | "assistant";

interface AssembleContextParams {
  supabase: ChatSupabaseClient;
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

const allowedRoles: MessageRole[] = ["system", "user", "assistant"];

function normalizeRole(role: string): MessageRole {
  return allowedRoles.includes(role as MessageRole) ? (role as MessageRole) : "assistant";
}

function getTextFromParts(parts: Json | null): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter(
      (part): part is { type: string; text?: string } =>
        typeof part === "object" && part !== null && "type" in part,
    )
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n");
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
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load thread history: ${error.message}`);
  }

  const historyMessages: ModelMessage[] = ((data as HistoryRow[] | null) ?? []).map((row) => ({
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
    system: SYSTEM_PROMPT,
    messages: [
      ...historyMessages,
      ...currentMessageTurn,
    ],
  };
}
