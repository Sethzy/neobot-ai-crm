/**
 * Collapsible summary that hides intermediate steps (reasoning + tool calls)
 * behind a single muted line. Matches Tasklet's progressive disclosure pattern.
 * Collapsed: "Done in N steps ▶" or dynamic action text with shimmer during streaming.
 * Expanded: individual reasoning blocks and tool call lines.
 * @module components/chat/steps-summary
 */
"use client";

import { useState } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

import { ToolCallInline, type ToolPartState } from "./tool-call-inline";

interface StepsSummaryProps {
  /** Intermediate parts only (reasoning + tool-*). */
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isStreaming: boolean;
  /** Whether the parent message has text parts (signals completion). */
  hasTextParts: boolean;
  messageId: string;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
}

/**
 * Derives the current action text from the last intermediate part.
 * Shows tool name for tool parts, "Thinking..." for reasoning.
 */
function getActionText(parts: StepsSummaryProps["parts"]): string {
  const lastPart = parts[parts.length - 1];
  if (!lastPart) return "Thinking...";

  if (lastPart.type.startsWith("tool-")) {
    const toolName = lastPart.type.replace(/^tool-/, "");
    return `Running ${toolName}`;
  }

  return "Thinking...";
}

export function StepsSummary({ parts, isStreaming, hasTextParts, messageId, onToolApproval }: StepsSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Activity is complete when: not streaming OR text has started streaming
  const isComplete = !isStreaming || hasTextParts;

  const stepCount = parts.length;
  const summaryText = isComplete
    ? `Done in ${stepCount} step${stepCount !== 1 ? "s" : ""}`
    : getActionText(parts);

  return (
    <div data-testid="steps-summary">
      <button
        type="button"
        data-testid="steps-summary-trigger"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isComplete ? (
          <span>{summaryText}</span>
        ) : (
          <Shimmer as="span" className="text-xs" duration={2}>
            {summaryText}
          </Shimmer>
        )}
        <span className="text-[10px]">{isOpen ? "▼" : "▶"}</span>
      </button>

      {isOpen && (
        <div data-testid="steps-summary-content" className="mt-1 space-y-3 ml-1 border-l border-border/40 pl-3">
          {parts.map((part, i) => {
            const key = `${messageId}-step-${i}`;

            if (part.type === "reasoning") {
              return (
                <Reasoning
                  key={key}
                  isStreaming={isStreaming && i === parts.length - 1}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{part.text as string}</ReasoningContent>
                </Reasoning>
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
              const toolName = toolPart.type.replace(/^tool-/, "");
              return (
                <ToolCallInline
                  key={key}
                  name={toolName}
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
        </div>
      )}
    </div>
  );
}
