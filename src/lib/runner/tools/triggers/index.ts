/**
 * Trigger tool factory barrel for runner registration.
 * @module lib/runner/tools/triggers
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createManageTriggersTool } from "./manage-triggers";
import { createSearchTriggersTool } from "./search-triggers";
import { createSetupTriggerTool } from "./setup-trigger";

export interface CreateTriggerToolsOptions {
  allowMutations?: boolean;
}

/**
 * Creates trigger discovery and management tools for the active client and thread.
 */
export function createTriggerTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
  options?: CreateTriggerToolsOptions,
) {
  const allowMutations = options?.allowMutations ?? true;

  const searchTools = createSearchTriggersTool();
  const manageTools = createManageTriggersTool(supabase, clientId, {
    readOnly: !allowMutations,
  });

  if (!allowMutations) {
    return {
      ...searchTools,
      ...manageTools,
    };
  }

  const setupTools = createSetupTriggerTool(supabase, clientId, threadId);

  return {
    ...searchTools,
    ...setupTools,
    ...manageTools,
  };
}
