/**
 * TanStack Query hook for the resolved CRM configuration API.
 * @module hooks/use-crm-config
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { CrmVocabConfig } from "@/lib/crm/config";

export interface CrmConfigResponse {
  hasConfig: boolean;
  config: CrmVocabConfig;
}

export const crmConfigKeys = {
  all: ["crm-config"] as const,
  current: () => [...crmConfigKeys.all, "current"] as const,
};

async function fetchCrmConfig(): Promise<CrmConfigResponse> {
  const response = await fetch("/api/crm/config");

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to load CRM config.");
  }

  return response.json() as Promise<CrmConfigResponse>;
}

export function useCrmConfig() {
  return useQuery({
    queryKey: crmConfigKeys.current(),
    queryFn: fetchCrmConfig,
    staleTime: 30_000,
  });
}
