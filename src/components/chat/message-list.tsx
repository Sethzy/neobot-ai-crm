/**
 * Scrollable chat message list with empty state and optional scroll jump button.
 * @module components/chat/message-list
 */
"use client";

import { ArrowDown } from "@/components/icons/lucide-compat";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { memo } from "react";

import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import type { ChatStatus } from "@/types/chat";

import { MessageBubble } from "./message-bubble";
import type { ChatUIMessage } from "./message-content";

interface MessageListProps {
  messages: ChatUIMessage[];
  status: ChatStatus;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Called when user selects an option from an ask_user_question tool call. Only wired to the last assistant message. */
  onQuestionSubmit?: (text: string) => void;
}

export const MessageList = memo(function MessageList({ messages, status, onToolApproval, onQuestionSubmit }: MessageListProps) {
  const { containerRef, endRef, isAtBottom, scrollToBottom } = useScrollToBottom();
  const isStreaming = status === "streaming";

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} data-testid="message-scroll-container" className="h-full overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.map((message, index) => {
            const isLastMessage = index === messages.length - 1;
            const isLastAssistantMessage = isLastMessage && message.role === "assistant";

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={isStreaming && isLastAssistantMessage}
                onToolApproval={onToolApproval}
                onQuestionSubmit={isLastAssistantMessage ? onQuestionSubmit : undefined}
              />
            );
          })}

          {status === "submitted" && (
            <Shimmer as="span" className="text-xs text-muted-foreground" duration={2}>
              Thinking...
            </Shimmer>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {!isAtBottom ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Scroll to bottom"
            className="rounded-full shadow-md"
            onClick={() => scrollToBottom("smooth")}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
});
