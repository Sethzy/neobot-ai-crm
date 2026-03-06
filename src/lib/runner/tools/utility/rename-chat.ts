/**
 * rename_chat tool to retitle conversation threads.
 * @module lib/runner/tools/utility/rename-chat
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Creates the rename_chat tool scoped to one client/thread pair.
 */
export function createRenameChatTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  const rename_chat = tool({
    description:
      "Rename the current conversation thread to a concise, descriptive title.",
    inputSchema: z.object({
      new_title: z.string().min(1).max(200).describe("New title for this conversation."),
    }),
    execute: async ({ new_title }) => {
      const { data: thread, error: threadError } = await supabase
        .from("conversation_threads")
        .select("thread_id, is_pinned")
        .eq("thread_id", threadId)
        .eq("client_id", clientId)
        .maybeSingle();

      if (threadError) {
        return { success: false as const, error: threadError.message };
      }

      if (!thread) {
        return { success: false as const, error: "Thread not found or access denied" };
      }

      if (thread.is_pinned) {
        return { success: false as const, error: "Pinned threads cannot be renamed" };
      }

      const { data, error } = await supabase
        .from("conversation_threads")
        .update({ title: new_title })
        .eq("thread_id", threadId)
        .eq("client_id", clientId)
        .select("thread_id")
        .maybeSingle();

      if (error) {
        return { success: false as const, error: error.message };
      }

      if (!data) {
        return { success: false as const, error: "Thread not found or access denied" };
      }

      return { success: true as const, title: new_title };
    },
  });

  return { rename_chat };
}
