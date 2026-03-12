/**
 * Activity feed used by customer detail tabs.
 * @module components/crm/detail/activities-section
 */
"use client";

import { AppIcon } from "@/components/icons/app-icons";
import { interactionTypeIconMap } from "@/components/crm/interaction-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type InteractionWithContact,
  useContactInteractions,
  useDealInteractions,
} from "@/hooks/use-contact-relations";
import type { Interaction } from "@/lib/crm/schemas";
import { formatCrmDateTime } from "@/lib/crm/display";

type ActivityMode =
  | { kind: "contact"; contactId: string }
  | { kind: "deal"; dealId: string };

interface ActivitiesSectionProps {
  mode: ActivityMode;
  emptyLabel?: string;
}

interface ActivityEntry {
  interaction_id: string;
  type: string;
  summary: string | null;
  occurred_at: string;
  contactLabel?: string | null;
}

function normalizeContactInteractions(interactions: Interaction[]) {
  return interactions
    .filter((interaction) => interaction.type !== "note")
    .map<ActivityEntry>((interaction) => ({
      interaction_id: interaction.interaction_id,
      type: interaction.type,
      summary: interaction.summary,
      occurred_at: interaction.occurred_at,
    }));
}

function normalizeDealInteractions(interactions: InteractionWithContact[]) {
  return interactions.map<ActivityEntry>((interaction) => ({
    interaction_id: interaction.interaction_id,
    type: interaction.type,
    summary: interaction.summary,
    occurred_at: interaction.occurred_at,
    contactLabel: interaction.contacts
      ? `${interaction.contacts.first_name} ${interaction.contacts.last_name}`.trim()
      : null,
  }));
}

/**
 * Renders non-note interactions in the shared CRM card style.
 */
export function ActivitiesSection({
  mode,
  emptyLabel = "No activity recorded yet.",
}: ActivitiesSectionProps) {
  const contactQuery = useContactInteractions(mode.kind === "contact" ? mode.contactId : "");
  const dealQuery = useDealInteractions(mode.kind === "deal" ? mode.dealId : "");

  const isLoading = mode.kind === "contact" ? contactQuery.isLoading : dealQuery.isLoading;
  const isError = mode.kind === "contact" ? contactQuery.isError : dealQuery.isError;
  const refetch = mode.kind === "contact" ? contactQuery.refetch : dealQuery.refetch;
  const rows = mode.kind === "contact"
    ? normalizeContactInteractions(contactQuery.data ?? [])
    : normalizeDealInteractions(dealQuery.data ?? []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-20 rounded-lg border border-border/40 bg-muted/20" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">Unable to load activity.</p>
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
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((interaction) => {
        const iconName = interactionTypeIconMap[interaction.type as Interaction["type"]] ?? "note";

        return (
          <div key={interaction.interaction_id} className="rounded-lg border border-border/40 bg-card p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40">
                <AppIcon name={iconName} className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {interaction.type}
                  </Badge>
                  {interaction.contactLabel ? (
                    <span className="text-xs text-muted-foreground">{interaction.contactLabel}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground/70 sm:ml-auto">
                    {formatCrmDateTime(interaction.occurred_at)}
                  </span>
                </div>
                {interaction.summary ? (
                  <p className="mt-2 text-sm text-foreground/80">{interaction.summary}</p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
