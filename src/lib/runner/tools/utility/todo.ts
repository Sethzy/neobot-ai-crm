/**
 * Agent todo tools for scratchpad / notes-to-future-self.
 * @module lib/runner/tools/utility/todo
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

type TodoPayload = NonNullable<Database["public"]["Tables"]["agent_todo"]["Row"]["payload"]>;

const addOperationSchema = z.object({
  op: z.literal("add").describe("The operation to perform: add (create new todo, todo_id must NOT be set)"),
  title: z.string().min(1).describe("The title of the todo (required for add)"),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional JSON payload attached to the todo for additional information in addition to the title"),
});

const updateOperationSchema = z.object({
  op: z.literal("update").describe("The operation to perform: update (modify existing todo)"),
  todo_id: z.string().uuid().describe("The ID of the todo. REQUIRED for update operations."),
  title: z.string().min(1).optional().describe("The title of the todo (optional for update)"),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional JSON payload attached to the todo for additional information in addition to the title"),
});

const deleteOperationSchema = z.object({
  op: z.literal("delete").describe("The operation to perform: delete (remove todo to mark it as done)"),
  todo_id: z.string().uuid().describe("The ID of the todo. REQUIRED for delete operations. MUST NOT be set for add operation."),
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
    const payload = (operation.payload ?? {}) as TodoPayload;

    const { data, error } = await supabase
      .from("agent_todo")
      .insert({
        client_id: clientId,
        thread_id: threadId,
        title: operation.title,
        payload,
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
    const updates: Database["public"]["Tables"]["agent_todo"]["Update"] = {};

    if (operation.title !== undefined) {
      updates.title = operation.title;
    }

    if (operation.payload !== undefined) {
      updates.payload = operation.payload as TodoPayload;
    }

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
      "Manage todo items for this agent. Supports batch operations for efficiency.\n\nOperations:\n- add: Create a new todo with a title and optional payload. todo_id MUST NOT be set.\n- update: Modify an existing todo's title or payload. todo_id is REQUIRED.\n- delete: Remove a todo to mark it as done. todo_id is REQUIRED.\n\nYou can perform multiple operations in a single call (e.g., add multiple todos, update several at once, or mix different operations).\n\nNote: All current todos are visible in the agent's synced state.",
    inputSchema: z.object({
      operations: z
        .array(todoOperationSchema)
        .min(1)
        .max(20)
        .describe("Array of todo operations to perform. You can add, update, or delete multiple todos in a single call."),
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
    description: "List todos for this agent. Can optionally filter by specific todo IDs.",
    inputSchema: z.object({
      ids: z.array(z.string().uuid()).optional().describe("Optional array of todo IDs to filter. If not provided, returns all todos."),
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
