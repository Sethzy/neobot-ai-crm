/**
 * Multi-note drawer tab for CRM records.
 * @module components/crm/record-drawer/drawer-notes-tab
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, Plus, StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateRecordNote,
  useDeleteRecordNote,
  useRecordNotes,
  useUpdateRecordNote,
} from "@/hooks/use-record-notes";
import { type RecordNote } from "@/lib/crm/schemas";

interface DrawerNotesTabProps {
  /** CRM record type that owns the notes. */
  recordType: RecordNote["record_type"];
  /** CRM record id that owns the notes. */
  recordId: string;
}

interface RecordNoteCardProps {
  note: RecordNote;
  isEditing: boolean;
  isSaving: boolean;
  isDeleteConfirming: boolean;
  onStartEditing: (note: RecordNote) => void;
  onChangeDraft: (noteId: string, nextValue: string) => void;
  onCommitDraft: (note: RecordNote) => Promise<void>;
  onDeleteClick: (noteId: string) => void;
  draftValue?: string;
  shouldAutofocus: boolean;
}

function RecordNoteCard({
  note,
  isEditing,
  isSaving,
  isDeleteConfirming,
  onStartEditing,
  onChangeDraft,
  onCommitDraft,
  onDeleteClick,
  draftValue,
  shouldAutofocus,
}: RecordNoteCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing || !shouldAutofocus) {
      return;
    }

    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, [isEditing, shouldAutofocus]);

  return (
    <div className="group rounded-xl border border-border/50 bg-card p-4 shadow-xs transition-colors hover:border-border">
      {isEditing ? (
        <textarea
          ref={textareaRef}
          rows={4}
          value={draftValue ?? ""}
          disabled={isSaving}
          placeholder="Add note..."
          className="block min-h-24 w-full resize-y border-none bg-transparent p-0 m-0 text-sm leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground disabled:opacity-60"
          onChange={(event) => onChangeDraft(note.note_id, event.target.value)}
          onBlur={() => {
            void onCommitDraft(note);
          }}
        />
      ) : (
        <button
          type="button"
          className="block min-h-24 w-full text-left"
          onClick={() => onStartEditing(note)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onStartEditing(note);
            }
          }}
        >
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {note.body.trim() ? note.body : <span className="text-muted-foreground">Empty note</span>}
          </p>
        </button>
      )}

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        <span>{formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}</span>
        {!isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={isDeleteConfirming ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"}
            aria-label={isDeleteConfirming ? "Confirm delete note" : "Delete note"}
            onClick={() => onDeleteClick(note.note_id)}
          >
            {isDeleteConfirming ? <Check className="h-3.5 w-3.5 text-destructive" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders the notes tab as a stack of editable note cards.
 */
export function DrawerNotesTab({ recordType, recordId }: DrawerNotesTabProps) {
  const { data: notes = [], isLoading, isError, refetch } = useRecordNotes(recordType, recordId);
  const createRecordNote = useCreateRecordNote();
  const deleteRecordNote = useDeleteRecordNote();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);
  const [confirmingDeleteNoteId, setConfirmingDeleteNoteId] = useState<string | null>(null);
  const [draftByNoteId, setDraftByNoteId] = useState<Record<string, string>>({});

  const activeEditingNote = notes.find((note) => note.note_id === editingNoteId) ?? null;
  const updateRecordNote = useUpdateRecordNote(editingNoteId ?? "");
  const isSavingNote = updateRecordNote.isPending && Boolean(editingNoteId);

  const handleStartEditing = (note: RecordNote) => {
    setConfirmingDeleteNoteId(null);
    setDraftByNoteId((currentDrafts) => ({
      ...currentDrafts,
      [note.note_id]: currentDrafts[note.note_id] ?? note.body,
    }));
    setEditingNoteId(note.note_id);
  };

  const handleCommitDraft = async (note: RecordNote) => {
    const nextBody = draftByNoteId[note.note_id] ?? note.body;

    if (nextBody === note.body) {
      setEditingNoteId(null);
      setAutoFocusNoteId(null);
      return;
    }

    await updateRecordNote.mutateAsync(nextBody);
    setEditingNoteId(null);
    setAutoFocusNoteId(null);
  };

  const handleAddNote = async () => {
    const createdNote = await createRecordNote.mutateAsync({
      recordType,
      recordId,
      body: "",
    });

    setDraftByNoteId((currentDrafts) => ({
      ...currentDrafts,
      [createdNote.note_id]: createdNote.body,
    }));
    setEditingNoteId(createdNote.note_id);
    setAutoFocusNoteId(createdNote.note_id);
    setConfirmingDeleteNoteId(null);
  };

  const handleDeleteClick = async (noteId: string) => {
    if (confirmingDeleteNoteId !== noteId) {
      setConfirmingDeleteNoteId(noteId);
      return;
    }

    await deleteRecordNote.mutateAsync(noteId);
    setConfirmingDeleteNoteId(null);
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setAutoFocusNoteId(null);
    }
    setDraftByNoteId((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[noteId];
      return nextDrafts;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-7 w-24" />
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Failed to load notes.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => { void refetch(); }}>
          Retry
        </Button>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <Empty className="border-border/50 bg-card/30">
        <EmptyContent>
          <EmptyMedia variant="icon">
            <StickyNote className="h-4 w-4" />
          </EmptyMedia>
          <EmptyTitle>No notes yet</EmptyTitle>
          <EmptyDescription>Add the first note for this record.</EmptyDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={createRecordNote.isPending}
            onClick={() => {
              void handleAddNote();
            }}
          >
            {createRecordNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add note
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground/85">All {notes.length}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={createRecordNote.isPending}
          onClick={() => {
            void handleAddNote();
          }}
        >
          {createRecordNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add note
        </Button>
      </div>

      <div className="space-y-3">
        {notes.map((note) => (
          <RecordNoteCard
            key={note.note_id}
            note={note}
            isEditing={editingNoteId === note.note_id}
            isSaving={activeEditingNote?.note_id === note.note_id && isSavingNote}
            isDeleteConfirming={confirmingDeleteNoteId === note.note_id}
            draftValue={draftByNoteId[note.note_id]}
            shouldAutofocus={autoFocusNoteId === note.note_id}
            onStartEditing={handleStartEditing}
            onChangeDraft={(noteId, nextValue) => {
              setDraftByNoteId((currentDrafts) => ({
                ...currentDrafts,
                [noteId]: nextValue,
              }));
            }}
            onCommitDraft={handleCommitDraft}
            onDeleteClick={(noteId) => {
              void handleDeleteClick(noteId);
            }}
          />
        ))}
      </div>
    </div>
  );
}
