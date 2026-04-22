/**
 * Automation detail page shell. Reuses the CRM-style resizable inline
 * panel layout so the schedule editor sits in a collapsible right panel
 * that matches the rest of the app.
 * @module components/automations/automation-detail
 */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AutomationHeader } from "@/components/automations/automation-header";
import { AutomationInstructions } from "@/components/automations/automation-instructions";
import { AutomationRuns } from "@/components/automations/automation-runs";
import { AutomationScheduleSidebar } from "@/components/automations/automation-schedule-sidebar";
import { AppIcon } from "@/components/icons/app-icons";
import { PanelRightOpen, Play } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { preloadMarkdownEditor } from "@/components/ui/markdown-editor";
import { ResizableInlinePanelLayout } from "@/components/ui/resizable-inline-panel-layout";
import { Switch } from "@/components/ui/switch";
import { prefetchTriggerInstructions } from "@/hooks/use-trigger-instructions";
import { useTrigger, useSetTriggerEnabled } from "@/hooks/use-triggers";
import { useManualRun, useTriggerRuns } from "@/hooks/use-trigger-runs";

interface AutomationDetailProps {
  triggerId: string;
}

export function AutomationDetail({ triggerId }: AutomationDetailProps) {
  const { data: trigger, isLoading, isError } = useTrigger(triggerId);
  const { data: runs = [], isLoading: runsLoading } = useTriggerRuns(triggerId);
  const setTriggerEnabled = useSetTriggerEnabled();
  const manualRun = useManualRun(triggerId);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"instructions" | "runs">("instructions");
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  useEffect(() => {
    if (!trigger?.instruction_path) {
      return;
    }

    preloadMarkdownEditor();
    void prefetchTriggerInstructions(
      queryClient,
      trigger.id,
      trigger.instruction_path,
    );
  }, [queryClient, trigger?.id, trigger?.instruction_path]);

  if (isLoading || (!trigger && !isError)) {
    return (
      <LoadingShell />
    );
  }

  if (isError || !trigger) {
    return (
      <div className="px-4 py-6 md:px-12 md:py-10">
        <p className="type-control text-destructive">Automation not found.</p>
      </div>
    );
  }

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-2 bg-app-canvas px-3 py-4 md:px-6 lg:px-8">
      <nav className="flex min-w-0 items-center gap-1.5 type-control-muted text-muted-foreground">
        <AppIcon name="automations" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <Link href="/automations" className="transition-colors hover:text-foreground">
          Automations
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-foreground">{trigger.name}</span>
      </nav>

      <Button
        variant="ghost"
        size="sm"
        className={`shrink-0 gap-1.5 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          isPanelOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        tabIndex={isPanelOpen ? -1 : 0}
        onClick={() => setIsPanelOpen(true)}
      >
        <PanelRightOpen className="h-4 w-4" />
        <span className="hidden md:inline">Schedule</span>
      </Button>
    </div>
  );

  return (
    <ResizableInlinePanelLayout
      header={header}
      isPanelOpen={isPanelOpen}
      onClosePanel={() => setIsPanelOpen(false)}
      renderPanelContent={({ closeButton }) => (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-app-border-subtle px-4 py-3">
            {closeButton}
            <h2 className="type-toolbar-title text-foreground">Schedule</h2>
            <div className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <AutomationScheduleSidebar trigger={trigger} />
          </div>
        </div>
      )}
    >
      <div className="mx-auto w-full max-w-3xl px-2 pb-10 md:px-4">
        <AutomationHeader trigger={trigger} />

        <div className="mt-6 flex items-center justify-between border-b border-app-border-subtle">
          <nav className="-mb-px flex gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("instructions")}
              className={`pb-3 type-control transition-colors ${
                activeTab === "instructions"
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Instructions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("runs")}
              className={`pb-3 type-control transition-colors ${
                activeTab === "runs"
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Runs {runs.length > 0 ? runs.length : ""}
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-2 pb-2">
            <Switch
              checked={trigger.enabled}
              disabled={setTriggerEnabled.isPending}
              aria-label={trigger.enabled ? "Disable automation" : "Enable automation"}
              onCheckedChange={(checked) => {
                setTriggerEnabled.mutate({ triggerId: trigger.id, enabled: checked });
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                manualRun.mutate(undefined, {
                  onSuccess: () => toast.success("Run started"),
                  onError: (err) => toast.error(err.message),
                });
              }}
              disabled={manualRun.isPending}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {manualRun.isPending ? "Starting..." : "Run"}
            </Button>
          </div>
        </div>

        <div className="pt-6">
          {activeTab === "instructions" ? (
            <AutomationInstructions
              triggerId={trigger.id}
              instructionPath={trigger.instruction_path}
            />
          ) : (
            <AutomationRuns runs={runs} isLoading={runsLoading} />
          )}
        </div>
      </div>
    </ResizableInlinePanelLayout>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-canvas">
      <div className="h-16 shrink-0 border-b border-app-border-subtle bg-app-canvas" />
      <div className="px-3 pb-4 md:px-6 md:pb-6">
        <div className="surface-app animate-pulse space-y-4 p-10">
          <div className="h-4 w-40 rounded bg-muted/30" />
          <div className="h-8 w-64 rounded bg-muted/30" />
          <div className="h-4 w-80 rounded bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
