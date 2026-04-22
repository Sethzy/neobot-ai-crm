/**
 * TanStack Query hooks for user-created trigger rows and enable/disable mutations.
 * @module hooks/use-triggers
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import {
  listAutomationTriggers,
  triggerKeys,
  type AutomationTrigger,
  TRIGGER_LIST_SELECT,
} from "@/lib/triggers/automation-trigger-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export { TRIGGER_LIST_SELECT, triggerKeys } from "@/lib/triggers/automation-trigger-query";
export type { AutomationTrigger } from "@/lib/triggers/automation-trigger-query";

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
  useRealtimeTable({
    table: "runs",
    filter: realtimeFilter,
    queryKeys: [triggerKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: triggerKeys.list(),
    queryFn: () => listAutomationTriggers(supabase),
  });
}

/**
 * Fetches the trigger (if any) that spawned a given thread.
 * Resolves via `conversation_threads.source_trigger_id` — the back-reference
 * stamped on threads created by a cron/webhook firing.
 * Returns `null` when the thread is not automation-spawned.
 */
export function useTriggerByThreadId(threadId: string | null | undefined) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "agent_triggers",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [triggerKeys.all],
    enabled: Boolean(clientId && threadId),
  });

  return useQuery({
    queryKey: [...triggerKeys.all, "by-thread", threadId] as const,
    queryFn: async () => {
      const { data: thread, error: threadError } = await supabase
        .from("conversation_threads")
        .select("source_trigger_id")
        .eq("thread_id", threadId!)
        .maybeSingle();
      if (threadError) throw threadError;
      if (!thread?.source_trigger_id) return null;

      const { data, error } = await supabase
        .from("agent_triggers")
        .select(TRIGGER_LIST_SELECT)
        .eq("id", thread.source_trigger_id)
        .neq("trigger_type", "pulse")
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Omit<AutomationTrigger, "isRunning"> | null) ?? null;
    },
    enabled: Boolean(clientId && threadId),
  });
}

/**
 * Fetches a single trigger by ID with realtime subscription.
 */
export function useTrigger(triggerId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "agent_triggers",
    filter: `id=eq.${triggerId}`,
    queryKeys: [triggerKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: [...triggerKeys.all, "detail", triggerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_triggers")
        .select("*")
        .eq("id", triggerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(clientId),
  });
}

/**
 * Mutation for updating an automation's schedule configuration.
 */
export function useUpdateTriggerSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      triggerId: string;
      cronExpression: string;
      payload: Record<string, unknown>;
      nextFireAt: string;
    }) => {
      const { error } = await supabase
        .from("agent_triggers")
        .update({
          cron_expression: input.cronExpression,
          payload: input.payload as Database["public"]["Tables"]["agent_triggers"]["Update"]["payload"],
          next_fire_at: input.nextFireAt,
          retry_count: 0,
        })
        .eq("id", input.triggerId);

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}

/**
 * Returns a mutation for enabling or disabling one trigger row.
 *
 * Writes the new `enabled` value into the cache synchronously via `onMutate`
 * so the Switch flips and the row reflows between Active/Inactive sections
 * without waiting for the network round-trip. Rolls back on error; re-syncs
 * from the server on settle.
 */
export function useSetTriggerEnabled() {
  const queryClient = useQueryClient();
  const listKey = triggerKeys.list();

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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<AutomationTrigger[]>(listKey);
      if (previous) {
        queryClient.setQueryData<AutomationTrigger[]>(
          listKey,
          previous.map((trigger) =>
            trigger.id === input.triggerId
              ? { ...trigger, enabled: input.enabled }
              : trigger,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}
