/**
 * Agent todo tools for scratchpad / notes-to-future-self.
 * @module lib/runner/tools/utility/todo
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

const addOperationSchema = z.object({
  op: z.literal("add"),
  title: z.string().min(1).describe("Todo title."),
  payload: z.record(z.unknown()).optional().describe("Optional structured payload."),
});

const updateOperationSchema = z.object({
  op: z.literal("update"),
  todo_id: z.string().uuid().describe("UUID of the todo to update."),
  title: z.string().min(1).optional().describe("Updated title."),
  payload: z.record(z.unknown()).optional().describe("Updated structured payload."),
});

const deleteOperationSchema = z.object({
  op: z.literal("delete"),
  todo_id: z.string().uuid().describe("UUID of the todo to delete."),
});

const todoOperationSchema = z.discriminatedUnion("op", [
  addOperationSchema,
  updateOperationSchema,
  deleteOperationSchema,
]);

type TodoOperation = z.infer<typeof todoOperationSchema>;

type TodoOperationResult =
  | { op: "add"; success: true; todo: unknown }
  | { op: "add"; success: false; error: string }
  | { op: "update"; success: true; todo: unknown }
  | { op: "update"; success: false; error: string }
  | { op: "delete"; success: true; todo_id: string }
  | { op: "delete"; success: false; error: string };

/**
 * Creates agent todo tools scoped to a specific client/thread pair.
 */
export function createTodoTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  async function executeAdd(
    operation: z.infer<typeof addOperationSchema>,
  ): Promise<TodoOperationResult> {
    const { data, error } = await supabase
      .from("agent_todo")
      .insert({
        client_id: clientId,
        thread_id: threadId,
        title: operation.title,
        payload: operation.payload ?? {},
      })
      .select()
      .single();

    if (error) {
      return { op: "add", success: false, error: error.message };
    }

    return { op: "add", success: true, todo: data };
  }

  async function executeUpdate(
    operation: z.infer<typeof updateOperationSchema>,
  ): Promise<TodoOperationResult> {
    const updates = Object.fromEntries(
      Object.entries({
        title: operation.title,
        payload: operation.payload,
      }).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(updates).length === 0) {
      return { op: "update", success: false, error: "No fields to update" };
    }

    const { data, error } = await supabase
      .from("agent_todo")
      .update(updates)
      .eq("id", operation.todo_id)
      .eq("client_id", clientId)
      .eq("thread_id", threadId)
      .select()
      .single();

    if (error) {
      return { op: "update", success: false, error: error.message };
    }

    return { op: "update", success: true, todo: data };
  }

  async function executeDelete(
    operation: z.infer<typeof deleteOperationSchema>,
  ): Promise<TodoOperationResult> {
    const { error } = await supabase
      .from("agent_todo")
      .delete()
      .eq("id", operation.todo_id)
      .eq("client_id", clientId)
      .eq("thread_id", threadId);

    if (error) {
      return { op: "delete", success: false, error: error.message };
    }

    return { op: "delete", success: true, todo_id: operation.todo_id };
  }

  async function executeOperation(operation: TodoOperation): Promise<TodoOperationResult> {
    switch (operation.op) {
      case "add":
        return executeAdd(operation);
      case "update":
        return executeUpdate(operation);
      case "delete":
        return executeDelete(operation);
    }
  }

  const manage_todo = tool({
    description:
      "Manage thread-scoped scratchpad todos. " +
      "Supports add, update, and delete operations in one call.",
    inputSchema: z.object({
      operations: z
        .array(todoOperationSchema)
        .min(1)
        .max(20)
        .describe("Batch of add/update/delete operations. Each operation runs independently."),
    }),
    execute: async ({ operations }) => {
      const results: TodoOperationResult[] = [];
      for (const operation of operations) {
        results.push(await executeOperation(operation));
      }
      return { success: true as const, results };
    },
  });

  const list_todo = tool({
    description: "List open todos for the current thread.",
    inputSchema: z.object({
      ids: z.array(z.string().uuid()).optional().describe("Optional list of todo UUIDs to include."),
    }),
    execute: async ({ ids }) => {
      let query = supabase
        .from("agent_todo")
        .select("*")
        .eq("thread_id", threadId)
        .eq("client_id", clientId)
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
  });

  return {
    manage_todo,
    list_todo,
  };
}
