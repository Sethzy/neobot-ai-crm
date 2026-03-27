/**
 * Renders one chat message with role-based layout and parts-based rendering.
 * User messages: right-aligned bubble. Assistant messages: flat layout with
 * AI Elements Message/Reasoning and compact pill-style tool calls.
 *
 * Inline spec rendering: uses `useJsonRenderMessage` from `@json-render/react`
 * and `SPEC_DATA_PART_TYPE` from `@json-render/core` to detect spec data parts
 * emitted by `pipeJsonRender()` and render them inline via `ViewRenderer`.
 *
 * @module components/chat/message-bubble
 */
"use client";

import { memo } from "react";
import { SPEC_DATA_PART_TYPE } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";

import { Badge } from "@/components/ui/badge";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "@/components/ai-elements/message";
import { CopyIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ViewRenderer } from "@/lib/views/renderer";
import { cn } from "@/lib/utils";
import { AskUserQuestionInline, type AskUserQuestion } from "./ask-user-question-inline";
import { getMessageText, type ChatUIMessage } from "./message-content";
import { PreviewAttachment, type Attachment } from "./preview-attachment";
import { StepsSummary } from "./steps-summary";

interface MessageBubbleProps {
  message: ChatUIMessage;
  isStreaming?: boolean;
  /** Whether this is the last message in the conversation. */
  isLast?: boolean;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Callback when user selects an option from an ask_user_question tool call. */
  onQuestionSubmit?: (text: string) => void;
}

function filePartToAttachment(part: { filename?: string; url: string; mediaType: string }): Attachment {
  return { filename: part.filename ?? "file", url: part.url, contentType: part.mediaType };
}

/** Matches /agent/skills/{slug}/SKILL.md — excludes system/ and connections/. */
const USER_SKILL_PATTERN = /^\/agent\/skills\/(?!system\/|connections\/)([^/]+)\/SKILL\.md$/;

/** Extract user skill slug from persisted tool-read_file parts, if any. */
function extractSkillSlug(parts: ChatUIMessage["parts"]): string | null {
  for (const part of parts) {
    if (
      part.type === "tool-read_file" &&
      "input" in part &&
      typeof (part as { input?: { path?: string } }).input?.path === "string"
    ) {
      const match = (part as { input: { path: string } }).input.path.match(USER_SKILL_PATTERN);
      if (match?.[1]) return match[1];
    }
  }
  return null;
}

export const MessageBubble = memo(function MessageBubble({ message, isStreaming = false, isLast = false, onToolApproval, onQuestionSubmit }: MessageBubbleProps) {
  const isUserMessage = message.role === "user";
  const { spec, hasSpec } = useJsonRenderMessage(message.parts);

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

  // Track whether we inserted the spec inline via the segment builder.
  // If not but hasSpec is true, we render it at the end as a fallback.
  let specInserted = false;

  /**
   * Build ordered segments from parts: text / spec.
   * Tool parts and reasoning go through StepsSummary separately (unchanged),
   * but spec data parts (`SPEC_DATA_PART_TYPE`) get their own segment so the
   * ViewRenderer appears at the exact position the LLM placed the ```spec fence.
   */
  const segments: Array<
    | { kind: "text"; parts: Array<{ type: "text"; text: string }> }
    | { kind: "spec" }
  > = [];

  for (const part of message.parts) {
    if (part.type === "text") {
      const lastSeg = segments[segments.length - 1];
      if (lastSeg?.kind === "text") {
        lastSeg.parts.push(part as { type: "text"; text: string });
      } else {
        segments.push({ kind: "text", parts: [part as { type: "text"; text: string }] });
      }
    } else if (part.type === SPEC_DATA_PART_TYPE && !specInserted) {
      segments.push({ kind: "spec" });
      specInserted = true;
    }
    // tool- and reasoning parts are handled by StepsSummary, not segments
  }

  const hasParts = fileParts.length > 0 || allIntermediateParts.length > 0 || textParts.length > 0 || hasSpec;
  const isLoadingSpec = isLast && isStreaming;

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
                  attachment={filePartToAttachment(part)}
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
        {(() => {
          const skillSlug = extractSkillSlug(message.parts);
          if (!skillSlug) return null;
          return (
            <Badge variant="outline" data-testid="skill-badge" className="mb-2 text-xs">
              {skillSlug}
            </Badge>
          );
        })()}

        {isStreaming && !hasParts && (
          <Shimmer as="span" className="text-xs" duration={2}>
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

        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return seg.parts.map((tp, j) => (
              <MessageResponse
                key={`${message.id}-text-${i}-${j}`}
                isAnimating={isStreaming}
              >
                {tp.text}
              </MessageResponse>
            ));
          }
          if (seg.kind === "spec" && hasSpec) {
            return (
              <ViewRenderer
                key={`${message.id}-spec`}
                spec={spec}
                loading={isLoadingSpec}
              />
            );
          }
          return null;
        })}

        {/* Fallback: render spec at end if hasSpec but no inline position found */}
        {hasSpec && !specInserted && (
          <ViewRenderer
            spec={spec}
            loading={isLoadingSpec}
          />
        )}

        {!isStreaming && askQuestionParts.length > 0 &&
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

        {!isStreaming && textParts.length > 0 && (
          <MessageToolbar>
            <MessageActions>
              <MessageAction
                label="Copy"
                tooltip="Copy to clipboard"
                onClick={() => {
                  const text = getMessageText(message);
                  if (text) void navigator.clipboard.writeText(text);
                }}
              >
                <CopyIcon className="size-4" />
              </MessageAction>
            </MessageActions>
          </MessageToolbar>
        )}
    </Message>
  );
});
