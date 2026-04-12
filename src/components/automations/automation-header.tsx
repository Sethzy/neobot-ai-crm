/**
 * Automation detail page header with name, schedule, status, toggle, and Run button.
 * @module components/automations/automation-header
 */
"use client";

import Link from "next/link";
import { toast } from "sonner";

import { AppIcon } from "@/components/icons/app-icons";
import { ArrowLeft } from "@/components/icons/lucide-compat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useManualRun } from "@/hooks/use-trigger-runs";
import { useSetTriggerEnabled } from "@/hooks/use-triggers";
import { cronToHuman, formatCountdown } from "@/lib/triggers/cron-display";
import type { Database } from "@/types/database";

type TriggerRow = Database["public"]["Tables"]["agent_triggers"]["Row"];

interface AutomationHeaderProps {
  trigger: TriggerRow;
}

export function AutomationHeader({ trigger }: AutomationHeaderProps) {
  const setTriggerEnabled = useSetTriggerEnabled();
  const manualRun = useManualRun(trigger.id);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Link
        href="/automations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Automations
      </Link>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <AppIcon name="automations" className="h-5 w-5 shrink-0 text-muted-foreground" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {trigger.name}
            </h1>
            <Badge variant={trigger.enabled ? "default" : "secondary"}>
              {trigger.enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {cronToHuman(trigger.cron_expression)}
            {trigger.enabled && trigger.next_fire_at ? (
              <span className="ml-2 text-muted-foreground/60">
                &middot; Next: {formatCountdown(trigger.next_fire_at)}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              manualRun.mutate(undefined, {
                onSuccess: () => toast.success("Run started"),
                onError: (err) => toast.error(err.message),
              });
            }}
            disabled={manualRun.isPending}
          >
            {manualRun.isPending ? "Running..." : "Run"}
          </Button>
          <Switch
            checked={trigger.enabled}
            disabled={setTriggerEnabled.isPending}
            onCheckedChange={(checked) => {
              setTriggerEnabled.mutate({ triggerId: trigger.id, enabled: checked });
            }}
          />
        </div>
      </div>
    </div>
  );
}
