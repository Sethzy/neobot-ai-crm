/**
 * Hook for reading and writing automation SOP content from Supabase Storage.
 * @module hooks/use-trigger-instructions
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { supabase } from "@/lib/supabase";

const AGENT_FILES_BUCKET = "agent-files";

/**
 * Fetches SOP content and provides a mutation to update it.
 */
export function useTriggerInstructions(instructionPath: string | null) {
  const { data: clientId } = useClientId();
  const queryClient = useQueryClient();
  const storagePath = clientId && instructionPath
    ? `${clientId}/${instructionPath}`
    : null;

  const query = useQuery({
    queryKey: ["trigger-instructions", storagePath],
    queryFn: async () => {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .download(storagePath);
      if (error) throw error;
      return data.text();
    },
    enabled: Boolean(storagePath),
  });

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      if (!storagePath) throw new Error("No storage path");
      const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
      const { error } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .upload(storagePath, blob, { upsert: true });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["trigger-instructions", storagePath],
      });
    },
  });

  return { ...query, save: mutation };
}
