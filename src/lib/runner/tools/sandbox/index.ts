/**
 * Sandbox tool factory barrel.
 * @module lib/runner/tools/sandbox
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createAnalyzeSpreadsheetTool } from "./analyze-spreadsheet";
import { createPublishArtifactTool } from "./publish-artifact";

/**
 * Creates all sandbox-backed tools for a specific client/thread context.
 */
export function createSandboxTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  return {
    ...createAnalyzeSpreadsheetTool(supabase, clientId, threadId),
    ...createPublishArtifactTool(supabase, clientId, threadId),
  };
}
