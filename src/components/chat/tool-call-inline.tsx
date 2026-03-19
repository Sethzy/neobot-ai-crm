/**
 * Compact pill-style tool call display inspired by Dorabot.
 * Collapsed: rounded pill with dot + tool name + chevron.
 * Expanded: args and result in light gray boxes below the pill.
 * @module components/chat/tool-call-inline
 */
"use client";

import { useState } from "react";

import { JsonView } from "@/components/ui/json-view";
import { useBrowserAuth } from "@/hooks/use-browser-auth";
import { getBrowserPlatformConfig } from "@/lib/browser-use/platforms";
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

/** Check if browse_website returned an auth-required result. */
function isBrowserNeedsAuth(
  toolName: string,
  output: unknown,
): output is { success: false; needsAuth: true; platform: string; error?: string } {
  return (
    toolName === "browse_website" &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).success === false &&
    (output as Record<string, unknown>).needsAuth === true &&
    typeof (output as Record<string, unknown>).platform === "string"
  );
}

export function ToolCallInline({ name, state, input, output, errorText, approvalId, onToolApproval }: ToolCallInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const authNeeded = isBrowserNeedsAuth(name, output) ? output : null;
  const authPlatformConfig = authNeeded
    ? getBrowserPlatformConfig(authNeeded.platform)
    : null;
  const { state: browserAuthState, connect, verify, reset } = useBrowserAuth(authNeeded?.platform);
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
            isAwaitingApproval && "animate-pulse bg-approval",
            isDenied && "bg-denied",
          )}
        />
        <span>{name}</span>
        {isDenied && (
          <span className="text-[10px] font-medium text-denied">
            Denied
          </span>
        )}
        <span data-testid="tool-chevron" className="text-[10px] text-muted-foreground/40">›</span>
      </button>

      {isAwaitingApproval && onToolApproval && approvalId && (
        <div data-testid="tool-approval-actions" className="ml-3 mt-1 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20"
            aria-label="Approve"
            onClick={() => onToolApproval(approvalId, true)}
          >
            Approve
          </button>
          <button
            type="button"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
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

      {authNeeded && (
        <div
          data-testid="browser-auth-card"
          className="ml-3 mt-1 space-y-2 rounded-md border border-warning/20 bg-warning/5 p-3"
        >
          <p className="text-xs text-foreground">
            Access to <span className="font-medium">{authPlatformConfig?.label ?? authNeeded.platform}</span> requires login.
          </p>

          {browserAuthState.status === "awaiting-login" && browserAuthState.liveUrl && (
            <div className="space-y-2">
              <iframe
                title={`${authNeeded.platform} login`}
                src={browserAuthState.liveUrl}
                className="h-80 w-full rounded-md border border-warning/20 bg-white"
              />
              <a
                href={browserAuthState.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs font-medium text-warning underline underline-offset-2"
              >
                Open in new tab
              </a>
            </div>
          )}

          {browserAuthState.status === "done" ? (
            <p className="text-xs text-success">
              Connection saved. Retry your request to continue.
            </p>
          ) : null}

          {browserAuthState.status !== "awaiting-login" && browserAuthState.status !== "verifying" && browserAuthState.status !== "done" && (
            <button
              type="button"
              className="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-warning-foreground transition-colors hover:opacity-90"
              onClick={() => void connect(authNeeded.platform)}
            >
              Connect {authPlatformConfig?.label ?? authNeeded.platform}
            </button>
          )}

          {browserAuthState.status === "awaiting-login" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-warning-foreground transition-colors hover:opacity-90"
                onClick={() => void verify(authNeeded.platform)}
              >
                Done, I&apos;ve logged in
              </button>
              <button
                type="button"
                className="rounded-md border border-warning/30 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/10"
                onClick={() => reset(authNeeded.platform)}
              >
                Cancel
              </button>
            </div>
          )}

          {browserAuthState.status === "verifying" && (
            <p className="text-xs text-foreground">
              Verifying login...
            </p>
          )}

          {authNeeded.error ? (
            <p className="text-xs text-muted-foreground">
              {authNeeded.error}
            </p>
          ) : null}
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
