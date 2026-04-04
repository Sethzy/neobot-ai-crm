/**
 * TanStack Query hooks for CRM record notes.
 * @module hooks/use-record-notes
 */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { type RecordNote } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type RecordNoteType = RecordNote["record_type"];

interface CreateRecordNoteVariables {
  recordType: RecordNoteType;
  recordId: string;
  body?: string;
}

/**
 * Query key factory for record note queries scoped to a parent CRM record.
 */
export const recordNoteKeys = {
  all: ["record-notes"] as const,
  lists: () => [...recordNoteKeys.all, "list"] as const,
  list: (recordType: RecordNoteType, recordId: string) =>
    [...recordNoteKeys.lists(), recordType, recordId] as const,
  details: () => [...recordNoteKeys.all, "detail"] as const,
  detail: (noteId: string) => [...recordNoteKeys.details(), noteId] as const,
};

async function fetchRecordNotes(recordType: RecordNoteType, recordId: string): Promise<RecordNote[]> {
  const { data, error } = await supabase
    .from("record_notes")
    .select("*")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as RecordNote[];
}

export function recordNotesQueryOptions(recordType: RecordNoteType, recordId: string) {
  return queryOptions({
    queryKey: recordNoteKeys.list(recordType, recordId),
    queryFn: () => fetchRecordNotes(recordType, recordId),
  });
}

/**
 * Returns notes for one CRM record and keeps the list fresh via realtime invalidation.
 */
export function useRecordNotes(recordType: RecordNoteType, recordId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "record_notes",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [recordNoteKeys.list(recordType, recordId)],
    enabled: Boolean(clientId && recordId),
  });

  return useQuery({
    ...recordNotesQueryOptions(recordType, recordId),
    enabled: Boolean(recordId),
  });
}

/**
 * Returns a mutation that creates one note for any CRM record.
 */
export function useCreateRecordNote() {
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();

  return useMutation({
    mutationFn: async ({
      recordType,
      recordId,
      body = "",
    }: CreateRecordNoteVariables): Promise<RecordNote> => {
      if (!clientId) {
        throw new Error("Cannot create record note before client_id resolves.");
      }

      const { data, error } = await supabase
        .from("record_notes")
        .insert({
          client_id: clientId,
          record_type: recordType,
          record_id: recordId,
          body,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as RecordNote;
    },
    onSuccess: (note) => {
      queryClient.setQueryData<RecordNote[]>(
        recordNoteKeys.list(note.record_type, note.record_id),
        (existingNotes) => {
          const remainingNotes = (existingNotes ?? []).filter((existingNote) => existingNote.note_id !== note.note_id);
          return [note, ...remainingNotes];
        },
      );
      queryClient.setQueryData(recordNoteKeys.detail(note.note_id), note);
      void queryClient.invalidateQueries({
        queryKey: recordNoteKeys.list(note.record_type, note.record_id),
      });
      void queryClient.invalidateQueries({ queryKey: recordNoteKeys.all });
    },
  });
}

/**
 * Returns a mutation that updates a note body by note id.
 */
export function useUpdateRecordNote(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string): Promise<RecordNote> => {
      const { data, error } = await supabase
        .from("record_notes")
        .update({ body })
        .eq("note_id", noteId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as RecordNote;
    },
    onSuccess: (note) => {
      queryClient.setQueryData<RecordNote[]>(
        recordNoteKeys.list(note.record_type, note.record_id),
        (existingNotes) =>
          (existingNotes ?? []).map((existingNote) =>
            existingNote.note_id === note.note_id ? note : existingNote,
          ),
      );
      queryClient.setQueryData(recordNoteKeys.detail(note.note_id), note);
      void queryClient.invalidateQueries({
        queryKey: recordNoteKeys.list(note.record_type, note.record_id),
      });
      void queryClient.invalidateQueries({ queryKey: recordNoteKeys.detail(note.note_id) });
    },
  });
}

/**
 * Returns a mutation that deletes a note by id.
 */
export function useDeleteRecordNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string): Promise<RecordNote> => {
      const { data, error } = await supabase
        .from("record_notes")
        .delete()
        .eq("note_id", noteId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as RecordNote;
    },
    onSuccess: (note) => {
      queryClient.setQueryData<RecordNote[]>(
        recordNoteKeys.list(note.record_type, note.record_id),
        (existingNotes) =>
          (existingNotes ?? []).filter((existingNote) => existingNote.note_id !== note.note_id),
      );
      void queryClient.invalidateQueries({
        queryKey: recordNoteKeys.list(note.record_type, note.record_id),
      });
      void queryClient.invalidateQueries({ queryKey: recordNoteKeys.all });
      void queryClient.removeQueries({ queryKey: recordNoteKeys.detail(note.note_id) });
    },
  });
}

export { fetchRecordNotes };
