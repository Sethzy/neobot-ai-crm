/**
 * Utility tool factory barrel for runner registration.
 * @module lib/runner/tools/utility
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmVocabConfig } from "@/lib/crm/config";
import type { Database } from "@/types/database";

import { createAskUserQuestionTool } from "./ask-user-question";
import { createRenameChatTool } from "./rename-chat";
import { createSendMessageTool } from "./send-message";
import { createSqlTools } from "./sql";
import { createTodoTools } from "./todo";

export interface CreateUtilityToolsOptions {
  /** Allows explicit control over whether outbound messaging is included. */
  includeSendMessage?: boolean;
  /** Resolved CRM config for the active run, if already loaded upstream. */
  crmConfig?: CrmVocabConfig;
}

/**
 * Creates all utility tools for a specific client/thread run context.
 */
export function createUtilityTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
  options?: CreateUtilityToolsOptions,
) {
  const includeSendMessage = options?.includeSendMessage ?? true;

  return {
    ...createTodoTools(supabase, clientId, threadId),
    ...createSqlTools(supabase, options?.crmConfig),
    ...createAskUserQuestionTool(),
    ...createRenameChatTool(supabase, clientId, threadId),
    ...(includeSendMessage ? createSendMessageTool() : {}),
  };
}
