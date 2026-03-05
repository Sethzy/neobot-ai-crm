/**
 * Bootstraps required memory files in client-scoped storage.
 * @module lib/memory/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from "./templates";
import {
  getStorageErrorMessage,
  isStorageConflictError,
  readMemoryRootFile,
  type MemoryRootPath,
} from "./storage";

const BUCKET_ID = "agent-files";
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

interface MemoryFileTemplate {
  path: MemoryRootPath;
  content: string;
}

const REQUIRED_MEMORY_FILES: MemoryFileTemplate[] = [
  { path: "SOUL.md", content: DEFAULT_SOUL_MD },
  { path: "USER.md", content: DEFAULT_USER_MD },
  { path: "MEMORY.md", content: DEFAULT_MEMORY_MD },
];

async function uploadMissingFile(
  supabase: SupabaseClient,
  clientId: string,
  file: MemoryFileTemplate,
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_ID)
    .upload(`${clientId}/${file.path}`, file.content, {
      upsert: false,
      contentType: TEXT_CONTENT_TYPE,
    });

  if (error && !isStorageConflictError(error)) {
    throw new Error(`Failed to bootstrap ${file.path}: ${getStorageErrorMessage(error)}`);
  }
}

/**
 * Creates missing required memory files for a client.
 *
 * This function is idempotent and safe to call on each run. It validates each
 * required file independently so a partial folder state is repaired.
 */
export async function bootstrapMemoryFiles(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const missingFiles: MemoryFileTemplate[] = [];

  for (const file of REQUIRED_MEMORY_FILES) {
    const result = await readMemoryRootFile(supabase, clientId, file.path);
    if (result.kind === "missing") {
      missingFiles.push(file);
    } // Existing files are left untouched.
  }

  for (const missingFile of missingFiles) {
    await uploadMissingFile(supabase, clientId, missingFile);
  }
}
