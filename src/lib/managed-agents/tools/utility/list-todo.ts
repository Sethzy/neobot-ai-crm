/**
 * list_todo tool for managed agents.
 *
 * @module lib/managed-agents/tools/utility/list-todo
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  ids: z.array(z.string().uuid()).optional().describe("Optional array of todo IDs to filter. If not provided, returns all todos."),
});

type ListTodoInput = z.infer<typeof inputSchema>;

export const listTodoTool: ManagedAgentTool<ListTodoInput> = {
  name: "list_todo",
  description: "List todos for this agent. Can optionally filter by specific todo IDs.",
  inputSchema,
  execute: async ({ ids }, context) => {
    if (!context.threadId) {
      return { success: false as const, error: "Thread ID is required" };
    }

    let query = context.supabase
      .from("agent_todo")
      .select("*")
      .eq("thread_id", context.threadId)
      .eq("client_id", context.clientId)
      .order("created_at", { ascending: true });

    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false as const, error: error.message };
    }

    const todos = data ?? [];
    return { success: true as const, todos, count: todos.length };
  },
};
