/**
 * Client storage bootstrap — memory files + skills initialization.
 *
 * `ensureClientBootstrap()` is the public entrypoint. It checks a durable
 * `is_bootstrapped` flag on the `clients` table and only runs the full
 * bootstrap (memory file creation + skill seeding) when needed.
 *
 * @module lib/memory/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { bootstrapSkills } from "@/lib/runner/skills/skill-bootstrap";

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
 * missing files in parallel. Called by `ensureClientBootstrap()`.
 */
export async function bootstrapMemoryFiles(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);

  // 2 parallel list calls instead of 7 sequential downloads.
  const [rootResult, topicResult] = await Promise.all([
    bucket.list(clientId),
    bucket.list(`${clientId}/${MEMORY_TOPIC_DIRECTORY}`),
  ]);

  if (rootResult.error) {
    throw new Error(`Failed to list root memory files: ${getStorageErrorMessage(rootResult.error)}`);
  }
  if (topicResult.error) {
    throw new Error(`Failed to list topic memory files: ${getStorageErrorMessage(topicResult.error)}`);
  }

  const existingRoot = new Set((rootResult.data ?? []).map((f) => f.name));
  const existingTopic = new Set((topicResult.data ?? []).map((f) => f.name));

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

  await bootstrapSkills(supabase, clientId);
}

/**
 * Durable one-time client storage initialization.
 *
 * Checks `is_bootstrapped` on the `clients` row. If false, runs the full
 * bootstrap (memory files + skills) and sets the flag. If true, returns
 * immediately — no storage calls at all.
 *
 * Call from entrypoints (chat route) BEFORE context assembly. This replaces
 * the old pattern of calling bootstrapMemoryFiles inside loadSystemPromptState.
 */
export async function ensureClientBootstrap(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const { data: client, error: selectError } = await supabase
    .from("clients")
    .select("is_bootstrapped")
    .eq("client_id", clientId)
    .single();

  if (selectError) {
    throw new Error(`Failed to check bootstrap status: ${selectError.message}`);
  }

  if (client?.is_bootstrapped) {
    return;
  }

  await bootstrapMemoryFiles(supabase, clientId);

  const { error: updateError } = await supabase
    .from("clients")
    .update({ is_bootstrapped: true })
    .eq("client_id", clientId);

  if (updateError) {
    throw new Error(`Failed to mark client as bootstrapped: ${updateError.message}`);
  }
}

