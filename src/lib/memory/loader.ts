/**
 * Loads memory file content for runner context assembly.
 * @module lib/memory/loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAgentFileClient } from "@/lib/storage/agent-files";
import type { AgentFileClient } from "@/lib/storage/agent-files";

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

async function safeReadFile(
  fileClient: AgentFileClient,
  path: "SOUL.md" | "USER.md" | "MEMORY.md",
): Promise<string> {
  try {
    return await fileClient.downloadFile(path);
  } catch {
    return "";
  }
}

/**
 * Reads memory files for one client and returns prompt-ready content.
 *
 * Any read failure falls back to an empty string so run assembly can continue.
 */
export async function loadMemoryContext(
  supabase: SupabaseClient,
  clientId: string,
): Promise<MemoryContext> {
  const fileClient = createAgentFileClient(supabase, clientId);
  const [soul, user, memoryRaw] = await Promise.all([
    safeReadFile(fileClient, "SOUL.md"),
    safeReadFile(fileClient, "USER.md"),
    safeReadFile(fileClient, "MEMORY.md"),
  ]);

  return {
    soul,
    user,
    memory: truncateToLineCount(memoryRaw, MEMORY_LINE_CAP),
  };
}
