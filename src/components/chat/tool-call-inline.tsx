/**
 * Compact inline tool renderer with richer connection-specific cards.
 * @module components/chat/tool-call-inline
 */
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JsonView } from "@/components/ui/json-view";
import { useBrowserAuth } from "@/hooks/use-browser-auth";
import { getBrowserPlatformConfig } from "@/lib/browser-use/platforms";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, LoaderIcon, XCircleIcon } from "lucide-react";

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
  /** The approval payload persisted by the AI SDK for approval states. */
  approval?: { id?: string; approved?: boolean };
  /** Callback for approve/deny actions. Receives (approvalId, approved). */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /**
   * When true, keeps the spinner visible even after the tool completes.
   * Used for the last tool in a streaming response while the agent processes
   * the result and decides what to do next.
   */
  keepSpinning?: boolean;
}

interface ConnectionResult {
  integrationId: string;
  displayName: string;
  description: string;
  connectionStatus: "pending_auth";
  redirectUrl: string;
  composioConnectedAccountId: string;
}

type ConnectionCardStatus = ConnectionResult["connectionStatus"] | "active" | "error";

interface PermissionRequestInput {
  connections: Array<{
    connectionId: string;
    activate: string[];
    deactivate: string[];
  }>;
}

interface RequestedToolChange {
  toolSlug: string;
  action: "activate" | "deactivate";
}

/** Check if an output is a successful generate_pdf result with a download URL. */
function isPdfDownload(
  toolName: string,
  output: unknown,
): output is { success: true; download_url: string; filename?: string } {
  return (
    toolName === "generate_pdf"
    && output !== null
    && typeof output === "object"
    && (output as Record<string, unknown>).success === true
    && typeof (output as Record<string, unknown>).download_url === "string"
  );
}

/** Check if browse_website returned an auth-required result. */
function isBrowserNeedsAuth(
  toolName: string,
  output: unknown,
): output is { success: false; needsAuth: true; platform: string; error?: string } {
  return (
    toolName === "browse_website"
    && output !== null
    && typeof output === "object"
    && (output as Record<string, unknown>).success === false
    && (output as Record<string, unknown>).needsAuth === true
    && typeof (output as Record<string, unknown>).platform === "string"
  );
}

function isConnectionCreation(
  toolName: string,
  output: unknown,
): output is { success: true; results: ConnectionResult[] } {
  return (
    (toolName === "create_connection" || toolName === "create_new_connections")
    && output !== null
    && typeof output === "object"
    && (output as Record<string, unknown>).success === true
    && Array.isArray((output as Record<string, unknown>).results)
  );
}

function isToolPermissionRequest(
  toolName: string,
  input: unknown,
): input is PermissionRequestInput {
  return (
    toolName === "manage_activated_tools_for_connections"
    && input !== null
    && typeof input === "object"
    && Array.isArray((input as Record<string, unknown>).connections)
  );
}

function getRequestedToolChanges(input: PermissionRequestInput): RequestedToolChange[] {
  const toolChanges = new Map<string, RequestedToolChange>();

  for (const connection of input.connections) {
    for (const toolSlug of connection.activate) {
      toolChanges.set(`activate:${toolSlug}`, {
        toolSlug,
        action: "activate",
      });
    }

    for (const toolSlug of connection.deactivate) {
      toolChanges.set(`deactivate:${toolSlug}`, {
        toolSlug,
        action: "deactivate",
      });
    }
  }

  return [...toolChanges.values()];
}

function ConnectionModal({
  integrationName,
  redirectUrl,
  isOpen,
  onOpenChange,
  onContinue,
}: {
  integrationName: string;
  redirectUrl: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onContinue: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {integrationName}</DialogTitle>
          <DialogDescription>
            This connection is saved to your account. The agent only gets access after you approve the tools it should use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <Button
            type="button"
            onClick={() => {
              onContinue();
              window.open(redirectUrl, "_blank", "noopener,noreferrer");
              onOpenChange(false);
            }}
          >
            Continue to {integrationName}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionRow({ result }: { result: ConnectionResult }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasStartedOAuth, setHasStartedOAuth] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionCardStatus>(
    result.connectionStatus,
  );
  const [accountIdentifier, setAccountIdentifier] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isCancelled = false;

    const applyConnectionSnapshot = (snapshot: {
      status?: string | null;
      account_identifier?: string | null;
    }) => {
      if (snapshot.status === "active") {
        setConnectionStatus("active");
      } else if (snapshot.status === "error") {
        setConnectionStatus("error");
      } else if (typeof snapshot.status === "string") {
        setHasStartedOAuth(true);
      }

      if (typeof snapshot.account_identifier === "string") {
        setAccountIdentifier(snapshot.account_identifier);
      }
    };

    void supabase
      .from("connections")
      .select("status, account_identifier")
      .eq("composio_connected_account_id", result.composioConnectedAccountId)
      .maybeSingle()
      .then(({ data }) => {
        if (!isCancelled && data) {
          applyConnectionSnapshot(data);
        }
      });

    const channel = supabase
      .channel(`connection-card:${result.composioConnectedAccountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `composio_connected_account_id=eq.${result.composioConnectedAccountId}`,
        },
        (payload) => {
          const nextRow = (payload as {
            new?: { status?: string; account_identifier?: string | null };
          }).new;

          if (nextRow) {
            applyConnectionSnapshot(nextRow);
          }
        },
      )
      .subscribe();

    return () => {
      isCancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [result.composioConnectedAccountId]);

  const isConnected = connectionStatus === "active";
  const hasFailed = connectionStatus === "error";

  return (
    <div className="rounded-lg border border-border/60 bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{result.displayName}</p>
            {isConnected ? <Badge variant="outline">Connected</Badge> : null}
            {hasFailed ? <Badge variant="outline">Needs retry</Badge> : null}
            {!isConnected && !hasFailed && hasStartedOAuth ? (
              <Badge variant="outline">Awaiting login</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{result.description}</p>
          {accountIdentifier ? (
            <p className="text-xs text-muted-foreground">{accountIdentifier}</p>
          ) : null}
        </div>

        {isConnected ? null : (
          <Button
            size="sm"
            type="button"
            variant={hasStartedOAuth ? "outline" : "default"}
            onClick={() => setIsModalOpen(true)}
          >
            Connect {result.displayName}
          </Button>
        )}
      </div>

      <ConnectionModal
        integrationName={result.displayName}
        redirectUrl={result.redirectUrl}
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        onContinue={() => setHasStartedOAuth(true)}
      />
    </div>
  );
}

function ConnectionCard({ results }: { results: ConnectionResult[] }) {
  return (
    <div
      className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
      data-testid="connection-card"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Create new connection?</p>
        <p className="text-sm text-muted-foreground">It will be saved to your account for future use.</p>
      </div>

      <div className="space-y-2">
        {results.map((result, i) => (
          <ConnectionRow key={result.composioConnectedAccountId ?? i} result={result} />
        ))}
      </div>
    </div>
  );
}

function PermissionCard({
  input,
  state,
  approval,
  approvalId,
  onToolApproval,
}: {
  input: PermissionRequestInput;
  state: ToolPartState;
  approval?: { approved?: boolean };
  approvalId?: string;
  onToolApproval?: (approvalId: string, approved: boolean) => void;
}) {
  const requestedToolChanges = getRequestedToolChanges(input);
  const isAwaitingApproval = state === "approval-requested";
  const isGranted = state === "output-available"
    || (state === "approval-responded" && approval?.approved === true);
  const isDenied = state === "output-denied"
    || (state === "approval-responded" && approval?.approved === false);

  return (
    <div
      className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
      data-testid="permission-card"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">Grant permissions to agent?</p>
          {isGranted ? <Badge variant="outline">Granted</Badge> : null}
          {isDenied ? <Badge variant="outline">Denied</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          The agent is requesting access to the following connection tools.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {requestedToolChanges.map(({ toolSlug, action }) => (
          <Badge
            key={`${action}:${toolSlug}`}
            variant={action === "activate" ? "secondary" : "outline"}
          >
            {action === "deactivate" ? `Removing ${toolSlug}` : toolSlug}
          </Badge>
        ))}
      </div>

      {isAwaitingApproval && onToolApproval && approvalId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => onToolApproval(approvalId, true)}>
            Grant Permissions
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onToolApproval(approvalId, false)}
          >
            Deny
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ToolCallInline({
  name,
  state,
  input,
  output,
  errorText,
  approvalId,
  approval,
  onToolApproval,
  keepSpinning = false,
}: ToolCallInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const connectionCreation = isConnectionCreation(name, output) ? output : null;
  const permissionRequest = isToolPermissionRequest(name, input) ? input : null;
  const authNeeded = isBrowserNeedsAuth(name, output) ? output : null;
  const authPlatformConfig = authNeeded
    ? getBrowserPlatformConfig(authNeeded.platform)
    : null;
  const { state: browserAuthState, connect, verify, reset } = useBrowserAuth(authNeeded?.platform);
  const isRunning =
    state === "input-available" ||
    state === "input-streaming" ||
    (keepSpinning && state === "output-available");
  const isAwaitingApproval = state === "approval-requested";
  const isDenied = state === "output-denied";
  const hasError = state === "output-error";
  const pdfResult = isPdfDownload(name, output) ? output : null;

  if (connectionCreation) {
    return <ConnectionCard results={connectionCreation.results} />;
  }

  if (permissionRequest && state !== "output-error") {
    return (
      <PermissionCard
        input={permissionRequest}
        state={state}
        approval={approval}
        approvalId={approvalId}
        onToolApproval={onToolApproval}
      />
    );
  }

  const StatusIcon = isRunning
    ? LoaderIcon
    : hasError || isDenied ? XCircleIcon
    : CheckIcon;

  const statusLabel = isDenied
    ? "Denied"
    : isAwaitingApproval ? "Awaiting approval"
    : isRunning ? "Running"
    : "Used tool";

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      data-testid="tool-call-inline"
      className={cn(
        "max-w-sm",
        isDenied && "opacity-60",
      )}
    >
      <CollapsibleTrigger
        data-testid="tool-expand-trigger"
        className="group/trigger inline-flex items-center gap-1.5 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <StatusIcon
          data-testid="tool-dot"
          className={cn(
            "size-4 shrink-0",
            isRunning && "animate-spin",
            isDenied && "text-muted-foreground",
            isAwaitingApproval && "text-warning",
          )}
        />
        <span
          className={cn(
            "relative inline-block text-left leading-none",
            isDenied && "line-through",
          )}
        >
          <span>{statusLabel}: <b>{name}</b></span>
          {isRunning ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 animate-pulse"
            >
              {statusLabel}: <b>{name}</b>
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          data-testid="tool-chevron"
          className={cn(
            "size-4 shrink-0 transition-transform duration-200",
            isOpen ? "rotate-0" : "-rotate-90",
          )}
        />
      </CollapsibleTrigger>

      {isAwaitingApproval && onToolApproval && approvalId ? (
        <div data-testid="tool-approval-actions" className="ml-2 mt-1.5 flex items-center gap-2 border-l-2 border-approval/30 pl-3">
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
      ) : null}

      {pdfResult ? (
        <a
          data-testid="pdf-download-link"
          href={pdfResult.download_url}
          download={pdfResult.filename ?? "document.pdf"}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 ml-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {pdfResult.filename ?? "Download PDF"}
        </a>
      ) : null}

      {authNeeded ? (
        <div
          data-testid="browser-auth-card"
          className="ml-2 mt-1.5 space-y-2 rounded-md border border-warning/20 bg-warning/5 p-3"
        >
          <p className="text-xs text-foreground">
            Access to <span className="font-medium">{authPlatformConfig?.label ?? authNeeded.platform}</span> requires login.
          </p>

          {browserAuthState.status === "awaiting-login" && browserAuthState.liveUrl ? (
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
          ) : null}

          {browserAuthState.status === "done" ? (
            <p className="text-xs text-success">
              Connection saved. Retry your request to continue.
            </p>
          ) : null}

          {browserAuthState.status !== "awaiting-login"
          && browserAuthState.status !== "verifying"
          && browserAuthState.status !== "done" ? (
            <button
              type="button"
              className="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-warning-foreground transition-colors hover:opacity-90"
              onClick={() => void connect(authNeeded.platform)}
            >
              Connect {authPlatformConfig?.label ?? authNeeded.platform}
            </button>
          ) : null}

          {browserAuthState.status === "awaiting-login" ? (
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
          ) : null}

          {browserAuthState.status === "verifying" ? (
            <p className="text-xs text-foreground">
              Verifying login...
            </p>
          ) : null}

          {authNeeded.error ? (
            <p className="text-xs text-muted-foreground">
              {authNeeded.error}
            </p>
          ) : null}
        </div>
      ) : null}

      <CollapsibleContent className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div data-testid="tool-details" className="ml-2 mt-1.5 flex flex-col gap-2 border-l-2 border-muted-foreground/15 pl-3">
          <div>
            <p className="mb-0.5 text-xs font-medium text-muted-foreground/70">Arguments</p>
            <div
              data-testid="tool-arguments"
              className="overflow-x-auto rounded bg-muted/30 px-2 py-1.5"
            >
              <JsonView data={input} />
            </div>
          </div>

          {hasError && errorText ? (
            <div>
              <p className="mb-0.5 text-xs font-medium text-destructive/70">Error</p>
              <pre className="overflow-x-auto rounded bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                {errorText}
              </pre>
            </div>
          ) : !isDenied && output !== undefined ? (
            <div>
              <p className="mb-0.5 text-xs font-medium text-muted-foreground/70">Result</p>
              <div
                data-testid="tool-result"
                className="overflow-x-auto rounded bg-muted/30 px-2 py-1.5"
              >
                <JsonView data={output} />
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
