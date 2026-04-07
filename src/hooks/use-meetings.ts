/**
 * TanStack Query hooks for meeting records.
 * @module hooks/use-meetings
 */
"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { supabase } from "@/lib/supabase";

export interface MeetingRecord {
  meeting_record_id: string;
  title: string | null;
  summary: string | null;
  duration_seconds: number | null;
  notes: string | null;
  status: string;
  transcript_path: string | null;
  audio_path: string;
  thread_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Query key factory for meetings cache. */
export const meetingKeys = {
  all: ["meetings"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (clientId: string) => [...meetingKeys.lists(), clientId] as const,
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (meetingId: string) => [...meetingKeys.details(), meetingId] as const,
};

async function fetchMeetings(clientId: string): Promise<MeetingRecord[]> {
  const { data, error } = await supabase
    .from("meeting_records")
    .select("meeting_record_id, title, summary, duration_seconds, notes, status, transcript_path, audio_path, thread_id, created_at, updated_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as MeetingRecord[];
}

async function fetchMeeting(meetingId: string): Promise<MeetingRecord | null> {
  const { data, error } = await supabase
    .from("meeting_records")
    .select("meeting_record_id, title, summary, duration_seconds, notes, status, transcript_path, audio_path, thread_id, created_at, updated_at")
    .eq("meeting_record_id", meetingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as MeetingRecord | null;
}

export function meetingsQueryOptions(clientId: string) {
  return queryOptions({
    queryKey: meetingKeys.list(clientId),
    queryFn: () => fetchMeetings(clientId),
  });
}

export function meetingQueryOptions(meetingId: string) {
  return queryOptions({
    queryKey: meetingKeys.detail(meetingId),
    queryFn: () => fetchMeeting(meetingId),
  });
}

/**
 * Returns all meetings for the current client and keeps the list fresh via
 * realtime invalidation.
 */
export function useMeetings() {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "meeting_records",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: clientId ? [meetingKeys.list(clientId)] : [],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...meetingsQueryOptions(clientId ?? ""),
    enabled: Boolean(clientId),
  });
}

/**
 * Returns one meeting record by id and refreshes it when the table changes.
 */
export function useMeeting(meetingId: string) {
  useRealtimeTable({
    table: "meeting_records",
    filter: meetingId ? `meeting_record_id=eq.${meetingId}` : undefined,
    queryKeys: meetingId ? [meetingKeys.detail(meetingId)] : [],
    enabled: Boolean(meetingId),
  });

  return useQuery({
    ...meetingQueryOptions(meetingId),
    enabled: Boolean(meetingId),
  });
}
