/**
 * Interaction timeline panel for a contact detail page.
 * @module components/crm/contact-timeline
 */
"use client";

import { AppIcon } from "@/components/icons/app-icons";
import { interactionTypeIconMap } from "@/components/crm/interaction-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useContactInteractions } from "@/hooks/use-contact-relations";
import { formatCrmDateTime } from "@/lib/crm/display";

interface ContactTimelineProps {
  contactId: string;
}

export function ContactTimeline({ contactId }: ContactTimelineProps) {
  const { data: interactions = [], isLoading, isError, refetch } = useContactInteractions(contactId);

  if (isLoading) {
    return (
      <div className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        <span>Loading activity...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">Unable to load activity timeline</p>
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

  if (interactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity recorded</p>;
  }

  return (
    <div className="space-y-4">
      {interactions.map((interaction) => {
        const iconName = interactionTypeIconMap[interaction.type] ?? "note";

        return (
          <div key={interaction.interaction_id} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
              <AppIcon name={iconName} className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {interaction.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatCrmDateTime(interaction.occurred_at)}
                </span>
              </div>
              {interaction.summary ? (
                <p className="mt-1 text-sm text-foreground/80">{interaction.summary}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
