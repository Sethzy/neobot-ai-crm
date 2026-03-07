/**
 * Read-only timeline list for deal interactions.
 * @module components/crm/interaction-timeline
 */
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { Badge } from "@/components/ui/badge";
import { formatContactFullName, formatCrmDateTime } from "@/lib/crm/display";
import type { InteractionWithContact } from "@/hooks/use-contact-relations";
import type { Interaction } from "@/lib/crm/schemas";

/** Maps interaction types to semantic app icons. Shared by timeline variants. */
export const interactionTypeIconMap: Record<Interaction["type"], AppIconName> = {
  call: "phone",
  meeting: "meeting",
  email: "email",
  message: "message",
  viewing: "viewing",
  note: "note",
};

const interactionTypeLabelMap: Record<Interaction["type"], string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  message: "Message",
  viewing: "Viewing",
  note: "Note",
};

interface InteractionTimelineProps {
  interactions: InteractionWithContact[];
}

/**
 * Renders a chronological interaction timeline.
 */
export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No interactions yet</p>;
  }

  return (
    <div className="space-y-4">
      {interactions.map((interaction) => {
        const iconName = interactionTypeIconMap[interaction.type] ?? "note";
        const contactName = interaction.contacts ? formatContactFullName(interaction.contacts) : null;

        return (
          <div key={interaction.interaction_id} className="flex gap-3 rounded-xl border border-border/40 bg-card p-4 shadow-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
              <AppIcon name={iconName} className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {interactionTypeLabelMap[interaction.type]}
                </Badge>
                {contactName ? <span className="text-xs text-muted-foreground">{contactName}</span> : null}
                <span className="ml-auto text-xs text-muted-foreground/70">
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
