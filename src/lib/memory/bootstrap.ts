/**
 * Bootstraps required memory files in client-scoped storage.
 *
 * Called on every chat message via `assembleContext`. Uses list-based existence
 * checks (2 parallel calls) instead of downloading file content, and caches
 * bootstrapped clients in-process to skip storage calls on warm invocations.
 *
 * @module lib/memory/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MEMORY_BUCKET_ID,
  MEMORY_TEXT_CONTENT_TYPE,
  MEMORY_TOPIC_DIRECTORY,
  REQUIRED_MEMORY_FILE_PATHS,
  ROOT_MEMORY_FILE_SET,
} from "./constants";
import { DEFAULT_MEMORY_FILE_CONTENT } from "./templates";
import {
  getStorageErrorMessage,
  isStorageConflictError,
} from "./storage";

/** Process-scoped cache — avoids storage calls on warm serverless invocations. */
const bootstrappedClients = new Set<string>();

/** Derives the bootstrap file list from the canonical constant + content map. */
const REQUIRED_MEMORY_FILES = REQUIRED_MEMORY_FILE_PATHS.map((path) => ({
  path,
  content: DEFAULT_MEMORY_FILE_CONTENT[path],
}));

async function uploadMissingFile(
  supabase: SupabaseClient,
  clientId: string,
  file: { path: string; content: string },
): Promise<void> {
  const { error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .upload(`${clientId}/${file.path}`, file.content, {
      upsert: false,
      contentType: MEMORY_TEXT_CONTENT_TYPE,
    });

  if (error && !isStorageConflictError(error)) {
    throw new Error(`Failed to bootstrap ${file.path}: ${getStorageErrorMessage(error)}`);
  }
}

/**
 * Creates missing required memory files for a client.
 *
 * Idempotent and safe to call on each run. Uses 2 parallel directory list calls
 * to detect missing files (instead of 7 sequential downloads), then uploads
 * missing files in parallel. Skips entirely on warm invocations via process cache.
 */
export async function bootstrapMemoryFiles(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  if (bootstrappedClients.has(clientId)) return;

  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);

  // 2 parallel list calls instead of 7 sequential downloads.
  const [{ data: rootData }, { data: topicData }] = await Promise.all([
    bucket.list(clientId),
    bucket.list(`${clientId}/${MEMORY_TOPIC_DIRECTORY}`),
  ]);

  const existingRoot = new Set((rootData ?? []).map((f) => f.name));
  const existingTopic = new Set((topicData ?? []).map((f) => f.name));

  const missingFiles = REQUIRED_MEMORY_FILES.filter(({ path }) => {
    const isRoot = ROOT_MEMORY_FILE_SET.has(path);
    const fileName = path.split("/").pop()!;
    return isRoot ? !existingRoot.has(fileName) : !existingTopic.has(fileName);
  });

  if (missingFiles.length > 0) {
    await Promise.all(
      missingFiles.map((file) => uploadMissingFile(supabase, clientId, file)),
    );
  }

  bootstrappedClients.add(clientId);
}

/** Clears the process-scoped bootstrap cache. Exposed for testing. */
export function _resetBootstrapCache(): void {
  bootstrappedClients.clear();
}
