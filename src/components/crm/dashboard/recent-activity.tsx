/**
 * Recent interactions panel for the customers dashboard.
 * @module components/crm/dashboard/recent-activity
 */
"use client";

import Link from "next/link";

import { interactionTypeIconMap } from "@/components/crm/interaction-timeline";
import { AppIcon } from "@/components/icons/app-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRecentInteractions } from "@/hooks/use-recent-interactions";
import { formatContactFullName, formatCrmEnumLabel } from "@/lib/crm/display";

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

/**
 * Formats an interaction timestamp into a short relative label for dashboard scanning.
 */
export function formatRelativeInteractionTime(
  occurredAt: string,
  now: Date = new Date(),
): string {
  const differenceMs = new Date(occurredAt).getTime() - now.getTime();
  const differenceMinutes = Math.round(differenceMs / (60 * 1000));
  const absoluteMinutes = Math.abs(differenceMinutes);

  if (absoluteMinutes < 1) {
    return "just now";
  }

  if (absoluteMinutes < 60) {
    return relativeTimeFormatter.format(differenceMinutes, "minute");
  }

  const differenceHours = Math.round(differenceMinutes / 60);
  const absoluteHours = Math.abs(differenceHours);

  if (absoluteHours < 24) {
    return relativeTimeFormatter.format(differenceHours, "hour");
  }

  const differenceDays = Math.round(differenceHours / 24);
  const absoluteDays = Math.abs(differenceDays);

  if (absoluteDays < 7) {
    return relativeTimeFormatter.format(differenceDays, "day");
  }

  if (absoluteDays < 30) {
    return relativeTimeFormatter.format(Math.round(differenceDays / 7), "week");
  }

  return new Date(occurredAt).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });
}

/**
 * Renders the latest cross-contact interactions with direct links to people detail pages.
 */
export function RecentActivity() {
  const {
    data: interactions = [],
    isLoading,
    isError,
    refetch,
  } = useRecentInteractions(5);

  return (
    <section className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Recent Activity
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The latest calls, emails, viewings, and notes captured by your agent.
          </p>
        </div>
        <Link
          href="/customers/people"
          className="shrink-0 whitespace-nowrap text-right text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-xl bg-muted/40"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              Unable to load recent activity.
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
        ) : interactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No recent activity yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {interactions.map((interaction) => {
              const contactName = interaction.contacts
                ? formatContactFullName(interaction.contacts)
                : "Unknown contact";
              const summary =
                interaction.summary?.trim() || formatCrmEnumLabel(interaction.type);

              return (
                <Link
                  key={interaction.interaction_id}
                  href={`/customers/people/${interaction.contact_id}`}
                  className="group flex gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border/60 hover:bg-muted/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors group-hover:bg-muted">
                    <AppIcon
                      name={interactionTypeIconMap[interaction.type] ?? "note"}
                      className="h-4 w-4"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {contactName}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {formatCrmEnumLabel(interaction.type)}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatRelativeInteractionTime(interaction.occurred_at)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {summary}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
