/**
 * Card-style list of automations grouped by active/inactive.
 * Replaces the old AutomationsTable.
 * @module components/automations/automations-list
 */
"use client";

import Link from "next/link";

import { Switch } from "@/components/ui/switch";
import type { AutomationTrigger } from "@/hooks/use-triggers";
import { cronToHuman, formatCountdown } from "@/lib/triggers/cron-display";

interface AutomationsListProps {
  triggers: AutomationTrigger[];
  pendingTriggerId?: string | null;
  onToggleEnabled: (triggerId: string, enabled: boolean) => void;
}

export function AutomationsList({
  triggers,
  pendingTriggerId,
  onToggleEnabled,
}: AutomationsListProps) {
  const active = triggers.filter((t) => t.enabled);
  const inactive = triggers.filter((t) => !t.enabled);

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Active
          </h3>
          <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-card shadow-sm">
            {active.map((trigger) => (
              <AutomationRow
                key={trigger.id}
                trigger={trigger}
                isPending={pendingTriggerId === trigger.id}
                onToggleEnabled={onToggleEnabled}
              />
            ))}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Inactive
          </h3>
          <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-card shadow-sm">
            {inactive.map((trigger) => (
              <AutomationRow
                key={trigger.id}
                trigger={trigger}
                isPending={pendingTriggerId === trigger.id}
                onToggleEnabled={onToggleEnabled}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AutomationRow({
  trigger,
  isPending,
  onToggleEnabled,
}: {
  trigger: AutomationTrigger;
  isPending: boolean;
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
          disabled={isPending}
          onCheckedChange={(checked) => {
            onToggleEnabled(trigger.id, checked);
          }}
        />
      </div>
    </div>
  );
}
