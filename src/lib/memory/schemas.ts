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

/** Single file metadata shape used by list responses and UI hooks. */
export const memoryFileInfoSchema = z.object({
  name: z.string(),
  path: memoryFilePathSchema,
  updatedAt: z.string().nullable(),
});
export type MemoryFileInfo = z.infer<typeof memoryFileInfoSchema>;

/** Response contract for /api/memory/files. */
export const memoryFilesResponseSchema = z.object({
  files: z.array(memoryFileInfoSchema),
});

/** Response contract for /api/memory/file GET. */
export const memoryFileReadResponseSchema = z.object({
  path: memoryFilePathSchema,
  content: z.string(),
});

/** Response contract for /api/memory/file PUT. */
export const memoryFileWriteResponseSchema = z.object({
  success: z.literal(true),
  path: memoryFilePathSchema,
});
