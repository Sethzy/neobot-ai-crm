/**
 * Sandbox tool factory barrel.
 * @module lib/runner/tools/sandbox
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createExecuteInSandboxTool } from "./execute-in-sandbox";

/**
 * Creates all sandbox-backed tools for a specific client/thread context.
 */
export function createSandboxTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  return {
    ...createExecuteInSandboxTool(supabase, clientId, threadId),
  };
}
