/**
 * TanStack Query hook for the current client's installed managed-agent skills.
 * @module hooks/use-installed-skills
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { createClient } from "@/lib/supabase/client";
import { getInstalledSkills } from "@/lib/runner/skills/get-installed-skills";

export const installedSkillKeys = {
  all: ["skills", "installed"] as const,
  byClient: (clientId: string) => ["skills", "installed", clientId] as const,
};

export function useInstalledSkills() {
  const { data: clientId, isLoading: isLoadingClientId } = useClientId();
  const supabase = createClient();

  return useQuery({
    queryKey: installedSkillKeys.byClient(clientId ?? "anonymous"),
    queryFn: () => getInstalledSkills(supabase, clientId as string),
    enabled: !isLoadingClientId && Boolean(clientId),
    staleTime: 0,
  });
}
