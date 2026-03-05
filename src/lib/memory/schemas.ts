/**
 * Zod schemas for memory API request/response contracts.
 * @module lib/memory/schemas
 */
import { z } from "zod";

import {
  ROOT_MEMORY_FILE_SET,
  MEMORY_TOPIC_PREFIX,
} from "@/lib/memory/constants";
import { normalizeWorkspacePath } from "@/lib/storage/agent-files";

function normalizeMemoryPath(inputPath: string): string {
  const normalizedPath = normalizeWorkspacePath(inputPath, false);
  const isRootPath = ROOT_MEMORY_FILE_SET.has(normalizedPath);
  const isTopicPath = normalizedPath.startsWith(MEMORY_TOPIC_PREFIX);

  if (!isRootPath && !isTopicPath) {
    throw new Error(`Path "${inputPath}" is not a valid memory file path.`);
  }

  return normalizedPath;
}

/** Memory file path accepted by the memory API routes. */
export const memoryFilePathSchema = z.string().min(1).transform((value, context) => {
  try {
    return normalizeMemoryPath(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid memory file path.",
    });
    return z.NEVER;
  }
});

/** Query contract for /api/memory/file GET. */
export const memoryFileQuerySchema = z.object({
  path: memoryFilePathSchema,
});

/** Body contract for /api/memory/file PUT. */
export const memoryFileWriteBodySchema = z.object({
  path: memoryFilePathSchema,
  content: z.string(),
});

/** Metadata about a single memory file in storage. */
export interface MemoryFileInfo {
  /** Display name (e.g. "SOUL.md" or "preferences.md"). */
  name: string;
  /** Workspace-relative path (e.g. "SOUL.md" or "memory/preferences.md"). */
  path: string;
  /** ISO timestamp of last modification, or null if unavailable. */
  updatedAt: string | null;
}

/**
 * Client-side response schemas use plain `z.string()` for paths since the
 * server already validated/normalized them. This avoids re-running the
 * `normalizeWorkspacePath` transform on every response parse.
 */

/** Response contract for /api/memory/files. */
export const memoryFilesResponseSchema = z.object({
  files: z.array(z.object({
    name: z.string(),
    path: z.string(),
    updatedAt: z.string().nullable(),
  })),
});

/** Response contract for /api/memory/file GET. */
export const memoryFileReadResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
});

/** Response contract for /api/memory/file PUT. */
export const memoryFileWriteResponseSchema = z.object({
  success: z.literal(true),
  path: z.string(),
});
