/**
 * TanStack Query hooks for meeting records.
 * @module hooks/use-meetings
 */
"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import {
  fetchMeeting,
  fetchMeetings,
  meetingKeys,
} from "@/lib/meetings/queries";
import { supabase } from "@/lib/supabase";

export type { MeetingRecord } from "@/lib/meetings/queries";

export function meetingsQueryOptions(clientId: string) {
  return queryOptions({
    queryKey: meetingKeys.list(clientId),
    queryFn: () => fetchMeetings(supabase, clientId),
  });
}

export function meetingQueryOptions(meetingId: string) {
  return queryOptions({
    queryKey: meetingKeys.detail(meetingId),
    queryFn: () => fetchMeeting(supabase, meetingId),
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
