/**
 * Automations page for browsing and enabling/disabling user-created triggers.
 * @module app/(dashboard)/automations/page
 */
"use client";

import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icons";
import { Plus } from "@/components/icons/lucide-compat";
import { AutomationsList } from "@/components/automations/automations-list";
import { Button } from "@/components/ui/button";
import { useSetTriggerEnabled, useTriggers } from "@/hooks/use-triggers";

export default function AutomationsPage() {
  const { data: triggers = [], isLoading, isError, refetch } = useTriggers();
  const setTriggerEnabled = useSetTriggerEnabled();
  const pendingTriggerId = setTriggerEnabled.variables?.triggerId ?? null;

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Automations</h1>
          <p className="mt-2 text-sm text-muted-foreground/80">
            Review scheduled jobs, inbound webhooks, and RSS monitors created from chat.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/chat">
            <Plus className="mr-1.5 h-4 w-4" />
            New automation
          </Link>
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load automations</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : triggers.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <AppIcon name="automations" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">No automations yet</p>
          </div>
        ) : (
          <AutomationsList
            triggers={triggers}
            pendingTriggerId={pendingTriggerId}
            onToggleEnabled={(triggerId, enabled) => {
              setTriggerEnabled.mutate({ triggerId, enabled });
            }}
          />
        )}
      </div>

    </div>
  );
}
