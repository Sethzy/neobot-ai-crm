/**
 * Client automations page body.
 *
 * The route server component prehydrates the trigger query for first paint.
 * This client component keeps the interactive mutation and realtime behavior.
 *
 * @module app/(dashboard)/automations/automations-page-client
 */
"use client";

import { AutomationLauncherComposer } from "@/components/automations/automation-launcher-composer";
import { AutomationsList } from "@/components/automations/automations-list";
import { AppIcon } from "@/components/icons/app-icons";
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useSetTriggerEnabled, useTriggers } from "@/hooks/use-triggers";

export function AutomationsPageClient() {
  const { data: triggers = [], isLoading, isError, refetch } = useTriggers();
  const setTriggerEnabled = useSetTriggerEnabled();

  return (
    <PageCanvas>
      <PageHeader
        title="Automations"
        description="Create and manage automated tasks that run on a schedule."
      />

      <div className="flex-1 pb-12 md:pb-16">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : isError ? (
          <PageSurface className="border-destructive/20 bg-destructive/5 p-6">
            <p className="type-control text-destructive">Unable to load automations</p>
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
          </PageSurface>
        ) : triggers.length === 0 ? (
          <PageSurface className="p-10 text-center md:p-20">
            <AppIcon name="automations" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 type-empty-title text-muted-foreground">No automations yet</p>
          </PageSurface>
        ) : (
          <AutomationsList
            triggers={triggers}
            onToggleEnabled={(triggerId, enabled) => {
              setTriggerEnabled.mutate({ triggerId, enabled });
            }}
          />
        )}
      </div>
      <AutomationLauncherComposer />
    </PageCanvas>
  );
}
