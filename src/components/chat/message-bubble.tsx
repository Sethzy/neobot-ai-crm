/**
 * Renders one chat message with role-based layout and parts-based rendering.
 * User messages: right-aligned bubble. Assistant messages: flat inline layout
 * using a single parts.map(switch) — each part renders at its natural position.
 *
 * Inline spec rendering: uses `useJsonRenderMessage` from `@json-render/react`
 * and `SPEC_DATA_PART_TYPE` from `@json-render/core` to detect spec data parts
 * emitted by `pipeJsonRender()` and render them inline via `ViewRenderer`.
 *
 * @module components/chat/message-bubble
 */
"use client";

import { memo, useMemo, useState } from "react";
import { SPEC_DATA_PART_TYPE } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";

import { Badge } from "@/components/ui/badge";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { CopyIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ViewRenderer } from "@/lib/views/renderer";
import { AskUserQuestionInline, type AskUserQuestion } from "./ask-user-question-inline";
import { ImageLightbox } from "./image-lightbox";
import { resolveFilePartUrl, type ChatFilePart } from "./file-parts";
import { getMessageText, type ChatUIMessage } from "./message-content";
import { PreviewAttachment, type Attachment } from "./preview-attachment";
import { ToolCallInline, type ToolPartState } from "./tool-call-inline";

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

function filePartToAttachment(part: ChatFilePart): Attachment {
  return {
    filename: part.filename ?? "file",
    url: resolveFilePartUrl(part),
    contentType: part.mediaType,
  };
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
  const skillSlug = useMemo(() => extractSkillSlug(message.parts), [message.parts]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Lightweight precomputations for both user and assistant paths
  const fileParts = useMemo(
    () => message.parts.filter(
      (part): part is Extract<ChatUIMessage["parts"][number], { type: "file" }> => part.type === "file",
    ),
    [message.parts],
  );
  const hasTextParts = useMemo(
    () => message.parts.some((p) => p.type === "text"),
    [message.parts],
  );
  const hasRenderableParts = useMemo(
    () => message.parts.some((p) =>
      p.type === "text" || p.type === "reasoning" || p.type === "file" || p.type.startsWith("tool-"),
    ),
    [message.parts],
  );

  // Assistant-only: track which reasoning block is still actively streaming.
  // A reasoning part is "active" only when it's the very last renderable part —
  // once a text part, tool call, or new reasoning block appears after it, it's done.
  const lastRenderableIndex = useMemo(
    () => message.parts.findLastIndex((p) =>
      p.type === "reasoning" || p.type === "text" || p.type.startsWith("tool-"),
    ),
    [message.parts],
  );
  const specPartIndex = useMemo(
    () => message.parts.findIndex((p) => p.type === SPEC_DATA_PART_TYPE),
    [message.parts],
  );

  const isLoadingSpec = isLast && isStreaming;

  if (isUserMessage) {
    return (
      <>
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
                    onImageClick={setLightboxSrc}
                  />
                ))}
              </div>
            ) : null}

            {hasTextParts ? (
              <div className="max-w-full rounded-2xl rounded-br-md bg-foreground px-3.5 py-2 text-sm leading-normal text-background">
                <p className="whitespace-pre-wrap">{getMessageText(message)}</p>
              </div>
            ) : null}
          </div>
        </div>
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      </>
    );
  }

  return (
    <>
    <Message from="assistant" data-testid="message-bubble">
      <MessageContent>
        {skillSlug ? (
          <Badge variant="outline" data-testid="skill-badge" className="mb-2 text-xs">
            {skillSlug}
          </Badge>
        ) : null}

        {isStreaming && !hasRenderableParts && !hasSpec && (
          <Shimmer as="span" className="text-xs" duration={2}>
            Thinking...
          </Shimmer>
        )}

        {message.parts.map((part, index) => {
          const key = `${message.id}-part-${index}`;

          if (part.type === "file") {
            return (
              <PreviewAttachment
                key={key}
                attachment={filePartToAttachment(part as ChatFilePart)}
                onImageClick={setLightboxSrc}
              />
            );
          }

          if (part.type === "text") {
            return (
              <MessageResponse
                key={key}
                isAnimating={isStreaming}
              >
                {(part as { text: string }).text}
              </MessageResponse>
            );
          }

          if (part.type === "reasoning") {
            return (
              <Reasoning
                key={key}
                isStreaming={isStreaming && index === lastRenderableIndex}
              >
                <ReasoningTrigger />
                <ReasoningContent>
                  {(part as { text: string }).text}
                </ReasoningContent>
              </Reasoning>
            );
          }

          if (part.type === SPEC_DATA_PART_TYPE && index === specPartIndex && hasSpec) {
            return (
              <ViewRenderer
                key={key}
                spec={spec}
                loading={isLoadingSpec}
              />
            );
          }

          if (
            part.type === "tool-ask_user_question"
            && (part as { state?: string }).state === "output-available"
            && !isStreaming
          ) {
            const output = (part as { output?: { questions?: AskUserQuestion[] } }).output;
            if (!output?.questions) return null;
            return (
              <AskUserQuestionInline
                key={key}
                questions={output.questions}
                onSubmit={onQuestionSubmit ?? (() => {})}
                disabled={!onQuestionSubmit}
              />
            );
          }

          if (part.type.startsWith("tool-")) {
            const toolPart = part as {
              type: string;
              state: ToolPartState;
              input: unknown;
              output?: unknown;
              errorText?: string;
              approval?: { id: string };
            };
            return (
              <ToolCallInline
                key={key}
                name={toolPart.type.replace(/^tool-/, "")}
                state={toolPart.state}
                input={toolPart.input}
                output={toolPart.output}
                errorText={toolPart.errorText}
                approvalId={toolPart.approval?.id}
                onToolApproval={onToolApproval}

              />
            );
          }

          return null;
        })}

        {/* Fallback: render spec at end if hasSpec but no inline position found */}
        {hasSpec && specPartIndex === -1 && (
          <ViewRenderer
            spec={spec}
            loading={isLoadingSpec}
          />
        )}

      </MessageContent>

        {!isStreaming && hasTextParts && (
          <MessageActions>
            <MessageAction
              label="Copy"
              tooltip="Copy to clipboard"
              onClick={() => {
                const text = getMessageText(message);
                if (text && navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(text).catch(() => {});
                }
              }}
            >
              <CopyIcon className="size-4" />
            </MessageAction>
          </MessageActions>
        )}
    </Message>
    <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
});
