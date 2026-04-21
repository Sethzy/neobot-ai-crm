/**
 * Card-style list of automations grouped by active/inactive.
 * Replaces the old AutomationsTable.
 * @module components/automations/automations-list
 */
"use client";

import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { AutomationTrigger } from "@/hooks/use-triggers";
import { cronToHuman, formatCountdown } from "@/lib/triggers/cron-display";

interface AutomationsListProps {
  triggers: AutomationTrigger[];
  onToggleEnabled: (triggerId: string, enabled: boolean) => void;
}

function getStatusLabel(
  trigger: Pick<AutomationTrigger, "enabled" | "last_status" | "isRunning">,
): string {
  if (trigger.isRunning) {
    return "Busy";
  }

  if (!trigger.enabled) {
    return "Disabled";
  }

  switch (trigger.last_status) {
    case "failed":
    case "failed_permanent":
    case "dispatch_failed":
      return "Failed";
    case "skipped_quiet_hours":
      return "Waiting";
    default:
      return "Ready";
  }
}

function getStatusVariant(
  trigger: Pick<AutomationTrigger, "enabled" | "last_status" | "isRunning">,
): "default" | "secondary" | "destructive" | "warning" | "outline" {
  if (trigger.isRunning) {
    return "secondary";
  }

  if (!trigger.enabled) {
    return "outline";
  }

  switch (trigger.last_status) {
    case "failed":
    case "failed_permanent":
    case "dispatch_failed":
      return "destructive";
    case "skipped_quiet_hours":
      return "warning";
    default:
      return "default";
  }
}

export function AutomationsList({
  triggers,
  onToggleEnabled,
}: AutomationsListProps) {
  const active = triggers.filter((trigger) => trigger.enabled || trigger.isRunning);
  const inactive = triggers.filter((trigger) => !trigger.enabled && !trigger.isRunning);

  const rowTransition = { type: "spring" as const, stiffness: 500, damping: 42, mass: 0.6 };

  return (
    <LayoutGroup id="automations-list">
      <div className="space-y-6">
        {active.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Active
            </h3>
            <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-card shadow-sm">
              <AnimatePresence initial={false}>
                {active.map((trigger) => (
                  <motion.div
                    key={trigger.id}
                    layout
                    layoutId={`automation-row-${trigger.id}`}
                    transition={rowTransition}
                  >
                    <AutomationRow
                      trigger={trigger}
                      onToggleEnabled={onToggleEnabled}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {inactive.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Inactive
            </h3>
            <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-card shadow-sm">
              <AnimatePresence initial={false}>
                {inactive.map((trigger) => (
                  <motion.div
                    key={trigger.id}
                    layout
                    layoutId={`automation-row-${trigger.id}`}
                    transition={rowTransition}
                  >
                    <AutomationRow
                      trigger={trigger}
                      onToggleEnabled={onToggleEnabled}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}
      </div>
    </LayoutGroup>
  );
}

function AutomationRow({
  trigger,
  onToggleEnabled,
}: {
  trigger: AutomationTrigger;
  onToggleEnabled: (triggerId: string, enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/30">
      <Link
        href={`/automations/${trigger.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="min-w-0">
          <span className="font-medium text-foreground/90">{trigger.name}</span>
          <Badge
            variant={getStatusVariant(trigger)}
            className="ml-3 align-middle"
          >
            {getStatusLabel(trigger)}
          </Badge>
          <span className="ml-3 text-sm text-muted-foreground">
            {cronToHuman(trigger.cron_expression)}
          </span>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-4">
        {trigger.enabled && trigger.next_fire_at && (
          <span className="text-sm text-muted-foreground">
            {formatCountdown(trigger.next_fire_at)}
          </span>
        )}
        <Switch
          checked={trigger.enabled}
          onCheckedChange={(checked) => {
            onToggleEnabled(trigger.id, checked);
          }}
        />
      </div>
    </div>
  );
}
