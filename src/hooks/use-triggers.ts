/**
 * TanStack Query hooks for user-created trigger rows and enable/disable mutations.
 * @module hooks/use-triggers
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type AutomationTrigger = Pick<
  Database["public"]["Tables"]["agent_triggers"]["Row"],
  | "id"
  | "thread_id"
  | "name"
  | "trigger_type"
  | "cron_expression"
  | "payload"
  | "enabled"
  | "next_fire_at"
  | "last_fired_at"
  | "last_status"
  | "invocation_message"
>;

export const TRIGGER_LIST_SELECT = [
  "id",
  "thread_id",
  "name",
  "trigger_type",
  "cron_expression",
  "payload",
  "enabled",
  "next_fire_at",
  "last_fired_at",
  "last_status",
  "invocation_message",
].join(", ");

export const triggerKeys = {
  all: ["triggers"] as const,
  lists: () => [...triggerKeys.all, "list"] as const,
  list: () => [...triggerKeys.lists(), "all"] as const,
};

async function fetchTriggers(): Promise<AutomationTrigger[]> {
  const { data, error } = await supabase
    .from("agent_triggers")
    .select(TRIGGER_LIST_SELECT)
    .neq("trigger_type", "pulse")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as AutomationTrigger[];
}

/**
 * Returns all user-created triggers for the current client and subscribes to realtime invalidation.
 */
export function useTriggers() {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;

  useRealtimeTable({
    table: "agent_triggers",
    filter: realtimeFilter,
    queryKeys: [triggerKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: triggerKeys.list(),
    queryFn: fetchTriggers,
  });
}

/**
 * Returns a mutation for enabling or disabling one trigger row.
 */
export function useSetTriggerEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { triggerId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("agent_triggers")
        .update({ enabled: input.enabled })
        .eq("id", input.triggerId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}
