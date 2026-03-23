/**
 * Shared runner tool registry assembly.
 * @module lib/runner/tool-registry
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isApifyConfigured } from "@/lib/apify/env";
import { isBrowserUseConfigured } from "@/lib/browser-use/client";
import { loadCrmConfig } from "@/lib/crm/config";
import {
  createBrowserTools,
  createConnectionTools,
  createCrmTools,
  createListingTools,
  createMarketTools,
  createStorageTools,
  createTriggerTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface CreateRunnerToolsOptions {
  allowTriggerMutations?: boolean;
  allowConnectionMutations?: boolean;
  crmMode?: "normal" | "setup";
  crmConfig?: Awaited<ReturnType<typeof loadCrmConfig>>["config"];
  isSubagent?: boolean;
  includeSendMessage?: boolean;
  includeBrowserTools?: boolean;
  includeMarketTools?: boolean;
  includeListingTools?: boolean;
  /** Only relevant for chat-triggered runs. When true, includes configure_crm in the tool registry. */
  includeConfigTool?: boolean;
}

/**
 * Creates the full tool registry for one runner invocation.
 */
export function createRunnerTools(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
  options?: CreateRunnerToolsOptions,
) {
  const isSubagent = options?.isSubagent ?? false;
  const crmTools = createCrmTools(supabase, clientId, {
    allowWriteTools: true,
    allowDeleteTools: !isSubagent,
    mode: options?.crmMode ?? "normal",
    config: options?.crmConfig,
    includeConfigTool: options?.includeConfigTool,
  });
  const storageTools = createStorageTools(supabase, clientId);
  const webTools = createWebTools();
  const utilityTools = createUtilityTools(supabase, clientId, threadId, {
    isSubagent,
    includeSendMessage: options?.includeSendMessage ?? !isSubagent,
  });
  const connectionTools = createConnectionTools(supabase, clientId, {
    allowMutations: isSubagent ? false : (options?.allowConnectionMutations ?? true),
  });
  const shouldIncludeMarketTools =
    options?.includeMarketTools === true && isPropertySupabaseConfigured();
  const marketTools = shouldIncludeMarketTools ? createMarketTools() : {};
  const shouldIncludeListingTools =
    !isSubagent && options?.includeListingTools === true && isApifyConfigured();
  const listingTools = shouldIncludeListingTools ? createListingTools() : {};

  if (isSubagent) {
    return {
      ...crmTools,
      ...storageTools,
      ...webTools,
      ...marketTools,
      ...utilityTools,
      ...connectionTools,
    };
  }

  const triggerTools = createTriggerTools(supabase, clientId, threadId, {
    allowMutations: options?.allowTriggerMutations ?? true,
  });
  const shouldIncludeBrowserTools =
    options?.includeBrowserTools === true && isBrowserUseConfigured();
  const browserTools = shouldIncludeBrowserTools
    ? createBrowserTools(supabase, clientId)
    : {};

  return {
    ...crmTools,
    ...storageTools,
    ...webTools,
    ...marketTools,
    ...listingTools,
    ...utilityTools,
    ...triggerTools,
    ...connectionTools,
    ...browserTools,
  };
}
