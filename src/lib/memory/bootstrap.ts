/**
 * Bootstraps required memory files in client-scoped storage.
 * @module lib/memory/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAgentFileClient } from "@/lib/storage/agent-files";

import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from "./templates";

const BUCKET_ID = "agent-files";
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

interface MemoryFileTemplate {
  path: "SOUL.md" | "USER.md" | "MEMORY.md";
  content: string;
}

const REQUIRED_MEMORY_FILES: MemoryFileTemplate[] = [
  { path: "SOUL.md", content: DEFAULT_SOUL_MD },
  { path: "USER.md", content: DEFAULT_USER_MD },
  { path: "MEMORY.md", content: DEFAULT_MEMORY_MD },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isMissingFileError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return message.includes("object not found")
    || message.includes("file not found")
    || message.includes("no such file");
}

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

  if (error) {
    throw new Error(`Failed to bootstrap ${file.path}: ${error.message}`);
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
  const fileClient = createAgentFileClient(supabase, clientId);
  const missingFiles: MemoryFileTemplate[] = [];

  for (const file of REQUIRED_MEMORY_FILES) {
    try {
      await fileClient.downloadFile(file.path);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw new Error(`Failed to inspect memory file "${file.path}": ${getErrorMessage(error)}`);
      }

      missingFiles.push(file);
    }
  }

  for (const missingFile of missingFiles) {
    await uploadMissingFile(supabase, clientId, missingFile);
  }
}
