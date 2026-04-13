import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { listTodoTool } from "../list-todo";

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

describe("listTodoTool", () => {
  it("lists todos with client_id and thread_id filters", async () => {
    const todos = [{ id: "todo-1", title: "Follow up" }];
    const { client, builders } = createMockSupabase({
      agent_todo: { data: todos, error: null },
    });

    const result = await listTodoTool.execute({}, makeContext(client));

    expect(result).toEqual({ success: true, todos, count: 1 });
    expect(builders.agent_todo.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.agent_todo.eq).toHaveBeenCalledWith("thread_id", THREAD_ID);
  });
});
