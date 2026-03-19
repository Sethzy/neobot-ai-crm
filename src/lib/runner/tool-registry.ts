/**
 * Shared runner tool registry assembly.
 * @module lib/runner/tool-registry
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isBrowserUseConfigured } from "@/lib/browser-use/client";
import { loadCrmConfig } from "@/lib/crm/config";
import {
  createBrowserTools,
  createConnectionTools,
  createCrmTools,
  createStorageTools,
  createTriggerTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
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

  if (isSubagent) {
    return {
      ...crmTools,
      ...storageTools,
      ...webTools,
      ...utilityTools,
      ...connectionTools,
    };
  }

  const triggerTools = createTriggerTools(supabase, clientId, threadId, {
    allowMutations: options?.allowTriggerMutations ?? true,
  });
  const browserTools = isBrowserUseConfigured() ? createBrowserTools() : {};

  return {
    ...crmTools,
    ...storageTools,
    ...webTools,
    ...utilityTools,
    ...triggerTools,
    ...connectionTools,
    ...browserTools,
  };
}
