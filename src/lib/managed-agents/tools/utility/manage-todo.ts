/**
 * manage_todo tool for managed agents.
 *
 * @module lib/managed-agents/tools/utility/manage-todo
 */
import { z } from "zod";

import type { Database } from "@/types/database";

import type { ManagedAgentTool } from "../types";

type TodoPayload = NonNullable<Database["public"]["Tables"]["agent_todo"]["Row"]["payload"]>;

const addOperationSchema = z.object({
  op: z.literal("add").describe("The operation to perform: add (create new todo, todo_id must NOT be set)"),
  title: z.string().min(1).describe("The title of the todo (required for add)"),
  payload: z.record(z.string(), z.unknown()).optional().describe("Optional JSON payload attached to the todo for additional information in addition to the title"),
});

const updateOperationSchema = z.object({
  op: z.literal("update").describe("The operation to perform: update (modify existing todo)"),
  todo_id: z.string().uuid().describe("The ID of the todo. REQUIRED for update operations."),
  title: z.string().min(1).optional().describe("The title of the todo (optional for update)"),
  payload: z.record(z.string(), z.unknown()).optional().describe("Optional JSON payload attached to the todo for additional information in addition to the title"),
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

const inputSchema = z.object({
  operations: z.array(todoOperationSchema).min(1).max(20).describe("Array of todo operations to perform. You can add, update, or delete multiple todos in a single call."),
});

type ManageTodoInput = z.infer<typeof inputSchema>;

export const manageTodoTool: ManagedAgentTool<ManageTodoInput> = {
  name: "manage_todo",
  description:
    "Manage todo items for this agent. Supports batch operations for efficiency.\n\nOperations:\n- add: Create a new todo with a title and optional payload. todo_id MUST NOT be set.\n- update: Modify an existing todo's title or payload. todo_id is REQUIRED.\n- delete: Remove a todo to mark it as done. todo_id is REQUIRED.\n\nYou can perform multiple operations in a single call (e.g., add multiple todos, update several at once, or mix different operations).\n\nNote: All current todos are visible in the agent's synced state.",
  inputSchema,
  execute: async ({ operations }, context) => {
    if (!context.threadId) {
      return { success: false as const, error: "Thread ID is required" };
    }
    const threadId = context.threadId;

    async function executeAdd(operation: z.infer<typeof addOperationSchema>): Promise<TodoOperationResult> {
      const payload = (operation.payload ?? {}) as TodoPayload;

      const { data, error } = await context.supabase
        .from("agent_todo")
        .insert({
          client_id: context.clientId,
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

    async function executeUpdate(operation: z.infer<typeof updateOperationSchema>): Promise<TodoOperationResult> {
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

      const { data, error } = await context.supabase
        .from("agent_todo")
        .update(updates)
        .eq("id", operation.todo_id)
        .eq("client_id", context.clientId)
        .eq("thread_id", threadId)
        .select()
        .single();

      if (error) {
        return { op: "update", success: false, error: error.message };
      }

      return { op: "update", success: true, todo: data };
    }

    async function executeDelete(operation: z.infer<typeof deleteOperationSchema>): Promise<TodoOperationResult> {
      const { error } = await context.supabase
        .from("agent_todo")
        .delete()
        .eq("id", operation.todo_id)
        .eq("client_id", context.clientId)
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

    const results: TodoOperationResult[] = [];
    for (const operation of operations) {
      results.push(await executeOperation(operation));
    }

    return { success: true as const, results };
  },
};
