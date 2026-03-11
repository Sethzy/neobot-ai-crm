/**
 * Compact pill-style tool call display inspired by Dorabot.
 * Collapsed: rounded pill with dot + tool name + chevron.
 * Expanded: args and result in light gray boxes below the pill.
 * @module components/chat/tool-call-inline
 */
"use client";

import { useState } from "react";
import type { Spec, StateModel } from "@json-render/react";

import { JsonView } from "@/components/ui/json-view";
import { cn } from "@/lib/utils";
import { ShowViewInline } from "./show-view-inline";

export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error";

interface ToolCallInlineProps {
  name: string;
  state: ToolPartState;
  input: unknown;
  output?: unknown;
  errorText?: string;
  /** The approval ID from `part.approval.id` when state is approval-requested. */
  approvalId?: string;
  /** Callback for approve/deny actions. Receives (approvalId, approved). */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
}

function isRenderableShowViewOutput(
  output: unknown,
): output is { success: true; spec: Spec; state: StateModel } {
  if (typeof output !== "object" || output === null) {
    return false;
  }

  const candidate = output as {
    success?: unknown;
    spec?: unknown;
    state?: unknown;
  };

  return (
    candidate.success === true &&
    typeof candidate.spec === "object" &&
    candidate.spec !== null &&
    typeof candidate.state === "object" &&
    candidate.state !== null &&
    !Array.isArray(candidate.state)
  );
}

export function ToolCallInline({ name, state, input, output, errorText, approvalId, onToolApproval }: ToolCallInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = state === "input-available" || state === "input-streaming";
  const isAwaitingApproval = state === "approval-requested";
  const isDenied = state === "output-denied";
  const hasError = state === "output-error";

  if (
    name === "show_view" &&
    state === "output-available" &&
    isRenderableShowViewOutput(output)
  ) {
    return <ShowViewInline spec={output.spec} state={output.state} />;
  }

  return (
    <div data-testid="tool-call-inline">
      <button
        type="button"
        data-testid="tool-expand-trigger"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          data-testid="tool-dot"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50",
            isRunning && "animate-pulse bg-foreground/50",
            isAwaitingApproval && "animate-pulse bg-amber-500",
            isDenied && "bg-orange-500",
          )}
        />
        <span>{name}</span>
        {isDenied && (
          <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
            Denied
          </span>
        )}
        <span data-testid="tool-chevron" className="text-[10px] text-muted-foreground/40">›</span>
      </button>

      {isAwaitingApproval && onToolApproval && approvalId && (
        <div data-testid="tool-approval-actions" className="ml-3 mt-1 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
            aria-label="Approve"
            onClick={() => onToolApproval(approvalId, true)}
          >
            Approve
          </button>
          <button
            type="button"
            className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
            aria-label="Deny"
            onClick={() => onToolApproval(approvalId, false)}
          >
            Deny
          </button>
        </div>
      )}

      {isOpen && (
        <div data-testid="tool-details" className="ml-3 mt-0.5 space-y-1.5">
          <div>
            <p className="text-xs font-medium text-muted-foreground/70 mb-0.5">Arguments</p>
            <div
              data-testid="tool-arguments"
              className="rounded bg-muted/30 px-2 py-1.5 overflow-x-auto"
            >
              <JsonView data={input} />
            </div>
          </div>

          {hasError && errorText ? (
            <div>
              <p className="text-xs font-medium text-destructive/70 mb-0.5">Error</p>
              <pre className="rounded bg-destructive/5 px-2 py-1.5 text-xs text-destructive overflow-x-auto">
                {errorText}
              </pre>
            </div>
          ) : !isDenied && output !== undefined ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground/70 mb-0.5">Result</p>
              <div
                data-testid="tool-result"
                className="rounded bg-muted/30 px-2 py-1.5 overflow-x-auto"
              >
                <JsonView data={output} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
