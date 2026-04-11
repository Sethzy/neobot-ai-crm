/**
 * rename_chat tool for managed agents.
 *
 * @module lib/managed-agents/tools/utility/rename-chat
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";

async function ensureThreadIsMutable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientId: string,
  threadId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("thread_id, is_pinned")
    .eq("thread_id", threadId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Thread not found");
  }

  if (data.is_pinned) {
    throw new Error("Pinned threads cannot be renamed");
  }
}

const inputSchema = z.object({
  new_title: z.string().min(1).max(200).describe("New title for this conversation."),
});

type RenameChatInput = z.infer<typeof inputSchema>;

export const renameChatTool: ManagedAgentTool<RenameChatInput> = {
  name: "rename_chat",
  description:
    "Renames the chat. Titles should be a concise 3-5 word summary that captures the goal and key tools. If the user requests a specific name, use that name.",
  inputSchema,
  execute: async ({ new_title }, context) => {
    if (!context.threadId) {
      return { success: false as const, error: "Thread ID is required" };
    }

    try {
      await ensureThreadIsMutable(context.supabase, context.clientId, context.threadId);

      const { data, error } = await context.supabase
        .from("conversation_threads")
        .update({ title: new_title })
        .eq("thread_id", context.threadId)
        .eq("client_id", context.clientId)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to update thread title");
      }

      return { success: true as const, title: new_title };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Failed to rename thread",
      };
    }
  },
};
