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
import { cn } from "@/lib/utils";
import { AskUserQuestionInline, type AskUserQuestion } from "./ask-user-question-inline";
import { getMessageText, type ChatUIMessage } from "./message-content";
import { PreviewAttachment } from "./preview-attachment";
import { StepsSummary } from "./steps-summary";

interface MessageBubbleProps {
  message: ChatUIMessage;
  isStreaming?: boolean;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Callback when user selects an option from an ask_user_question tool call. */
  onQuestionSubmit?: (text: string) => void;
}

export function MessageBubble({ message, isStreaming = false, onToolApproval, onQuestionSubmit }: MessageBubbleProps) {
  const isUserMessage = message.role === "user";
  const fileParts = message.parts.filter(
    (part): part is Extract<ChatUIMessage["parts"][number], { type: "file" }> => part.type === "file",
  );
  const textParts = message.parts.filter((p) => p.type === "text");

  // Extract ask_user_question tool parts — these render inline (not collapsed in StepsSummary)
  const allIntermediateParts = message.parts.filter(
    (p) => p.type === "reasoning" || p.type.startsWith("tool-"),
  );
  const askQuestionParts = allIntermediateParts.filter(
    (p) => p.type === "tool-ask_user_question" && (p as { state?: string }).state === "output-available",
  );
  const intermediateParts = allIntermediateParts.filter(
    (p) => p.type !== "tool-ask_user_question",
  );

  const hasParts = fileParts.length > 0 || allIntermediateParts.length > 0 || textParts.length > 0;

  if (isUserMessage) {
    return (
      <div
        data-testid="message-bubble"
        className="flex w-full justify-end"
      >
        <div className="flex max-w-[80%] flex-col items-end gap-2">
          {fileParts.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2">
              {fileParts.map((part, index) => (
                <PreviewAttachment
                  attachment={{
                    filename: part.filename ?? "file",
                    url: part.url,
                    contentType: part.mediaType,
                  }}
                  key={`${message.id}-file-${index}`}
                />
              ))}
            </div>
          ) : null}

          {textParts.length > 0 ? (
            <div className="max-w-full rounded-2xl rounded-br-md bg-foreground px-3.5 py-2 text-sm leading-normal text-background">
              <p className="whitespace-pre-wrap">{getMessageText(message)}</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Message from="assistant" data-testid="message-bubble">
      <MessageContent>
        {isStreaming && !hasParts && (
          <Shimmer as="span" className="text-xs text-muted-foreground" duration={2}>
            Thinking...
          </Shimmer>
        )}

        {fileParts.length > 0 ? (
          <div className={cn("mb-2 flex flex-wrap gap-2", intermediateParts.length > 0 || textParts.length > 0 ? "" : "mb-0")}>
            {fileParts.map((part, index) => (
              <PreviewAttachment
                attachment={{
                  filename: part.filename ?? "file",
                  url: part.url,
                  contentType: part.mediaType,
                }}
                key={`${message.id}-file-${index}`}
              />
            ))}
          </div>
        ) : null}

        {intermediateParts.length > 0 && (
          <StepsSummary
            parts={intermediateParts}
            isStreaming={isStreaming}
            hasTextParts={textParts.length > 0}
            messageId={message.id}
            onToolApproval={onToolApproval}
          />
        )}

        {textParts.map((part, i) => (
          <MessageResponse key={`${message.id}-text-${i}`}>
            {part.text}
          </MessageResponse>
        ))}

        {askQuestionParts.length > 0 &&
          askQuestionParts.map((part, i) => {
            const output = (part as { output?: { questions?: AskUserQuestion[] } }).output;
            if (!output?.questions) return null;
            return (
              <AskUserQuestionInline
                key={`${message.id}-ask-${i}`}
                questions={output.questions}
                onSubmit={onQuestionSubmit ?? (() => {})}
                disabled={!onQuestionSubmit}
              />
            );
          })}

      </MessageContent>
    </Message>
  );
}
