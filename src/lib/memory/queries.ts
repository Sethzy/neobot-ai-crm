/**
 * TanStack Query hooks for memory file API routes.
 * @module lib/memory/queries
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  memoryFileReadResponseSchema,
  memoryFilesResponseSchema,
  memoryFileWriteResponseSchema,
  type MemoryFileInfo,
} from "@/lib/memory/schemas";

/** Query keys used by memory hooks. */
export const memoryQueryKeys = {
  all: ["memory"] as const,
  files: () => [...memoryQueryKeys.all, "files"] as const,
  file: (path: string | null) => [...memoryQueryKeys.all, "file", path] as const,
};

/** Fetches all memory files for the current user. */
export function useMemoryFiles() {
  return useQuery({
    queryKey: memoryQueryKeys.files(),
    queryFn: async (): Promise<MemoryFileInfo[]> => {
      const response = await fetch("/api/memory/files");
      if (!response.ok) {
        throw new Error("Failed to load memory files.");
      }

      const parsed = memoryFilesResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Failed to parse memory files response.");
      }

      return parsed.data.files;
    },
  });
}

/** Fetches one selected memory file. */
export function useMemoryFile(path: string | null) {
  return useQuery({
    queryKey: memoryQueryKeys.file(path),
    queryFn: async (): Promise<string> => {
      const response = await fetch(`/api/memory/file?path=${encodeURIComponent(path!)}`);
      if (!response.ok) {
        throw new Error("Failed to load memory file.");
      }

      const parsed = memoryFileReadResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Failed to parse memory file response.");
      }

      return parsed.data.content;
    },
    enabled: Boolean(path),
  });
}

/** Saves one memory file and invalidates related queries. */
export function useUpdateMemoryFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const response = await fetch("/api/memory/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });

      if (!response.ok) {
        throw new Error("Failed to save memory file.");
      }

      const parsed = memoryFileWriteResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Failed to parse memory save response.");
      }

      return parsed.data;
    },
    onSuccess: (_, variables) => {
      // Optimistically set the file content to avoid a refetch round trip.
      queryClient.setQueryData(memoryQueryKeys.file(variables.path), variables.content);
      // File list still needs invalidation to update timestamps.
      void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.files() });
    },
  });
}
