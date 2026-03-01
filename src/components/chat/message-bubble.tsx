/**
 * Renders one chat message bubble with role-based layout.
 * @module components/chat/message-bubble
 */
"use client";

import Markdown from "react-markdown";

import { cn } from "@/lib/utils";

import { getMessageText, type ChatUIMessage } from "./message-content";

interface MessageBubbleProps {
  message: ChatUIMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUserMessage = message.role === "user";
  const messageText = getMessageText(message);

  return (
    <div
      data-testid="message-bubble"
      className={cn("flex w-full", isUserMessage ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUserMessage
            ? "rounded-br-md bg-foreground text-background"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {isUserMessage ? (
          <p className="whitespace-pre-wrap">{messageText}</p>
        ) : (
          <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <Markdown>{messageText}</Markdown>
          </div>
        )}

        {isStreaming && !isUserMessage ? (
          <span
            data-testid="streaming-indicator"
            aria-label="Streaming response"
            className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-full bg-foreground/50"
          />
        ) : null}
      </div>
    </div>
  );
}
