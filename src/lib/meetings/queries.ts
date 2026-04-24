/**
 * Shared meetings query utilities usable from server prefetch and client hooks.
 * @module lib/meetings/queries
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

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

type MeetingsSupabaseClient = Pick<SupabaseClient<Database>, "from">;

/** Query key factory for meetings cache. */
export const meetingKeys = {
  all: ["meetings"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (clientId: string) => [...meetingKeys.lists(), clientId] as const,
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (meetingId: string) => [...meetingKeys.details(), meetingId] as const,
};

export async function fetchMeetings(
  supabase: MeetingsSupabaseClient,
  clientId: string,
): Promise<MeetingRecord[]> {
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

export async function fetchMeeting(
  supabase: MeetingsSupabaseClient,
  meetingId: string,
): Promise<MeetingRecord | null> {
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
