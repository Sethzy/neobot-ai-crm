/**
 * Browser automation tool factory barrel for runner registration.
 * @module lib/runner/tools/browser
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createBrowseWebsiteTool } from "./browse-website";

type BrowserSupabaseClient = SupabaseClient<Database>;

/**
 * Creates the Browser-Use powered browser automation tools.
 */
export function createBrowserTools(
  supabase: BrowserSupabaseClient,
  clientId: string,
) {
  return {
    ...createBrowseWebsiteTool(supabase, clientId),
  };
}
