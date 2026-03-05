/**
 * Shared constants for memory storage layout and seeded files.
 * @module lib/memory/constants
 */

/** Supabase Storage bucket used for client-scoped agent files. */
export const MEMORY_BUCKET_ID = "agent-files";

/** Plain-text content type used for markdown memory files. */
export const MEMORY_TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

/** Fixed root memory files that live at /{clientId}/ in Storage. */
export const ROOT_MEMORY_FILE_PATHS = ["SOUL.md", "USER.md", "MEMORY.md"] as const;

/** Root memory file type derived from the canonical path tuple. */
export type MemoryRootPath = (typeof ROOT_MEMORY_FILE_PATHS)[number];

/** Set used for O(1) root path checks. */
export const ROOT_MEMORY_FILE_SET = new Set<string>(ROOT_MEMORY_FILE_PATHS);

/** Topic directory and prefix under each client workspace. */
export const MEMORY_TOPIC_DIRECTORY = "memory";
export const MEMORY_TOPIC_PREFIX = `${MEMORY_TOPIC_DIRECTORY}/`;

/** Seeded topic files under /{clientId}/memory/. */
export const MEMORY_TOPIC_FILE_PATHS = [
  "memory/preferences.md",
  "memory/growth-plan.md",
  "memory/patterns.md",
  "memory/key-decisions.md",
] as const;

/** All seeded paths for bootstrap in deterministic order. */
export const REQUIRED_MEMORY_FILE_PATHS = [
  ...ROOT_MEMORY_FILE_PATHS,
  ...MEMORY_TOPIC_FILE_PATHS,
] as const;
