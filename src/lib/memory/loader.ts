/**
 * Loads memory file content for runner context assembly.
 * @module lib/memory/loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { readMemoryRootFile } from "./storage";

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
