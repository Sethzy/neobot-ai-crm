/**
 * TanStack Query hooks and upload helpers for Knowledge Base vault files.
 * @module hooks/use-vault-files
 */
"use client";

import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildVaultSearchOrFilter } from "@/lib/knowledge/postgrest-filters";
import {
  vaultFileInsertSchema,
  vaultFileSchema,
  type VaultFile,
} from "@/lib/knowledge/schemas";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export interface VaultFileFilters {
  search?: string;
}

/** Query key factory for vault file queries. */
export const vaultFileKeys = {
  all: ["vault-files"] as const,
  lists: () => [...vaultFileKeys.all, "list"] as const,
  list: (filters?: VaultFileFilters) => [...vaultFileKeys.lists(), filters ?? {}] as const,
};

/** Fetches vault files with optional free-text search. */
async function fetchVaultFiles(filters: VaultFileFilters): Promise<VaultFile[]> {
  let query = supabase
    .from("vault_files")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.or(buildVaultSearchOrFilter(filters.search.trim()));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => vaultFileSchema.parse(row));
}

/** Query options factory for vault file list queries. */
export function vaultFilesQueryOptions(filters: VaultFileFilters) {
  return queryOptions({
    queryKey: vaultFileKeys.list(filters),
    queryFn: () => fetchVaultFiles(filters),
  });
}

/** Returns vault file list query state and subscribes to realtime invalidation. */
export function useVaultFiles(filters: VaultFileFilters) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "vault_files",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [vaultFileKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...vaultFilesQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

const AGENT_FILES_BUCKET = "agent-files";
const TEXT_FILE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "csv",
  "xml",
  "yaml",
  "yml",
]);

function sanitizeBaseFilename(filename: string): { safeBase: string; safeExtension: string } {
  const normalized = filename.trim();
  const dotIndex = normalized.lastIndexOf(".");
  const rawBase = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;
  const rawExtension = dotIndex > 0 ? normalized.slice(dotIndex + 1) : "";

  const safeBase = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

  const safeExtension = rawExtension.toLowerCase().replace(/[^a-z0-9]/g, "");

  return { safeBase, safeExtension };
}

function isTextLikeFile(file: File, safeExtension: string): boolean {
  if (file.type.startsWith("text/")) {
    return true;
  }

  return TEXT_FILE_EXTENSIONS.has(safeExtension);
}

async function extractTextContent(file: File, safeExtension: string): Promise<string | null> {
  if (!isTextLikeFile(file, safeExtension)) {
    return null;
  }

  let text: string;

  if (typeof file.text === "function") {
    text = await file.text();
  } else if (typeof file.arrayBuffer === "function") {
    text = new TextDecoder().decode(await file.arrayBuffer());
  } else {
    text = await new Response(file as Blob).text();
  }
  const normalized = text.trim();

  return normalized.length > 0 ? normalized : null;
}

/**
 * Uploads a file to Supabase Storage and inserts a vault_files metadata row.
 * If DB insert fails after upload, storage is rolled back to avoid orphan objects.
 */
export async function uploadVaultFile(
  client: SupabaseClient<Database>,
  clientId: string,
  file: File,
): Promise<VaultFile> {
  const { safeBase, safeExtension } = sanitizeBaseFilename(file.name);
  const suffix = crypto.randomUUID().split("-")[0] ?? "file";
  const storedFilename = safeExtension.length > 0
    ? `${safeBase}-${suffix}.${safeExtension}`
    : `${safeBase}-${suffix}`;

  const relativeStoragePath = `vault/${storedFilename}`;
  const absoluteStoragePath = `${clientId}/${relativeStoragePath}`;
  const extractedTextContent = await extractTextContent(file, safeExtension);

  const uploadOptions = {
    upsert: false,
    ...(file.type ? { contentType: file.type } : {}),
  };

  const { error: storageError } = await client.storage
    .from(AGENT_FILES_BUCKET)
    .upload(absoluteStoragePath, file, uploadOptions);

  if (storageError) {
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  const insertPayload = vaultFileInsertSchema.parse({
    client_id: clientId,
    filename: file.name,
    storage_path: relativeStoragePath,
    title: safeBase,
    content_type: file.type || null,
    size_bytes: file.size,
    content: extractedTextContent,
    needs_reprocess: true,
  });

  const { data, error: dbError } = await client
    .from("vault_files")
    .insert(insertPayload)
    .select()
    .single();

  if (dbError || !data) {
    await client.storage.from(AGENT_FILES_BUCKET).remove([absoluteStoragePath]);
    throw new Error(`Failed to create vault file record: ${dbError?.message ?? "unknown error"}`);
  }

  return vaultFileSchema.parse(data);
}

/** Mutation hook for uploading files and refreshing vault list queries. */
export function useUploadVaultFile() {
  const { data: clientId } = useClientId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!clientId) {
        throw new Error("Not authenticated");
      }

      return uploadVaultFile(supabase, clientId, file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vaultFileKeys.lists() });
    },
  });
}
