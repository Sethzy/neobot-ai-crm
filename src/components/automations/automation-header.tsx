/**
 * Automation detail page header with breadcrumb, title, and metadata pills.
 * Action buttons (Run now, enable toggle) live on the tabs row in the parent.
 * @module components/automations/automation-header
 */
"use client";

import { Clock, RefreshCw } from "@/components/icons/lucide-compat";
import { cronToHuman, formatCountdown } from "@/lib/triggers/cron-display";
import type { Database } from "@/types/database";

type TriggerRow = Database["public"]["Tables"]["agent_triggers"]["Row"];

interface AutomationHeaderProps {
  trigger: TriggerRow;
}

export function AutomationHeader({ trigger }: AutomationHeaderProps) {
  const scheduleLabel = cronToHuman(trigger.cron_expression);
  const nextRunLabel =
    trigger.enabled && trigger.next_fire_at ? formatCountdown(trigger.next_fire_at) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {trigger.name}
      </h1>

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground/70" />
          {scheduleLabel}
        </span>
        {nextRunLabel ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
            Next run {nextRunLabel}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              trigger.enabled ? "bg-success" : "bg-muted-foreground/40"
            }`}
            aria-hidden
          />
          <span className={trigger.enabled ? "text-foreground" : undefined}>
            {trigger.enabled ? "Active" : "Disabled"}
          </span>
        </span>
      </div>
    </div>
  );
}
