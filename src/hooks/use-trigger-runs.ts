/**
 * TanStack Query hook for fetching runs linked to a specific automation.
 * @module hooks/use-trigger-runs
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { supabase } from "@/lib/supabase";

export const triggerRunKeys = {
  all: ["trigger-runs"] as const,
  list: (triggerId: string) => [...triggerRunKeys.all, "list", triggerId] as const,
};

export interface TriggerRun {
  run_id: string;
  run_thread_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  thread_title: string | null;
}

/**
 * Fetches paginated runs for a specific automation with realtime updates.
 */
export function useTriggerRuns(triggerId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "runs",
    filter: `trigger_id=eq.${triggerId}`,
    queryKeys: [triggerRunKeys.list(triggerId)],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: triggerRunKeys.list(triggerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("run_id, run_thread_id, status, created_at, completed_at")
        .eq("trigger_id", triggerId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch thread titles for runs that have a run_thread_id
      const threadIds = (data ?? [])
        .map((r) => r.run_thread_id)
        .filter(Boolean) as string[];

      let threadTitles: Record<string, string> = {};
      if (threadIds.length > 0) {
        const { data: threads } = await supabase
          .from("conversation_threads")
          .select("thread_id, title")
          .in("thread_id", threadIds);

        threadTitles = Object.fromEntries(
          (threads ?? []).map((t) => [t.thread_id, t.title ?? ""])
        );
      }

      return (data ?? []).map((run) => ({
        ...run,
        thread_title: run.run_thread_id ? (threadTitles[run.run_thread_id] ?? null) : null,
      })) as TriggerRun[];
    },
    enabled: Boolean(clientId),
  });
}

/**
 * Mutation to manually trigger an automation run.
 */
export function useManualRun(triggerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/automations/${triggerId}/run`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to start run");
      }
      return res.json() as Promise<{ runId: string; threadId: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: triggerRunKeys.list(triggerId),
      });
    },
  });
}
