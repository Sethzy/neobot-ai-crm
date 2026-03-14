/**
 * Compact pill-style tool call display inspired by Dorabot.
 * Collapsed: rounded pill with dot + tool name + chevron.
 * Expanded: args and result in light gray boxes below the pill.
 * @module components/chat/tool-call-inline
 */
"use client";

import { useState } from "react";

import { JsonView } from "@/components/ui/json-view";
import { cn } from "@/lib/utils";

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

/** Check if an output is a successful generate_pdf result with a download URL. */
function isPdfDownload(
  toolName: string,
  output: unknown,
): output is { success: true; download_url: string; filename?: string } {
  return (
    toolName === "generate_pdf" &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).success === true &&
    typeof (output as Record<string, unknown>).download_url === "string"
  );
}

export function ToolCallInline({ name, state, input, output, errorText, approvalId, onToolApproval }: ToolCallInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = state === "input-available" || state === "input-streaming";
  const isAwaitingApproval = state === "approval-requested";
  const isDenied = state === "output-denied";
  const hasError = state === "output-error";
  const pdfResult = isPdfDownload(name, output) ? output : null;

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

      {pdfResult && (
        <a
          data-testid="pdf-download-link"
          href={pdfResult.download_url}
          download={pdfResult.filename ?? "document.pdf"}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-3 mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {pdfResult.filename ?? "Download PDF"}
        </a>
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
