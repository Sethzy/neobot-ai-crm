/**
 * Explicit responsive table for user-created automations.
 * @module components/automations/automations-table
 */
"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AutomationTrigger } from "@/hooks/use-triggers";
import { formatCrmDate } from "@/lib/crm/display";

interface AutomationsTableProps {
  triggers: AutomationTrigger[];
  pendingTriggerId?: string | null;
  onToggleEnabled: (triggerId: string, enabled: boolean) => void;
}

const triggerTypeLabelMap: Record<AutomationTrigger["trigger_type"], string> = {
  schedule: "Schedule",
  webhook: "Webhook",
  rss: "RSS",
  pulse: "Pulse",
};

function getStatusVariant(
  trigger: Pick<AutomationTrigger, "enabled" | "last_status">,
): ComponentProps<typeof Badge>["variant"] {
  if (!trigger.enabled) {
    return "outline";
  }

  switch (trigger.last_status) {
    case "completed":
      return "success";
    case "failed":
    case "failed_permanent":
      return "destructive";
    case "dispatch_failed":
    case "invalid_cron":
    case "invalid_rss_config":
      return "warning";
    case "queued":
    case "skipped_thread_busy":
    case "skipped_quiet_hours":
      return "secondary";
    default:
      return "secondary";
  }
}

function formatStatus(trigger: Pick<AutomationTrigger, "enabled" | "last_status">): string {
  if (!trigger.enabled) {
    return "Disabled";
  }

  if (!trigger.last_status) {
    return "Ready";
  }

  return trigger.last_status.replaceAll("_", " ");
}

function formatConfig(trigger: AutomationTrigger): string {
  switch (trigger.trigger_type) {
    case "schedule":
      return trigger.cron_expression ?? "—";
    case "rss": {
      const p = trigger.payload as Record<string, unknown> | null;
      return typeof p?.feed_url === "string" ? p.feed_url : "—";
    }
    case "webhook":
      return "Public inbound URL";
    default:
      return "—";
  }
}

export function AutomationsTable({
  triggers,
  pendingTriggerId,
  onToggleEnabled,
}: AutomationsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
      <table className="w-full min-w-[760px]">
        <thead className="border-b border-border/40 bg-muted/20">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Config
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Last run
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Next run
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {triggers.map((trigger) => {
            const isPending = pendingTriggerId === trigger.id;

            return (
              <tr key={trigger.id} className="border-t border-border/30">
                <td className="px-4 py-4 align-top">
                  <div className="font-medium text-foreground/90">{trigger.name}</div>
                  {trigger.invocation_message ? (
                    <p className="mt-1 text-xs text-muted-foreground">{trigger.invocation_message}</p>
                  ) : null}
                </td>
                <td className="px-4 py-4 align-top text-sm text-foreground/80">
                  {triggerTypeLabelMap[trigger.trigger_type]}
                </td>
                <td className="px-4 py-4 align-top text-sm text-muted-foreground">
                  {formatConfig(trigger)}
                </td>
                <td className="px-4 py-4 align-top">
                  <Badge variant={getStatusVariant(trigger)}>{formatStatus(trigger)}</Badge>
                </td>
                <td className="px-4 py-4 align-top text-sm text-muted-foreground">
                  {formatCrmDate(trigger.last_fired_at)}
                </td>
                <td className="px-4 py-4 align-top text-sm text-muted-foreground">
                  {formatCrmDate(trigger.next_fire_at)}
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => onToggleEnabled(trigger.id, !trigger.enabled)}
                    >
                      {isPending ? "Saving..." : trigger.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" asChild>
                      <Link href={`/chat/${trigger.thread_id}`}>View thread</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
