/**
 * Utility tool factory barrel for runner registration.
 * @module lib/runner/tools/utility
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createRenameChatTool } from "./rename-chat";
import { createSendMessageTool } from "./send-message";
import { createSqlTools } from "./sql";
import { createTodoTools } from "./todo";

/**
 * Creates all utility tools for a specific client/thread run context.
 */
export function createUtilityTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  const todoTools = createTodoTools(supabase, clientId, threadId);
  const renameChatTool = createRenameChatTool(supabase, clientId, threadId);
  const sendMessageTool = createSendMessageTool();
  const sqlTools = createSqlTools(supabase);

  return {
    ...todoTools,
    ...renameChatTool,
    ...sendMessageTool,
    ...sqlTools,
  };
}
