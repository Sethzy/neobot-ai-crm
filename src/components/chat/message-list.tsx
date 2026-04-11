/**
 * Scrollable chat message list with scroll-to-bottom button.
 * Uses AI Elements Conversation for scroll management.
 * @module components/chat/message-list
 */
"use client";

import type React from "react";
import { memo, useMemo } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { SpinnerWithVerb } from "@/components/chat/spinner";
import type { SpinnerMode } from "@/components/chat/spinner/types";
import type { ChatStatus } from "@/types/chat";

import { MessageBubble } from "./message-bubble";
import type { ChatUIMessage } from "./message-content";

interface MessageListProps {
  messages: ChatUIMessage[];
  status: ChatStatus;
  spinnerMode: SpinnerMode;
  hasActiveTools: boolean;
  responseLengthRef: React.RefObject<number>;
  loadingStartTimeRef: React.RefObject<number>;
  totalPausedMsRef: React.RefObject<number>;
  pauseStartTimeRef: React.RefObject<number | null>;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Called when user selects an option from an ask_user_question tool call. Only wired to the last assistant message. */
  onQuestionSubmit?: (text: string) => void;
}

export const MessageList = memo(function MessageList({
  messages,
  status,
  spinnerMode,
  hasActiveTools,
  responseLengthRef,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  onToolApproval,
  onQuestionSubmit,
}: MessageListProps) {
  const isStreaming = status === "streaming";
  const isLoading = status === "submitted" || status === "streaming";

  // Deduplicate by message ID — keep last occurrence so streaming updates win over stale copies.
  const uniqueMessages = useMemo(
    () => messages.filter(
      (message, index, self) => self.findLastIndex((m) => m.id === message.id) === index,
    ),
    [messages],
  );

  // Show spinner when loading unless it's a no-op approval continuation
  const showSpinner = isLoading &&
    !messages.some((msg) =>
      msg.parts?.some(
        (part) => "state" in part && (part as { state: string }).state === "approval-responded",
      ),
    );

  return (
    <Conversation className="relative flex-1 min-h-0">
      <ConversationContent className="mx-auto max-w-2xl !gap-3 px-4 py-6">
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

        {showSpinner && (
          <SpinnerWithVerb
            mode={spinnerMode}
            responseLengthRef={responseLengthRef}
            loadingStartTimeRef={loadingStartTimeRef}
            totalPausedMsRef={totalPausedMsRef}
            pauseStartTimeRef={pauseStartTimeRef}
            hasActiveTools={hasActiveTools}
          />
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
});
