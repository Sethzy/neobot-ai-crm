/**
 * Shared icon renderer for unified timeline rows.
 * @module components/crm/timeline/timeline-event-icon
 */
import { CirclePlus, PencilLine, Trash2 } from "lucide-react";

import { AppIcon } from "@/components/icons/app-icons";
import type { UnifiedTimelineInteraction } from "@/lib/crm/schemas";

interface TimelineEventIconProps {
  action?: "created" | "updated" | "deleted" | null;
  interactionType?: UnifiedTimelineInteraction["type"];
}

export function TimelineEventIcon({ action, interactionType }: TimelineEventIconProps) {
  if (action === "created") {
    return <CirclePlus className="h-4 w-4 text-muted-foreground" />;
  }

  if (action === "updated") {
    return <PencilLine className="h-4 w-4 text-muted-foreground" />;
  }

  if (action === "deleted") {
    return <Trash2 className="h-4 w-4 text-muted-foreground" />;
  }

  const iconName = interactionType === "meeting"
    ? "meeting"
    : interactionType === "email"
      ? "email"
      : interactionType === "message"
        ? "message"
        : interactionType === "viewing"
          ? "viewing"
          : interactionType === "note"
            ? "note"
            : "phone";

  return <AppIcon name={iconName} className="h-4 w-4 text-muted-foreground" />;
}
