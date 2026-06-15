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
            <h3 className="mb-3 type-section-title">Active</h3>
            <div className="surface-app divide-y divide-app-border-subtle/70 overflow-hidden p-0">
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
            <h3 className="mb-3 type-section-title">Inactive</h3>
            <div className="surface-app divide-y divide-app-border-subtle/70 overflow-hidden p-0">
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
  const scheduleLabel = cronToHuman(trigger.cron_expression);
  const nextRunLabel = formatCountdown(trigger.next_fire_at);

  return (
    <div
      data-testid={`automation-row-${trigger.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-app-hover/60 max-sm:items-start"
    >
      <Link
        href={`/automations/${trigger.id}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 sm:min-h-0"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="type-row-title text-foreground">{trigger.name}</span>
            <Badge variant={getStatusVariant(trigger)}>
              {getStatusLabel(trigger)}
            </Badge>
          </div>
          <span className="mt-1 block type-row-meta text-muted-foreground">
            {scheduleLabel === "\u2014" ? "Trigger configured" : scheduleLabel}
          </span>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-4 max-sm:flex-col max-sm:items-end max-sm:gap-2">
        {trigger.enabled && nextRunLabel !== "\u2014" ? (
          <span className="rounded-full bg-app-surface-muted px-2 py-1 type-row-meta text-muted-foreground">
            {nextRunLabel}
          </span>
        ) : null}
        <Switch
          aria-label={trigger.enabled ? `Disable ${trigger.name}` : `Enable ${trigger.name}`}
          checked={trigger.enabled}
          onCheckedChange={(checked) => {
            onToggleEnabled(trigger.id, checked);
          }}
        />
      </div>
    </div>
  );
}
