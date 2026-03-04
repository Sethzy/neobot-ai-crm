/**
 * Renders one chat message with role-based layout and parts-based rendering.
 * User messages: right-aligned bubble. Assistant messages: flat layout with
 * AI Elements Message/Reasoning and compact pill-style tool calls.
 * All parts render interleaved — no container wrapper.
 * @module components/chat/message-bubble
 */
"use client";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { getMessageText, type ChatUIMessage } from "./message-content";
import { StepsSummary } from "./steps-summary";

interface MessageBubbleProps {
  message: ChatUIMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUserMessage = message.role === "user";

  if (isUserMessage) {
    return (
      <div
        data-testid="message-bubble"
        className="flex w-full justify-end"
      >
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground text-background px-3.5 py-2 text-sm leading-normal">
          <p className="whitespace-pre-wrap">{getMessageText(message)}</p>
        </div>
      </div>
    );
  }

  const intermediateParts = message.parts.filter(
    (p) => p.type === "reasoning" || p.type.startsWith("tool-"),
  );
  const textParts = message.parts.filter((p) => p.type === "text");
  const hasParts = intermediateParts.length > 0 || textParts.length > 0;

  return (
    <Message from="assistant" data-testid="message-bubble">
      <MessageContent>
        {isStreaming && !hasParts && (
          <Shimmer as="span" className="text-xs text-muted-foreground" duration={2}>
            Thinking...
          </Shimmer>
        )}

        {intermediateParts.length > 0 && (
          <StepsSummary
            parts={intermediateParts}
            isStreaming={isStreaming}
            hasTextParts={textParts.length > 0}
            messageId={message.id}
          />
        )}

        {textParts.map((part, i) => (
          <MessageResponse key={`${message.id}-text-${i}`}>
            {part.text}
          </MessageResponse>
        ))}

      </MessageContent>
    </Message>
  );
}
