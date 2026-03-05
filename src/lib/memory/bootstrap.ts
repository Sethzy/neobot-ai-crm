/**
 * Bootstraps required memory files in client-scoped storage.
 * @module lib/memory/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MEMORY_BUCKET_ID,
  MEMORY_TEXT_CONTENT_TYPE,
  ROOT_MEMORY_FILE_SET,
  type MemoryRootPath,
} from "./constants";
import {
  DEFAULT_GROWTH_PLAN_MD,
  DEFAULT_KEY_DECISIONS_MD,
  DEFAULT_MEMORY_MD,
  DEFAULT_PATTERNS_MD,
  DEFAULT_PREFERENCES_MD,
  DEFAULT_SOUL_MD,
  DEFAULT_USER_MD,
} from "./templates";
import {
  getStorageErrorMessage,
  isMissingStorageObjectError,
  isStorageConflictError,
  readMemoryRootFile,
} from "./storage";

interface MemoryFileTemplate {
  path: string;
  content: string;
}

const REQUIRED_MEMORY_FILES: MemoryFileTemplate[] = [
  { path: "SOUL.md", content: DEFAULT_SOUL_MD },
  { path: "USER.md", content: DEFAULT_USER_MD },
  { path: "MEMORY.md", content: DEFAULT_MEMORY_MD },
  { path: "memory/preferences.md", content: DEFAULT_PREFERENCES_MD },
  { path: "memory/growth-plan.md", content: DEFAULT_GROWTH_PLAN_MD },
  { path: "memory/patterns.md", content: DEFAULT_PATTERNS_MD },
  { path: "memory/key-decisions.md", content: DEFAULT_KEY_DECISIONS_MD },
];

function isRootMemoryPath(path: string): path is MemoryRootPath {
  return ROOT_MEMORY_FILE_SET.has(path);
}

async function isMemoryFileMissing(
  supabase: SupabaseClient,
  clientId: string,
  path: string,
): Promise<boolean> {
  if (isRootMemoryPath(path)) {
    const result = await readMemoryRootFile(supabase, clientId, path);
    return result.kind === "missing";
  }

  const { data, error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .download(`${clientId}/${path}`);

  if (error) {
    if (isMissingStorageObjectError(error)) {
      return true;
    }

    throw new Error(`Failed to read memory file "${path}": ${getStorageErrorMessage(error)}`);
  }

  return !data;
}

async function uploadMissingFile(
  supabase: SupabaseClient,
  clientId: string,
  file: MemoryFileTemplate,
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
 * This function is idempotent and safe to call on each run. It validates each
 * required file independently so a partial folder state is repaired.
 */
export async function bootstrapMemoryFiles(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const missingFiles: MemoryFileTemplate[] = [];

  for (const file of REQUIRED_MEMORY_FILES) {
    const isMissing = await isMemoryFileMissing(supabase, clientId, file.path);
    if (isMissing) {
      missingFiles.push(file);
    } // Existing files are left untouched.
  }

  for (const missingFile of missingFiles) {
    await uploadMissingFile(supabase, clientId, missingFile);
  }
}
