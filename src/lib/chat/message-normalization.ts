/**
 * Converts persisted DB message rows into AI SDK UIMessage objects.
 * Shared by all server pages that load thread history (Agent page, thread page).
 * @module lib/chat/message-normalization
 */
import type { UIMessage } from "ai";

import { rehydrateSpecParts } from "@/lib/runner/message-utils";
import type { Json } from "@/types/database";

const uiMessageRoles = ["system", "user", "assistant"] as const;

function isUiMessageRole(role: string): role is (typeof uiMessageRoles)[number] {
  return uiMessageRoles.includes(role as (typeof uiMessageRoles)[number]);
}

function normalizeMessageParts(parts: Json | null, content: string | null): UIMessage["parts"] {
  if (Array.isArray(parts)) {
    // Re-hydrate: convert any ```spec fences inside text parts into data-spec
    // parts so persisted messages render inline views after page reload.
    return rehydrateSpecParts(parts as Record<string, unknown>[]) as UIMessage["parts"];
  }

  if (content) {
    return [{ type: "text", text: content }];
  }

  return [];
}

/**
 * Maps a persisted message row to a UIMessage for the AI SDK chat UI.
 */
export function mapDbMessageToUiMessage(message: {
  message_id: string;
  role: string;
  content: string | null;
  parts: Json | null;
}): UIMessage {
  const role = isUiMessageRole(message.role) ? message.role : "assistant";

  return {
    id: message.message_id,
    role,
    parts: normalizeMessageParts(message.parts, message.content),
  };
}
