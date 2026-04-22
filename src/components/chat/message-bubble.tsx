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
  rewriteSunderHref,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ViewRenderer } from "@/lib/views/renderer";
import { ImageLightbox } from "./image-lightbox";
import { AssistantArtifactCard } from "./assistant-artifact-card";
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
  /** Fires after a request_approval decision is submitted. */
  onManagedApprovalSubmitted?: (approvalId: string) => void;
}

function filePartToAttachment(part: ChatFilePart): Attachment {
  return {
    filename: part.filename ?? "file",
    url: resolveFilePartUrl(part),
    contentType: part.mediaType,
  };
}

type AssistantTextSegment =
  | { type: "markdown"; text: string }
  | { type: "artifact"; attachment: Attachment; displayName?: string };

function inferArtifactContentType(filename: string): string {
  const loweredFilename = filename.toLowerCase();

  if (loweredFilename.endsWith(".pdf")) return "application/pdf";
  if (loweredFilename.endsWith(".csv")) return "text/csv";
  if (loweredFilename.endsWith(".json")) return "application/json";
  if (loweredFilename.endsWith(".md")) return "text/markdown";
  if (loweredFilename.endsWith(".txt")) return "text/plain";
  if (loweredFilename.endsWith(".png")) return "image/png";
  if (loweredFilename.endsWith(".jpg") || loweredFilename.endsWith(".jpeg")) return "image/jpeg";
  if (loweredFilename.endsWith(".gif")) return "image/gif";
  if (loweredFilename.endsWith(".webp")) return "image/webp";

  return "application/octet-stream";
}

function extractStandaloneArtifactLink(line: string): { href: string; label: string } | null {
  const trimmedLine = line.trim();
  const patterns = [
    /^\[([^\]]+)\]\(([^)]+)\)$/i,
    /^Download\s+\[([^\]]+)\]\(([^)]+)\)$/i,
    /^Download link:\s*\[([^\]]+)\]\(([^)]+)\)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmedLine.match(pattern);
    if (match) {
      return { label: match[1], href: match[2] };
    }
  }

  return null;
}

function buildArtifactAttachmentFromHref(href: string, label: string): Attachment | null {
  const resolvedHref = rewriteSunderHref(href);

  if (!resolvedHref) {
    return null;
  }

  const isArtifactHref = href.startsWith("sunder:///agent/") || resolvedHref.startsWith("/api/files/download?");
  if (!isArtifactHref) {
    return null;
  }

  const parsedUrl = new URL(resolvedHref, "https://sunder.local");
  const explicitFilename = parsedUrl.searchParams.get("filename");
  const pathParam = parsedUrl.searchParams.get("path");
  const fallbackPathname = parsedUrl.pathname.split("/").filter(Boolean).at(-1);
  const derivedFilename = explicitFilename
    ?? pathParam?.split("/").filter(Boolean).at(-1)
    ?? fallbackPathname
    ?? label;

  return {
    filename: decodeURIComponent(derivedFilename),
    url: resolvedHref,
    contentType: inferArtifactContentType(derivedFilename),
  };
}

function splitAssistantTextSegments(text: string): AssistantTextSegment[] {
  const lines = text.split("\n");
  const segments: AssistantTextSegment[] = [];
  let bufferedLines: string[] = [];

  const flushBufferedText = () => {
    if (bufferedLines.length === 0) {
      return;
    }

    const bufferedText = bufferedLines.join("\n").trim();
    if (bufferedText) {
      segments.push({ type: "markdown", text: bufferedText });
    }
    bufferedLines = [];
  };

  for (const line of lines) {
    const artifactLink = extractStandaloneArtifactLink(line);
    if (!artifactLink) {
      bufferedLines.push(line);
      continue;
    }

    const attachment = buildArtifactAttachmentFromHref(artifactLink.href, artifactLink.label);
    if (!attachment) {
      bufferedLines.push(line);
      continue;
    }

    // The agent often emits:
    // "Download link:"
    //
    // "[Download CSV](...)"
    // Drop the label line so the card stands on its own.
    while (bufferedLines.length > 0 && bufferedLines.at(-1)?.trim() === "") {
      bufferedLines.pop();
    }
    const normalizedLastLine = bufferedLines.at(-1)?.trim().replaceAll("*", "").trim().toLowerCase();
    if (normalizedLastLine === "download link:") {
      bufferedLines.pop();
      while (bufferedLines.length > 0 && bufferedLines.at(-1)?.trim() === "") {
        bufferedLines.pop();
      }
    }

    flushBufferedText();
    segments.push({ type: "artifact", attachment, displayName: artifactLink.label });
  }

  flushBufferedText();

  return segments.length > 0 ? segments : [{ type: "markdown", text }];
}

function isArtifactLabelOnlyText(text: string): boolean {
  const normalized = text
    .trim()
    .replace(/<\/?[^>]+>/g, "")
    .replaceAll("*", "")
    .trim()
    .toLowerCase();
  return normalized === "download link:";
}

function stripTrailingArtifactLabel(text: string): string {
  const lines = text.split("\n");
  let labelIndex = lines.length - 1;

  while (labelIndex >= 0 && lines[labelIndex]?.trim() === "") {
    labelIndex -= 1;
  }

  if (labelIndex < 0 || !isArtifactLabelOnlyText(lines[labelIndex] ?? "")) {
    return text;
  }

  return lines.slice(0, labelIndex).join("\n").trimEnd();
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

/** Copy-to-clipboard button with brief check feedback. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <MessageAction
      label="Copy"
      tooltip="Copy to clipboard"
      onClick={() => {
        if (!text || !navigator.clipboard?.writeText) return;
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
      }}
    >
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
    </MessageAction>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
  isLast = false,
  onToolApproval,
  onManagedApprovalSubmitted,
}: MessageBubbleProps) {
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
          className="flex w-full animate-in fade-in slide-in-from-bottom-1 justify-end py-3 duration-150"
        >
          <div className="flex min-w-0 max-w-[85%] flex-col items-end gap-2">
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
              <div className="max-w-full min-w-0 rounded-2xl bg-app-sidebar px-4 py-2.5 text-sm leading-normal text-foreground">
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{getMessageText(message)}</p>
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
    <Message from="assistant" data-testid="message-bubble" className="animate-in fade-in slide-in-from-bottom-1 py-3 duration-150">
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
              <AssistantArtifactCard
                key={key}
                attachment={filePartToAttachment(part as ChatFilePart)}
                onImageClick={setLightboxSrc}
              />
            );
          }

          if (part.type === "text") {
            const rawText = (part as { text: string }).text;
            const textForRendering = stripTrailingArtifactLabel(rawText);

            if (!textForRendering.trim()) {
              return null;
            }

            return splitAssistantTextSegments(textForRendering).map((segment, segmentIndex) => {
              const segmentKey = `${key}-segment-${segmentIndex}`;

              if (segment.type === "artifact") {
                return (
                  <AssistantArtifactCard
                    key={segmentKey}
                    attachment={segment.attachment}
                    displayName={segment.displayName}
                    onImageClick={setLightboxSrc}
                  />
                );
              }

              return (
                <MessageResponse
                  key={segmentKey}
                  isAnimating={isStreaming}
                >
                  {segment.text}
                </MessageResponse>
              );
            });
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

          if (part.type.startsWith("tool-")) {
            const toolPart = part as {
              type: string;
              state: ToolPartState;
              input: unknown;
              output?: unknown;
              errorText?: string;
              approval?: { id?: string; approved?: boolean };
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
                approval={toolPart.approval}
                onToolApproval={onToolApproval}
                onManagedApprovalSubmitted={onManagedApprovalSubmitted}
                keepSpinning={isStreaming && isLast && index === lastRenderableIndex}
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
          <MessageActions className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={getMessageText(message)} />
          </MessageActions>
        )}
    </Message>
    <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
});
