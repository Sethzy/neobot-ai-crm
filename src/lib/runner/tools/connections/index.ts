/**
 * Connection tool factory barrel for runner registration.
 * @module lib/runner/tools/connections
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createGetConnectionDetailsTool } from "./get-connection-details";
import { createGetIntegrationCapabilitiesTool } from "./get-integration-capabilities";
import { createListConnectionsTool } from "./list-connections";
import { createSearchIntegrationsTool } from "./search-integrations";

export interface CreateConnectionToolsOptions {
  allowMutations?: boolean;
}

/**
 * Creates the connection discovery tool registry for one runner invocation.
 */
export function createConnectionTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  options?: CreateConnectionToolsOptions,
) {
  const allowMutations = options?.allowMutations ?? true;

  const readOnlyTools = {
    ...createListConnectionsTool(supabase, clientId),
    ...createGetConnectionDetailsTool(supabase, clientId),
    ...createSearchIntegrationsTool(),
    ...createGetIntegrationCapabilitiesTool(),
  };

  if (!allowMutations) {
    return readOnlyTools;
  }

  return readOnlyTools;
}
