/**
 * Utility tool factory barrel for runner registration.
 * @module lib/runner/tools/utility
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createAskUserQuestionTool } from "./ask-user-question";
import { createRenameChatTool } from "./rename-chat";
import { createSendMessageTool } from "./send-message";
import { createSqlTools } from "./sql";
import { createTodoTools } from "./todo";

export interface CreateUtilityToolsOptions {
  /** Removes user-facing tools that a subagent cannot safely use. */
  isSubagent?: boolean;
  /** Allows explicit control over whether outbound messaging is included. */
  includeSendMessage?: boolean;
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
  const isSubagent = options?.isSubagent ?? false;
  const includeSendMessage = options?.includeSendMessage ?? !isSubagent;
  const todoTools = createTodoTools(supabase, clientId, threadId);
  const sqlTools = createSqlTools(supabase);
  const tools = {
    ...todoTools,
    ...sqlTools,
  };

  if (!isSubagent) {
    Object.assign(tools, createAskUserQuestionTool(), createRenameChatTool(supabase, clientId, threadId));
  }

  if (includeSendMessage) {
    Object.assign(tools, createSendMessageTool());
  }

  return tools;
}
