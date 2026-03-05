/**
 * Loads memory file content for runner context assembly.
 * @module lib/memory/loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MEMORY_BUCKET_ID,
  MEMORY_TOPIC_DIRECTORY,
  ROOT_MEMORY_FILE_PATHS,
  ROOT_MEMORY_FILE_SET,
} from "./constants";
import type { MemoryFileInfo } from "./schemas";
import { getStorageErrorMessage, readMemoryRootFile } from "./storage";

export type { MemoryFileInfo };

const MEMORY_LINE_CAP = 200;

export interface MemoryContext {
  /** SOUL.md content injected into context. */
  soul: string;
  /** USER.md content injected into context. */
  user: string;
  /** MEMORY.md content (capped to first 200 lines). */
  memory: string;
}

function truncateToLineCount(content: string, maxLines: number): string {
  const lines = content.split("\n");
  return lines.length <= maxLines
    ? content
    : lines.slice(0, maxLines).join("\n");
}

/**
 * Reads memory files for one client and returns prompt-ready content.
 *
 * Missing files fall back to empty strings. Non-missing storage failures throw.
 */
export async function loadMemoryContext(
  supabase: SupabaseClient,
  clientId: string,
): Promise<MemoryContext> {
  const [soulResult, userResult, memoryResult] = await Promise.all([
    readMemoryRootFile(supabase, clientId, "SOUL.md"),
    readMemoryRootFile(supabase, clientId, "USER.md"),
    readMemoryRootFile(supabase, clientId, "MEMORY.md"),
  ]);

  return {
    soul: soulResult.kind === "found" ? soulResult.content : "",
    user: userResult.kind === "found" ? userResult.content : "",
    memory: truncateToLineCount(
      memoryResult.kind === "found" ? memoryResult.content : "",
      MEMORY_LINE_CAP,
    ),
  };
}

/**
 * Lists memory files for one client.
 *
 * Includes only root memory files (SOUL/USER/MEMORY) and one-level topic
 * files under memory/.
 */
export async function listMemoryFiles(
  supabase: SupabaseClient,
  clientId: string,
): Promise<MemoryFileInfo[]> {
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);

  // Parallel list calls — root dir and topic dir are independent.
  const [
    { data: rootData, error: rootError },
    { data: topicData, error: topicError },
  ] = await Promise.all([
    bucket.list(clientId, { sortBy: { column: "name", order: "asc" } }),
    bucket.list(`${clientId}/${MEMORY_TOPIC_DIRECTORY}`, {
      sortBy: { column: "name", order: "asc" },
    }),
  ]);

  if (rootError) {
    throw new Error(`Failed to list root files: ${getStorageErrorMessage(rootError)}`);
  }
  if (topicError) {
    throw new Error(`Failed to list memory directory: ${getStorageErrorMessage(topicError)}`);
  }

  const rootEntries = new Map(
    (rootData ?? [])
      .filter((item) => item.id !== null && ROOT_MEMORY_FILE_SET.has(item.name))
      .map((item) => [item.name, item] as const),
  );

  // Preserve canonical SOUL → USER → MEMORY order from the constant.
  const rootFiles: MemoryFileInfo[] = ROOT_MEMORY_FILE_PATHS
    .filter((path) => rootEntries.has(path))
    .map((path) => {
      const entry = rootEntries.get(path)!;
      return { name: path, path, updatedAt: entry.updated_at ?? null };
    });

  const topicFiles: MemoryFileInfo[] = (topicData ?? [])
    .filter((item) => item.id !== null && item.name.toLowerCase().endsWith(".md"))
    .map((item) => ({
      name: item.name,
      path: `${MEMORY_TOPIC_DIRECTORY}/${item.name}`,
      updatedAt: item.updated_at ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return [...rootFiles, ...topicFiles];
}
