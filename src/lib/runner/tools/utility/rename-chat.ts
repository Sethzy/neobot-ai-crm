/**
 * rename_chat tool to retitle conversation threads.
 * @module lib/runner/tools/utility/rename-chat
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { updateThreadTitle } from "@/lib/chat/threads";
import type { Database } from "@/types/database";

/**
 * Creates the rename_chat tool scoped to one client/thread pair.
 */
export function createRenameChatTool(
  supabase: SupabaseClient<Database>,
  _clientId: string,
  threadId: string,
) {
  const rename_chat = tool({
    description:
      "Renames the chat. Titles should be a concise 3-5 word summary that captures the goal and key tools. If the user requests a specific name, use that name.",
    inputSchema: z.object({
      new_title: z.string().min(1).max(200).describe("New title for this conversation."),
    }),
    execute: async ({ new_title }) => {
      try {
        await updateThreadTitle(supabase, threadId, new_title);
        return { success: true as const, title: new_title };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to rename thread";
        return { success: false as const, error: message };
      }
    },
  });

  return { rename_chat };
}
