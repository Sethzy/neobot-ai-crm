/**
 * Client dashboard shell for the `/customers` landing page.
 * @module components/crm/dashboard/customers-dashboard
 */
"use client";

import { RecentActivity } from "@/components/crm/dashboard/recent-activity";
import { PipelineOverview } from "@/components/crm/dashboard/pipeline-overview";
import { StatCard } from "@/components/crm/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { formatCompactCurrency } from "@/lib/crm/display";

function formatPeopleSecondaryMetric(count: number): string {
  return count > 0 ? `+${count} this week` : "0 this week";
}

function formatTasksSecondaryMetric(count: number): string {
  return count > 0 ? `${count} overdue` : "Nothing overdue";
}

/**
 * Renders the approved customers dashboard layout without introducing widget plumbing.
 */
export function CustomersDashboard() {
  const { data: stats, isLoading, isError, refetch } = useDashboardStats();

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Customers
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Keep an eye on new people, live deals, and follow-up pressure from one
          place.
        </p>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-xl bg-muted/40"
              />
            ))}
          </div>
        ) : isError || !stats ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">
              Unable to load dashboard statistics.
            </p>
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
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              href="/customers/people"
              iconName="contacts"
              label="People"
              primaryMetric={String(stats.peopleTotal)}
              secondaryMetric={formatPeopleSecondaryMetric(stats.peopleNewThisWeek)}
            />
            <StatCard
              href="/customers/deals"
              iconName="deals"
              label="Deals"
              primaryMetric={String(stats.dealsTotal)}
              secondaryMetric={`${formatCompactCurrency(stats.dealsTotalValue)} total value`}
            />
            <StatCard
              href="/tasks"
              iconName="tasks"
              label="Tasks"
              primaryMetric={`${stats.tasksOpen} open`}
              secondaryMetric={formatTasksSecondaryMetric(stats.tasksOverdue)}
            />
            <StatCard
              href="/tasks"
              iconName="schedule"
              label="Due"
              primaryMetric={String(stats.tasksDueToday)}
              secondaryMetric="Open tasks due today"
            />
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RecentActivity />
        <PipelineOverview />
      </div>
    </div>
  );
}
