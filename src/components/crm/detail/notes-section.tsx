/**
 * Notes-focused section for person detail pages.
 * @module components/crm/detail/notes-section
 */
"use client";

import { AppIcon } from "@/components/icons/app-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useContactInteractions } from "@/hooks/use-contact-relations";
import { formatCrmDateTime } from "@/lib/crm/display";

interface NotesSectionProps {
  contactId: string;
}

/**
 * Renders note interactions only, keeping notes and broader activity separated.
 */
export function NotesSection({ contactId }: NotesSectionProps) {
  const { data: interactions = [], isLoading, isError, refetch } = useContactInteractions(contactId);
  const notes = interactions.filter((interaction) => interaction.type === "note");

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Unable to load notes.
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
        </AlertDescription>
      </Alert>
    );
  }

  if (notes.length === 0) {
    return (
      <Empty>
        <EmptyDescription>No notes have been recorded for this person yet.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => (
        <div key={note.interaction_id} className="rounded-lg border border-border/40 bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40">
              <AppIcon name="note" className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  Note
                </Badge>
                <span className="text-xs text-muted-foreground/70 sm:ml-auto">
                  {formatCrmDateTime(note.occurred_at)}
                </span>
              </div>
              {note.summary ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{note.summary}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No note body was stored.</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
