/**
 * TanStack Query hook for aggregate CRM dashboard metrics.
 * @module hooks/use-dashboard-stats
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { supabase } from "@/lib/supabase";

const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardStats {
  peopleTotal: number;
  peopleNewThisWeek: number;
  dealsTotal: number;
  dealsTotalValue: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksDueToday: number;
}

export interface DashboardDateBoundaries {
  startOfTodayIso: string;
  startOfTomorrowIso: string;
  startOfWeekIso: string;
}

export const dashboardStatsKeys = {
  all: ["dashboard-stats"] as const,
  current: () => [...dashboardStatsKeys.all, "current"] as const,
};

/**
 * Computes Singapore-local day/week boundaries and returns them as UTC ISO strings for SQL filters.
 */
export function getSingaporeDashboardDateBoundaries(
  now: Date = new Date(),
): DashboardDateBoundaries {
  const shiftedNow = new Date(now.getTime() + SINGAPORE_OFFSET_MS);
  const startOfTodayInSingaporeMs = Date.UTC(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth(),
    shiftedNow.getUTCDate(),
  );
  const dayOfWeek = (shiftedNow.getUTCDay() + 6) % 7;
  const startOfWeekInSingaporeMs = startOfTodayInSingaporeMs - (dayOfWeek * DAY_MS);
  const startOfTomorrowInSingaporeMs = startOfTodayInSingaporeMs + DAY_MS;

  return {
    startOfTodayIso: new Date(startOfTodayInSingaporeMs - SINGAPORE_OFFSET_MS).toISOString(),
    startOfTomorrowIso: new Date(
      startOfTomorrowInSingaporeMs - SINGAPORE_OFFSET_MS,
    ).toISOString(),
    startOfWeekIso: new Date(startOfWeekInSingaporeMs - SINGAPORE_OFFSET_MS).toISOString(),
  };
}

/**
 * Fetches all stat-card counts in parallel so the dashboard can render from one query.
 */
export async function fetchDashboardStats(
  now: Date = new Date(),
): Promise<DashboardStats> {
  const {
    startOfTodayIso,
    startOfTomorrowIso,
    startOfWeekIso,
  } = getSingaporeDashboardDateBoundaries(now);

  const [
    peopleTotalResult,
    peopleNewThisWeekResult,
    dealsResult,
    tasksOpenResult,
    tasksOverdueResult,
    tasksDueTodayResult,
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfWeekIso),
    supabase
      .from("deals")
      .select("price", { count: "exact" }),
    supabase
      .from("crm_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("crm_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "open")
      .not("due_date", "is", null)
      .lt("due_date", startOfTodayIso),
    supabase
      .from("crm_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "open")
      .gte("due_date", startOfTodayIso)
      .lt("due_date", startOfTomorrowIso),
  ]);

  if (peopleTotalResult.error) {
    throw peopleTotalResult.error;
  }

  if (peopleNewThisWeekResult.error) {
    throw peopleNewThisWeekResult.error;
  }

  if (dealsResult.error) {
    throw dealsResult.error;
  }

  if (tasksOpenResult.error) {
    throw tasksOpenResult.error;
  }

  if (tasksOverdueResult.error) {
    throw tasksOverdueResult.error;
  }

  if (tasksDueTodayResult.error) {
    throw tasksDueTodayResult.error;
  }

  const dealsTotalValue = (dealsResult.data ?? []).reduce((sum, deal) => {
    return sum + (typeof deal.price === "number" ? deal.price : 0);
  }, 0);

  return {
    peopleTotal: peopleTotalResult.count ?? 0,
    peopleNewThisWeek: peopleNewThisWeekResult.count ?? 0,
    dealsTotal: dealsResult.count ?? 0,
    dealsTotalValue,
    tasksOpen: tasksOpenResult.count ?? 0,
    tasksOverdue: tasksOverdueResult.count ?? 0,
    tasksDueToday: tasksDueTodayResult.count ?? 0,
  };
}

/**
 * Returns the aggregate dashboard metrics and keeps them fresh via realtime invalidation.
 */
export function useDashboardStats() {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;

  useRealtimeTable({
    table: "contacts",
    filter: realtimeFilter,
    queryKeys: [dashboardStatsKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "deals",
    filter: realtimeFilter,
    queryKeys: [dashboardStatsKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "crm_tasks",
    filter: realtimeFilter,
    queryKeys: [dashboardStatsKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: dashboardStatsKeys.current(),
    queryFn: () => fetchDashboardStats(),
    enabled: Boolean(clientId),
  });
}
