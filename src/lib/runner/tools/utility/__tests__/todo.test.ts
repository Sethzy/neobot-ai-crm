/**
 * Tests for agent todo tools (manage_todo, list_todo).
 * @module lib/runner/tools/utility/__tests__/todo
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createTodoTools } from "../todo";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined,
} as never;

describe("createTodoTools", () => {
  it("returns manage_todo and list_todo tools", () => {
    const supabase = createMockSupabaseClient();
    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);

    expect(tools).toHaveProperty("manage_todo");
    expect(tools).toHaveProperty("list_todo");
    expect(tools.manage_todo).toHaveProperty("execute");
    expect(tools.list_todo).toHaveProperty("execute");
  });
});

describe("list_todo", () => {
  let supabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns todos for the current thread", async () => {
    const mockTodos = [
      {
        id: "550e8400-e29b-41d4-a716-446655440111",
        client_id: CLIENT_ID,
        thread_id: THREAD_ID,
        title: "Follow up with John",
        payload: {},
        created_at: "2026-03-05T10:00:00Z",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440112",
        client_id: CLIENT_ID,
        thread_id: THREAD_ID,
        title: "Check market data",
        payload: { note: "urgent" },
        created_at: "2026-03-05T10:01:00Z",
      },
    ];

    supabase = createMockSupabaseClient({
      selectResult: { data: mockTodos, error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.list_todo.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: true,
      todos: mockTodos,
      count: 2,
    });
    expect(supabase.calls.from).toContain("agent_todo");
  });

  it("filters todos by ids when provided", async () => {
    supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);

    await tools.list_todo.execute(
      {
        ids: [
          "550e8400-e29b-41d4-a716-446655440211",
          "550e8400-e29b-41d4-a716-446655440212",
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(supabase.calls.methods).toContainEqual({
      method: "in",
      args: [
        "id",
        [
          "550e8400-e29b-41d4-a716-446655440211",
          "550e8400-e29b-41d4-a716-446655440212",
        ],
      ],
    });
  });

  it("returns empty array when no todos exist", async () => {
    supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.list_todo.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: true,
      todos: [],
      count: 0,
    });
  });

  it("returns error on query failure", async () => {
    supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "connection refused" } },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.list_todo.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "connection refused",
    });
  });
});

describe("manage_todo", () => {
  let supabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a todo with title only", async () => {
    const inserted = {
      id: "550e8400-e29b-41d4-a716-446655440311",
      client_id: CLIENT_ID,
      thread_id: THREAD_ID,
      title: "Draft email",
      payload: {},
      created_at: "2026-03-05T12:00:00Z",
    };

    supabase = createMockSupabaseClient({
      insertResult: { data: [inserted], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      { operations: [{ op: "add", title: "Draft email" }] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [{ op: "add", success: true, todo: inserted }],
    });
  });

  it("updates a todo by id", async () => {
    const updated = {
      id: "550e8400-e29b-41d4-a716-446655440312",
      client_id: CLIENT_ID,
      thread_id: THREAD_ID,
      title: "Updated title",
      payload: { priority: "high" },
      created_at: "2026-03-05T12:00:00Z",
    };

    supabase = createMockSupabaseClient({
      updateResult: { data: [updated], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      {
        operations: [
          {
            op: "update",
            todo_id: "550e8400-e29b-41d4-a716-446655440312",
            title: "Updated title",
            payload: { priority: "high" },
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [{ op: "update", success: true, todo: updated }],
    });
  });

  it("returns error when update has no fields", async () => {
    supabase = createMockSupabaseClient({
      updateResult: { data: [], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      {
        operations: [
          {
            op: "update",
            todo_id: "550e8400-e29b-41d4-a716-446655440313",
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [{ op: "update", success: false, error: "No fields to update" }],
    });
  });

  it("deletes a todo by id", async () => {
    supabase = createMockSupabaseClient({
      deleteResult: { data: [{ id: "550e8400-e29b-41d4-a716-446655440314" }], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      {
        operations: [
          { op: "delete", todo_id: "550e8400-e29b-41d4-a716-446655440314" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [
        {
          op: "delete",
          success: true,
          todo_id: "550e8400-e29b-41d4-a716-446655440314",
        },
      ],
    });
  });

  it("scopes delete operation by thread_id", async () => {
    supabase = createMockSupabaseClient({
      deleteResult: { data: [], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);

    await tools.manage_todo.execute(
      {
        operations: [
          { op: "delete", todo_id: "550e8400-e29b-41d4-a716-446655440315" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["thread_id", THREAD_ID],
    });
  });

  it("scopes update operation by thread_id", async () => {
    supabase = createMockSupabaseClient({
      updateResult: { data: [{ id: "550e8400-e29b-41d4-a716-446655440316" }], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);

    await tools.manage_todo.execute(
      {
        operations: [
          {
            op: "update",
            todo_id: "550e8400-e29b-41d4-a716-446655440316",
            title: "Scoped update",
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["thread_id", THREAD_ID],
    });
  });

  it("handles batch operations (add + delete in one call)", async () => {
    const inserted = {
      id: "550e8400-e29b-41d4-a716-446655440317",
      client_id: CLIENT_ID,
      thread_id: THREAD_ID,
      title: "New task",
      payload: {},
      created_at: "2026-03-05T12:00:00Z",
    };

    supabase = createMockSupabaseClient({
      insertResult: { data: [inserted], error: null },
      deleteResult: { data: [{ id: "550e8400-e29b-41d4-a716-446655440318" }], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      {
        operations: [
          { op: "add", title: "New task" },
          { op: "delete", todo_id: "550e8400-e29b-41d4-a716-446655440318" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ op: "add", success: true, todo: inserted });
    expect(result.results[1]).toEqual({
      op: "delete",
      success: true,
      todo_id: "550e8400-e29b-41d4-a716-446655440318",
    });
  });

  it("reports per-operation errors without failing the batch", async () => {
    supabase = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      { operations: [{ op: "add", title: "Will fail" }] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [{ op: "add", success: false, error: "insert failed" }],
    });
  });
});
