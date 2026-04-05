/**
 * Unified timeline hook that merges audit events with CRM interactions.
 * @module hooks/use-unified-timeline
 */
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useContactInteractions, useDealInteractions } from "@/hooks/use-contact-relations";
import { useRealtimeTable } from "@/hooks/use-realtime";
import type { TimelineActivity, TimelineRecordType, UnifiedTimelineEntry } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export const timelineActivityKeys = {
  all: ["timeline-activities"] as const,
  record: (recordType: TimelineRecordType, recordId: string) =>
    [...timelineActivityKeys.all, recordType, recordId] as const,
};

/**
 * Returns one chronological feed for the drawer Timeline tab.
 */
export function useUnifiedTimeline(recordType: TimelineRecordType, recordId: string) {
  const { data: clientId } = useClientId();
  const contactInteractions = useContactInteractions(recordType === "contact" ? recordId : "");
  const dealInteractions = useDealInteractions(recordType === "deal" ? recordId : "");

  useRealtimeTable({
    table: "timeline_activities",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [timelineActivityKeys.record(recordType, recordId)],
    enabled: Boolean(clientId && recordId),
  });

  const activitiesQuery = useQuery({
    queryKey: timelineActivityKeys.record(recordType, recordId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_activities")
        .select("*")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .order("happened_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as TimelineActivity[];
    },
    enabled: Boolean(recordId),
  });

  const interactionQuery = recordType === "deal" ? dealInteractions : contactInteractions;

  const entries = useMemo<UnifiedTimelineEntry[]>(() => {
    const interactions = recordType === "contact" || recordType === "deal"
      ? (interactionQuery.data ?? [])
      : [];

    const mergedEntries = [
      ...(activitiesQuery.data ?? []).map((activity) => ({
        kind: "audit" as const,
        timestamp: activity.happened_at,
        data: activity,
      })),
      ...interactions.map((interaction) => ({
        kind: "interaction" as const,
        timestamp: interaction.occurred_at,
        data: interaction,
      })),
    ];

    return mergedEntries.sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }, [activitiesQuery.data, interactionQuery.data, recordType]);

  return {
    entries,
    isLoading: activitiesQuery.isLoading || interactionQuery.isLoading,
    isError: activitiesQuery.isError || interactionQuery.isError,
    refetch: async () => {
      await Promise.all([activitiesQuery.refetch(), interactionQuery.refetch()]);
    },
  };
}
