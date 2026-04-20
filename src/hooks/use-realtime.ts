/**
 * Supabase Realtime hook for table subscriptions and TanStack Query invalidation.
 * @module hooks/use-realtime
 */
"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type RealtimeTableName =
  | "conversation_threads"
  | "conversation_messages"
  | "conversation_channel_mappings"
  | "companies"
  | "contacts"
  | "deals"
  | "deal_contacts"
  | "interactions"
  | "crm_tasks"
  | "record_notes"
  | "record_attachments"
  | "timeline_activities"
  | "agent_triggers"
  | "runs"
  | "crm_views"
  | "meeting_records";

export interface UseRealtimeTableOptions {
  /** Postgres table name to subscribe to. */
  table: RealtimeTableName;
  /** PostgREST filter string (for example: `client_id=eq.client-1`). */
  filter?: string;
  /** Query keys to invalidate when an event arrives. */
  queryKeys: readonly QueryKey[];
  /** Toggles subscription lifecycle. Defaults to true. */
  enabled?: boolean;
}

/**
 * Subscribes to Supabase `postgres_changes` and invalidates the provided query keys.
 */
export function useRealtimeTable({
  table,
  filter,
  queryKeys,
  enabled = true,
}: UseRealtimeTableOptions): void {
  const queryClient = useQueryClient();
  const queryKeysRef = useRef(queryKeys);

  useEffect(() => {
    queryKeysRef.current = queryKeys;
  }, [queryKeys]);

  useEffect(() => {
    if (!enabled || !filter) {
      return;
    }

    const channel = supabase
      .channel(`realtime:${table}:${filter}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter,
        },
        () => {
          for (const queryKey of queryKeysRef.current) {
            void queryClient.invalidateQueries({ queryKey: [...queryKey] });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, filter, queryClient, table]);
}
