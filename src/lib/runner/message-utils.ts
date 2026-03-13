/**
 * Runner utilities for normalizing assistant UI message parts for persistence.
 * @module lib/runner/message-utils
 */
import { SPEC_DATA_PART_TYPE } from "@json-render/core";

import type { Json } from "@/types/database";

type ToolPartState =
  | "input-available"
  | "output-available"
  | "output-error"
  | "approval-requested"
  | "output-denied";

export type PersistedPart = Record<string, unknown>;

export interface StepLike {
  content?: ReadonlyArray<unknown>;
  text?: string;
  reasoningText?: string;
  toolCalls?: ReadonlyArray<unknown>;
  toolResults?: ReadonlyArray<unknown>;
}

function hasStepPayload(step: StepLike): boolean {
  return (
    (Array.isArray(step.content) && step.content.length > 0) ||
    (typeof step.text === "string" && step.text.trim().length > 0) ||
    (typeof step.reasoningText === "string" && step.reasoningText.trim().length > 0) ||
    (Array.isArray(step.toolCalls) && step.toolCalls.length > 0) ||
    (Array.isArray(step.toolResults) && step.toolResults.length > 0)
  );
}

function toErrorText(error: unknown): string {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  try {
    const stringified = JSON.stringify(error);
    if (typeof stringified === "string" && stringified.length > 0) {
      return stringified;
    }
  } catch {
    // Ignore JSON stringify errors and fall through to generic text.
  }

  return "Tool execution failed.";
}

const SPEC_FENCE_OPEN = "```spec";
const SPEC_FENCE_CLOSE = "```";

/**
 * Splits raw model text containing ` ```spec ` fences into interleaved
 * text and `data-spec` parts. Used by persistence to store spec patches
 * as first-class parts so reloaded messages render inline views correctly.
 *
 * If the text has no spec fences, returns a single text part unchanged.
 */
export function splitTextAndSpecParts(text: string): PersistedPart[] {
  if (!text.includes(SPEC_FENCE_OPEN)) {
    return [{ type: "text", text }];
  }

  const parts: PersistedPart[] = [];
  const lines = text.split("\n");
  let inFence = false;
  let textBuffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inFence && trimmed.startsWith(SPEC_FENCE_OPEN)) {
      // Flush accumulated text before entering fence
      const buffered = textBuffer.join("\n").trim();
      if (buffered.length > 0) {
        parts.push({ type: "text", text: buffered });
      }
      textBuffer = [];
      inFence = true;
      continue;
    }

    if (inFence && trimmed === SPEC_FENCE_CLOSE) {
      inFence = false;
      continue;
    }

    if (inFence) {
      // Parse JSONL line as an RFC 6902 JSON Patch operation
      if (trimmed.startsWith("{")) {
        try {
          const patch = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof patch.op === "string" && patch.path !== undefined) {
            parts.push({
              type: SPEC_DATA_PART_TYPE,
              data: { type: "patch", patch },
            });
          }
        } catch {
          // Malformed JSON inside fence — skip silently.
        }
      }
    } else {
      textBuffer.push(line);
    }
  }

  // Flush any trailing text after the last fence
  const trailing = textBuffer.join("\n").trim();
  if (trailing.length > 0) {
    parts.push({ type: "text", text: trailing });
  }

  return parts;
}

/**
 * Re-hydrates persisted message parts by scanning text parts for ` ```spec `
 * fences and converting them to `data-spec` parts. Used at load time to
 * fix messages persisted before the spec-part persistence fix.
 */
export function rehydrateSpecParts(parts: ReadonlyArray<Record<string, unknown>>): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];

  for (const part of parts) {
    if (
      part.type !== "text" ||
      typeof part.text !== "string" ||
      !part.text.includes(SPEC_FENCE_OPEN)
    ) {
      result.push(part);
      continue;
    }

    result.push(...splitTextAndSpecParts(part.text));
  }

  return result;
}

function isToolErrorPayload(value: unknown): value is { type: "tool-error"; error?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === "tool-error"
  );
}

function upsertToolPart(
  parts: PersistedPart[],
  toolPartIndexByCallId: Map<string, number>,
  options: {
    toolCallId: string;
    toolName?: string;
    state: ToolPartState;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    approval?: { id: string };
    providerExecuted?: boolean;
    preliminary?: boolean;
    title?: string;
  },
): void {
  const existingPartIndex = toolPartIndexByCallId.get(options.toolCallId);
  const existingPart = existingPartIndex != null ? parts[existingPartIndex] : null;

  const resolvedType =
    (existingPart?.type as string | undefined) ??
    (typeof options.toolName === "string" && options.toolName.length > 0
      ? `tool-${options.toolName}`
      : "dynamic-tool");

  const nextPart: PersistedPart = {
    type: resolvedType,
    toolCallId: options.toolCallId,
    state: options.state,
    ...(options.input !== undefined ? { input: options.input } : {}),
    ...(options.output !== undefined ? { output: options.output } : {}),
    ...(options.errorText !== undefined ? { errorText: options.errorText } : {}),
    ...(options.approval !== undefined ? { approval: options.approval } : {}),
    ...(options.providerExecuted !== undefined
      ? { providerExecuted: options.providerExecuted }
      : {}),
    ...(options.preliminary !== undefined ? { preliminary: options.preliminary } : {}),
    ...(options.title !== undefined ? { title: options.title } : {}),
  };

  if (existingPartIndex != null) {
    parts[existingPartIndex] = {
      ...existingPart,
      ...nextPart,
    };
    return;
  }

  parts.push(nextPart);
  toolPartIndexByCallId.set(options.toolCallId, parts.length - 1);
}

/**
 * Converts `streamText` onFinish step results into AI SDK UIMessage parts.
 * Keeps tool parts in `tool-${toolName}` format so persisted messages render
 * identically after reload.
 */
export function buildAssistantPartsFromSteps(
  steps: ReadonlyArray<StepLike>,
): PersistedPart[] {
  const parts: PersistedPart[] = [];
  const toolPartIndexByCallId = new Map<string, number>();

  for (const step of steps) {
    if (!hasStepPayload(step)) {
      continue;
    }

    parts.push({ type: "step-start" });
    let hasContentTextPart = false;
    let hasContentReasoningPart = false;

    if (Array.isArray(step.content) && step.content.length > 0) {
      for (const rawContentPart of step.content) {
        if (typeof rawContentPart !== "object" || rawContentPart === null) {
          continue;
        }

        const contentPart = rawContentPart as Record<string, unknown>;
        const contentType =
          typeof contentPart.type === "string" ? contentPart.type : null;
        if (!contentType) {
          continue;
        }

        if (contentType === "text") {
          if (typeof contentPart.text === "string" && contentPart.text.length > 0) {
            parts.push(...splitTextAndSpecParts(contentPart.text));
            hasContentTextPart = true;
          }
          continue;
        }

        if (contentType === "reasoning") {
          if (typeof contentPart.text === "string" && contentPart.text.length > 0) {
            parts.push({ type: "reasoning", text: contentPart.text });
            hasContentReasoningPart = true;
          }
          continue;
        }

        if (contentType === "tool-call") {
          if (
            typeof contentPart.toolCallId === "string" &&
            typeof contentPart.toolName === "string"
          ) {
            upsertToolPart(parts, toolPartIndexByCallId, {
              toolCallId: contentPart.toolCallId,
              toolName: contentPart.toolName,
              state: "input-available",
              input: contentPart.input ?? {},
              providerExecuted:
                typeof contentPart.providerExecuted === "boolean"
                  ? contentPart.providerExecuted
                  : undefined,
              title:
                typeof contentPart.title === "string" ? contentPart.title : undefined,
            });
          }
          continue;
        }

        if (contentType === "tool-result") {
          if (typeof contentPart.toolCallId === "string") {
            upsertToolPart(parts, toolPartIndexByCallId, {
              toolCallId: contentPart.toolCallId,
              toolName:
                typeof contentPart.toolName === "string"
                  ? contentPart.toolName
                  : undefined,
              state: "output-available",
              input: contentPart.input,
              output: contentPart.output,
              providerExecuted:
                typeof contentPart.providerExecuted === "boolean"
                  ? contentPart.providerExecuted
                  : undefined,
              preliminary:
                typeof contentPart.preliminary === "boolean"
                  ? contentPart.preliminary
                  : undefined,
            });
          }
          continue;
        }

        if (contentType === "tool-error") {
          if (typeof contentPart.toolCallId === "string") {
            upsertToolPart(parts, toolPartIndexByCallId, {
              toolCallId: contentPart.toolCallId,
              toolName:
                typeof contentPart.toolName === "string"
                  ? contentPart.toolName
                  : undefined,
              state: "output-error",
              input: contentPart.input,
              errorText: toErrorText(contentPart.error),
              providerExecuted:
                typeof contentPart.providerExecuted === "boolean"
                  ? contentPart.providerExecuted
                  : undefined,
            });
          }
          continue;
        }

        if (contentType === "tool-approval-request") {
          const toolCall = contentPart.toolCall as Record<string, unknown> | undefined;
          if (
            toolCall &&
            typeof contentPart.approvalId === "string" &&
            typeof toolCall.toolCallId === "string"
          ) {
            upsertToolPart(parts, toolPartIndexByCallId, {
              toolCallId: toolCall.toolCallId,
              toolName:
                typeof toolCall.toolName === "string" ? toolCall.toolName : undefined,
              state: "approval-requested",
              input: toolCall.input,
              approval: { id: contentPart.approvalId },
            });
          }
          continue;
        }

        if (contentType === "tool-output-denied") {
          if (typeof contentPart.toolCallId === "string") {
            upsertToolPart(parts, toolPartIndexByCallId, {
              toolCallId: contentPart.toolCallId,
              toolName:
                typeof contentPart.toolName === "string"
                  ? contentPart.toolName
                  : undefined,
              state: "output-denied",
              input: contentPart.input,
            });
          }
        }
      }
    }

    if (
      !hasContentReasoningPart &&
      typeof step.reasoningText === "string" &&
      step.reasoningText.length > 0
    ) {
      parts.push({ type: "reasoning", text: step.reasoningText });
    }

    for (const rawToolCall of step.toolCalls ?? []) {
      if (typeof rawToolCall !== "object" || rawToolCall === null) {
        continue;
      }

      const toolCall = rawToolCall as Record<string, unknown>;
      if (
        typeof toolCall.toolCallId === "string" &&
        typeof toolCall.toolName === "string"
      ) {
        upsertToolPart(parts, toolPartIndexByCallId, {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          state: "input-available",
          input: toolCall.input ?? toolCall.args ?? {},
          providerExecuted:
            typeof toolCall.providerExecuted === "boolean"
              ? toolCall.providerExecuted
              : undefined,
          title: typeof toolCall.title === "string" ? toolCall.title : undefined,
        });
      }
    }

    for (const rawToolResult of step.toolResults ?? []) {
      if (typeof rawToolResult !== "object" || rawToolResult === null) {
        continue;
      }

      const toolResult = rawToolResult as Record<string, unknown>;
      if (typeof toolResult.toolCallId === "string") {
        const resultPayload = toolResult.output ?? toolResult.result;
        if (isToolErrorPayload(resultPayload)) {
          upsertToolPart(parts, toolPartIndexByCallId, {
            toolCallId: toolResult.toolCallId,
            toolName:
              typeof toolResult.toolName === "string" ? toolResult.toolName : undefined,
            state: "output-error",
            input: toolResult.input,
            errorText: toErrorText(resultPayload.error),
            providerExecuted:
              typeof toolResult.providerExecuted === "boolean"
                ? toolResult.providerExecuted
                : undefined,
          });
          continue;
        }

        upsertToolPart(parts, toolPartIndexByCallId, {
          toolCallId: toolResult.toolCallId,
          toolName:
            typeof toolResult.toolName === "string" ? toolResult.toolName : undefined,
          state: "output-available",
          input: toolResult.input,
          output: resultPayload,
          providerExecuted:
            typeof toolResult.providerExecuted === "boolean"
              ? toolResult.providerExecuted
              : undefined,
          preliminary:
            typeof toolResult.preliminary === "boolean"
              ? toolResult.preliminary
              : undefined,
        });
      }
    }

    if (
      !hasContentTextPart &&
      typeof step.text === "string" &&
      step.text.trim().length > 0
    ) {
      parts.push(...splitTextAndSpecParts(step.text.trim()));
    }
  }

  return parts;
}

/**
 * Extracts text content from persisted DB message parts (Json column).
 * Used by context assembly and compaction to reconstruct message text from the `parts` column.
 */
export function getTextFromParts(parts: Json | null): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter(
      (part): part is { type: string; text?: string } =>
        typeof part === "object" && part !== null && "type" in part,
    )
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n");
}

/**
 * Returns compaction-safe text from persisted parts.
 * Includes normal assistant text plus truncated tool-result markers so
 * compaction summaries can preserve recovery paths after old messages roll up.
 */
export function getCompactionTextFromParts(parts: Json | null): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  const lines = parts.flatMap((part) => {
    if (typeof part !== "object" || part === null || !("type" in part)) {
      return [];
    }

    if (part.type === "text" && typeof part.text === "string") {
      const text = part.text.trim();
      return text.length > 0 ? [text] : [];
    }

    if (
      typeof part.toolCallId === "string" &&
      part.state === "output-available"
    ) {
      if (typeof part.output === "string" && part.output.includes("<context-removed>")) {
        return [`Tool call ${part.toolCallId}: ${part.output}`];
      }

      const toolName = typeof part.type === "string"
        ? part.type.replace(/^tool-/, "")
        : "unknown";
      return [`Tool call ${part.toolCallId} (${toolName}): [result in storage]`];
    }

    return [];
  });

  return lines.join("\n").trim();
}

/**
 * Returns newline-joined text content from assistant UI message parts.
 */
export function getAssistantTextFromParts(parts: ReadonlyArray<PersistedPart>): string {
  return parts
    .filter(
      (part): part is PersistedPart & { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}
