/**
 * Shared runner tool registry assembly.
 * @module lib/runner/tool-registry
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCrmConfig } from "@/lib/crm/config";
import { isSandboxConfigured } from "@/lib/sandbox/env";
import {
  createBrowserTools,
  createConnectionTools,
  createCrmTools,
  createListingTools,
  createMarketTools,
  createSandboxTools,
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
  // Market tools eagerly create a Supabase client that throws without env vars.
  // Guard creation so runner startup doesn't crash in environments without property DB.
  const marketTools = isPropertySupabaseConfigured() ? createMarketTools() : {};
  const listingTools = isSubagent ? {} : createListingTools();
  const sandboxTools = !isSubagent && isSandboxConfigured()
    ? createSandboxTools(supabase, clientId, threadId)
    : {};

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
  const browserTools = createBrowserTools(supabase, clientId);

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
    ...sandboxTools,
  };
}
