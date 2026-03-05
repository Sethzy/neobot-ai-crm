/**
 * Runner utilities for normalizing assistant UI message parts for persistence.
 * @module lib/runner/message-utils
 */

type ToolPartState =
  | "input-available"
  | "output-available"
  | "output-error"
  | "approval-requested"
  | "output-denied";

type PersistedPart = Record<string, unknown>;

interface StepLike {
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
            parts.push({ type: "text", text: contentPart.text });
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
      parts.push({ type: "text", text: step.text.trim() });
    }
  }

  return parts;
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
