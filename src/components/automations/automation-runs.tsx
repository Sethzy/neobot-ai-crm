/**
 * Runs tab listing past automation runs grouped by date.
 * @module components/automations/automation-runs
 */
"use client";

import Link from "next/link";

import type { TriggerRun } from "@/hooks/use-trigger-runs";

interface AutomationRunsProps {
  runs: TriggerRun[];
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-info",
  completed: "bg-success",
  failed: "bg-destructive",
};

function groupRunsByDate(runs: TriggerRun[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; runs: TriggerRun[] }[] = [];
  const todayRuns: TriggerRun[] = [];
  const yesterdayRuns: TriggerRun[] = [];
  const earlierRuns: TriggerRun[] = [];

  for (const run of runs) {
    const runDate = new Date(run.created_at);
    runDate.setHours(0, 0, 0, 0);

    if (runDate.getTime() === today.getTime()) {
      todayRuns.push(run);
    } else if (runDate.getTime() === yesterday.getTime()) {
      yesterdayRuns.push(run);
    } else {
      earlierRuns.push(run);
    }
  }

  if (todayRuns.length > 0) groups.push({ label: "Today", runs: todayRuns });
  if (yesterdayRuns.length > 0) groups.push({ label: "Yesterday", runs: yesterdayRuns });
  if (earlierRuns.length > 0) groups.push({ label: "Earlier", runs: earlierRuns });

  return groups;
}

export function AutomationRuns({ runs, isLoading }: AutomationRunsProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted/30" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">No runs yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Runs will appear here after the automation executes.
        </p>
      </div>
    );
  }

  const groups = groupRunsByDate(runs);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.label}>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </h4>
          <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-card shadow-sm">
            {group.runs.map((run) => (
              <RunRow key={run.run_id} run={run} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RunRow({ run }: { run: TriggerRun }) {
  const time = new Date(run.created_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const content = (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[run.status] ?? "bg-muted-foreground"}`}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
        {run.thread_title || "Untitled run"}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
    </div>
  );

  if (run.run_thread_id) {
    return (
      <Link href={`/chat/${run.run_thread_id}`}>
        {content}
      </Link>
    );
  }

  return content;
}
