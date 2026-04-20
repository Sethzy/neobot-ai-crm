/**
 * Automation detail page shell. Reuses the CRM-style resizable inline
 * panel layout so the schedule editor sits in a collapsible right panel
 * that matches the rest of the app.
 * @module components/automations/automation-detail
 */
"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { AutomationHeader } from "@/components/automations/automation-header";
import { AutomationInstructions } from "@/components/automations/automation-instructions";
import { AutomationRuns } from "@/components/automations/automation-runs";
import { AutomationScheduleSidebar } from "@/components/automations/automation-schedule-sidebar";
import { AppIcon } from "@/components/icons/app-icons";
import { PanelRightOpen, Play } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { ResizableInlinePanelLayout } from "@/components/ui/resizable-inline-panel-layout";
import { Switch } from "@/components/ui/switch";
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
  const [activeTab, setActiveTab] = useState<"instructions" | "runs">("runs");
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  if (isLoading) {
    return (
      <LoadingShell />
    );
  }

  if (isError || !trigger) {
    return (
      <div className="px-4 py-6 md:px-12 md:py-10">
        <p className="text-sm text-destructive">Automation not found.</p>
      </div>
    );
  }

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-2 bg-sidebar px-4 py-3 md:px-8">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <AppIcon name="automations" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <Link href="/automations" className="transition-colors hover:text-foreground">
          Automations
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-foreground">{trigger.name}</span>
      </nav>

      {!isPanelOpen ? (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setIsPanelOpen(true)}
        >
          <PanelRightOpen className="h-4 w-4" />
          <span className="hidden md:inline">Schedule</span>
        </Button>
      ) : null}
    </div>
  );

  return (
    <ResizableInlinePanelLayout
      header={header}
      bodyClassName="px-4 pt-6 pb-10 md:px-10 md:pt-8"
      isPanelOpen={isPanelOpen}
      onClosePanel={() => setIsPanelOpen(false)}
      renderPanelContent={({ closeButton }) => (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-2.5">
            {closeButton}
            <h2 className="text-sm font-semibold text-foreground">Schedule</h2>
            <div className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <AutomationScheduleSidebar trigger={trigger} />
          </div>
        </div>
      )}
    >
      <div className="mx-auto max-w-3xl">
        <AutomationHeader trigger={trigger} />

        <div className="mt-8 flex items-center justify-between border-b border-border/40">
          <nav className="-mb-px flex gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("instructions")}
              className={`pb-3 text-sm font-medium transition-colors ${
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
              className={`pb-3 text-sm font-medium transition-colors ${
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

        <div className="mt-6">
          {activeTab === "instructions" ? (
            <AutomationInstructions instructionPath={trigger.instruction_path} />
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar">
      <div className="h-12 shrink-0 bg-sidebar" />
      <div className="ml-3 flex-1 animate-pulse space-y-4 rounded-t-xl border-l border-t border-border/60 bg-card p-10 md:ml-4">
        <div className="h-4 w-40 rounded bg-muted/30" />
        <div className="h-8 w-64 rounded bg-muted/30" />
        <div className="h-4 w-80 rounded bg-muted/30" />
      </div>
    </div>
  );
}
