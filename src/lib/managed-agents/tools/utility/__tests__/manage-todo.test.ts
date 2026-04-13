import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { manageTodoTool } from "../manage-todo";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "thread-1";

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: THREAD_ID,
    isChatContext: true,
  };
}

describe("manageTodoTool", () => {
  it("adds a todo scoped to the current thread", async () => {
    const todo = { id: "todo-1", title: "Follow up", client_id: CLIENT_ID, thread_id: THREAD_ID };
    const { client, builders } = createMockSupabase({
      agent_todo: { data: todo, error: null },
    });

    const result = await manageTodoTool.execute(
      { operations: [{ op: "add", title: "Follow up" }] },
      makeContext(client),
    );

    expect(result).toEqual({
      success: true,
      results: [{ op: "add", success: true, todo }],
    });
    expect(builders.agent_todo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, thread_id: THREAD_ID, title: "Follow up" }),
    );
  });

  it("updates a todo with client_id and thread_id filters", async () => {
    const todo = { id: "todo-1", title: "Updated", client_id: CLIENT_ID, thread_id: THREAD_ID };
    const { client, builders } = createMockSupabase({
      agent_todo: { data: todo, error: null },
    });

    await manageTodoTool.execute(
      { operations: [{ op: "update", todo_id: "todo-1", title: "Updated" }] },
      makeContext(client),
    );

    expect(builders.agent_todo.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.agent_todo.eq).toHaveBeenCalledWith("thread_id", THREAD_ID);
  });
});
