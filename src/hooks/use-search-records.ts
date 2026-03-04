/**
 * Query hook for cross-table CRM/thread search results via Supabase RPC.
 * @module hooks/use-search-records
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface SearchResult {
  /** Source record type. */
  type: "contact" | "deal" | "task" | "thread";
  /** Source row id. */
  id: string;
  /** Primary label shown in command results. */
  title: string;
  /** Secondary label shown in command results. */
  subtitle: string;
}

/**
 * Searches contacts, deals, crm tasks, and threads through the `search_records` RPC.
 */
export function useSearchRecords(query: string) {
  const normalizedQuery = query.trim();

  return useQuery({
    queryKey: ["search-records", normalizedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not yet in generated types
      const { data, error } = await (supabase.rpc as any)("search_records", { query: normalizedQuery });
      if (error) {
        throw error;
      }

      return (data ?? []) as SearchResult[];
    },
    enabled: normalizedQuery.length >= 2,
    staleTime: 30_000,
  });
}
