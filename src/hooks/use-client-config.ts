/**
 * @file Hook for fetching current user's client_config_id from Supabase.
 * Uses get_my_client_config RPC function.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const clientConfigKeys = {
  all: ["clientConfig"] as const,
  mine: () => [...clientConfigKeys.all, "mine"] as const,
};

async function fetchMyClientConfigId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_client_config");
  if (error) throw error;
  return data as string | null;
}

/** Query options for prefetching client config ID in route loaders */
export const clientConfigIdQueryOptions = {
  queryKey: clientConfigKeys.mine(),
  queryFn: fetchMyClientConfigId,
  staleTime: 1000 * 60 * 5, // 5 minutes - config rarely changes
};

/**
 * Hook to get the current user's client_config_id.
 * Returns null if user has no profile or no config set.
 */
export function useClientConfigId() {
  return useQuery(clientConfigIdQueryOptions);
}
