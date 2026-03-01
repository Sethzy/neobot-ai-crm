/**
 * Helpers for extracting renderable text from AI SDK UI messages.
 * @module components/chat/message-content
 */
import type { UIMessage } from "ai";

export type ChatUIMessage = Pick<UIMessage, "id" | "role" | "parts">;

export function getMessageText(message: ChatUIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
