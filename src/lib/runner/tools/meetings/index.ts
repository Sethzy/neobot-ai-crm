/**
 * Meeting tool barrel.
 * @module lib/runner/tools/meetings
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createSearchMeetingsTool } from "./search";

export function createMeetingTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    ...createSearchMeetingsTool(supabase, clientId),
  };
}
