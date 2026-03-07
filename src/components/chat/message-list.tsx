/**
 * Scrollable chat message list with empty state and optional scroll jump button.
 * @module components/chat/message-list
 */
"use client";

import { ArrowDown, MessageCircle } from "@/components/icons/lucide-compat";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";
import type { ChatStatus } from "@/types/chat";

import { MessageBubble } from "./message-bubble";
import type { ChatUIMessage } from "./message-content";

interface MessageListProps {
  messages: ChatUIMessage[];
  status: ChatStatus;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Called when user clicks a suggestion chip in the empty state. Receives the prompt text. */
  onSuggestionClick?: (prompt: string) => void;
  /** Called when user selects an option from an ask_user_question tool call. Only wired to the last assistant message. */
  onQuestionSubmit?: (text: string) => void;
}

export function MessageList({ messages, status, onToolApproval, onSuggestionClick, onQuestionSubmit }: MessageListProps) {
  const { containerRef, endRef, isAtBottom, scrollToBottom } = useScrollToBottom();
  const hasMessages = messages.length > 0;
  const isStreaming = status === "streaming";

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} data-testid="message-scroll-container" className="h-full overflow-y-auto px-4 py-6">
        {hasMessages ? (
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
        ) : (
          <div
            data-testid="empty-chat"
            className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Start a conversation</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask your agent anything, and responses will stream in real time.
              </p>
            </div>

            {onSuggestionClick ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {AUTOMATION_TEMPLATES.slice(0, 4).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onSuggestionClick(template.prompt)}
                    className="rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-secondary/30 hover:text-foreground"
                  >
                    {template.title}
                  </button>
                ))}
              </div>
            ) : null}

            <div ref={endRef} />
          </div>
        )}
      </div>

      {!isAtBottom && hasMessages ? (
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
}
