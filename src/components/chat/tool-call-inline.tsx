/**
 * Compact pill-style tool call display inspired by Dorabot.
 * Collapsed: rounded pill with dot + tool name + chevron.
 * Expanded: args and result in light gray boxes below the pill.
 * @module components/chat/tool-call-inline
 */
"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

interface ToolCallInlineProps {
  name: string;
  state: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
}

export function ToolCallInline({ name, state, input, output, errorText }: ToolCallInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = state === "input-available" || state === "input-streaming";
  const hasError = state === "output-error";

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
          )}
        />
        <span>{name}</span>
        <span data-testid="tool-chevron" className="text-[10px] text-muted-foreground/40">›</span>
      </button>

      {isOpen && (
        <div data-testid="tool-details" className="ml-3 mt-0.5 space-y-1.5">
          <div>
            <p className="text-xs font-medium text-muted-foreground/70 mb-0.5">Arguments</p>
            <pre
              data-testid="tool-arguments"
              className="rounded bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground overflow-x-auto"
            >
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>

          {hasError && errorText ? (
            <div>
              <p className="text-xs font-medium text-destructive/70 mb-0.5">Error</p>
              <pre className="rounded bg-destructive/5 px-2 py-1.5 text-xs text-destructive overflow-x-auto">
                {errorText}
              </pre>
            </div>
          ) : output !== undefined ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground/70 mb-0.5">Result</p>
              <pre
                data-testid="tool-result"
                className="rounded bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground overflow-x-auto"
              >
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
