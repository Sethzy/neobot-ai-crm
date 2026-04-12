/**
 * Automation detail page shell with tabs and sidebar.
 * @module components/automations/automation-detail
 */
"use client";

import { useState } from "react";

import { AutomationHeader } from "@/components/automations/automation-header";
import { AutomationInstructions } from "@/components/automations/automation-instructions";
import { AutomationRuns } from "@/components/automations/automation-runs";
import { AutomationScheduleSidebar } from "@/components/automations/automation-schedule-sidebar";
import { useTrigger } from "@/hooks/use-triggers";
import { useTriggerRuns } from "@/hooks/use-trigger-runs";

interface AutomationDetailProps {
  triggerId: string;
}

export function AutomationDetail({ triggerId }: AutomationDetailProps) {
  const { data: trigger, isLoading, isError } = useTrigger(triggerId);
  const { data: runs = [], isLoading: runsLoading } = useTriggerRuns(triggerId);
  const [activeTab, setActiveTab] = useState<"instructions" | "runs">("runs");

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 px-4 py-6 md:px-12 md:py-10">
        <div className="h-6 w-32 rounded bg-muted/30" />
        <div className="h-10 w-64 rounded bg-muted/30" />
        <div className="h-4 w-48 rounded bg-muted/30" />
      </div>
    );
  }

  if (isError || !trigger) {
    return (
      <div className="px-4 py-6 md:px-12 md:py-10">
        <p className="text-sm text-destructive">Automation not found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="flex gap-8">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          <AutomationHeader trigger={trigger} />

          {/* Tabs */}
          <div className="mt-6 border-b border-border/40">
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
                Runs {runs.length > 0 ? `(${runs.length})` : ""}
              </button>
            </nav>
          </div>

          {/* Tab content */}
          <div className="mt-6">
            {activeTab === "instructions" ? (
              <AutomationInstructions instructionPath={trigger.instruction_path} />
            ) : (
              <AutomationRuns runs={runs} isLoading={runsLoading} />
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="hidden w-72 shrink-0 lg:block">
          <AutomationScheduleSidebar trigger={trigger} />
        </div>
      </div>
    </div>
  );
}
