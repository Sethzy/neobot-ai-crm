/**
 * Scrollable chat message list with scroll-to-bottom button.
 * Uses AI Elements Conversation for scroll management.
 * @module components/chat/message-list
 */
"use client";

import { memo, useMemo } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import type { ChatStatus } from "@/types/chat";

import { MessageBubble } from "./message-bubble";
import type { ChatUIMessage } from "./message-content";

/** Stable placeholder so the "Thinking..." shimmer renders inside the same MessageBubble DOM path as StepsSummary. */
const thinkingPlaceholder: ChatUIMessage = {
  id: "thinking-placeholder",
  role: "assistant",
  parts: [],
};

interface MessageListProps {
  messages: ChatUIMessage[];
  status: ChatStatus;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Called when user selects an option from an ask_user_question tool call. Only wired to the last assistant message. */
  onQuestionSubmit?: (text: string) => void;
}

export const MessageList = memo(function MessageList({ messages, status, onToolApproval, onQuestionSubmit }: MessageListProps) {
  const isStreaming = status === "streaming";

  // Deduplicate by message ID — keep last occurrence so streaming updates win over stale copies.
  const uniqueMessages = useMemo(
    () => messages.filter(
      (message, index, self) => self.findLastIndex((m) => m.id === message.id) === index,
    ),
    [messages],
  );

  return (
    <Conversation className="relative flex-1 min-h-0">
      <ConversationContent className="mx-auto max-w-[44rem] gap-0 px-4 py-6">
        {uniqueMessages.map((message, index) => {
          const isLastMessage = index === uniqueMessages.length - 1;
          const isLastAssistantMessage = isLastMessage && message.role === "assistant";

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={isStreaming && isLastAssistantMessage}
              isLast={isLastMessage}
              onToolApproval={onToolApproval}
              onQuestionSubmit={isLastAssistantMessage ? onQuestionSubmit : undefined}
            />
          );
        })}

        {status === "submitted" &&
          !messages.some((msg) =>
            msg.parts?.some(
              (part) => "state" in part && (part as { state: string }).state === "approval-responded",
            ),
          ) && (
          <MessageBubble
            message={thinkingPlaceholder}
            isStreaming
            isLast
          />
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
});
