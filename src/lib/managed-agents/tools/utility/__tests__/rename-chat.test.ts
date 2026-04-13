import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { renameChatTool } from "../rename-chat";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("renameChatTool", () => {
  it("updates the thread title with the explicit client_id filter", async () => {
    const thread = { thread_id: "thread-1", client_id: CLIENT_ID, is_pinned: false, title: "New title" };
    const { client, builderHistory } = createMockSupabase({
      conversation_threads: [
        { data: thread, error: null },
        { data: thread, error: null },
      ],
    });

    const result = await renameChatTool.execute(
      { new_title: "New title" },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, title: "New title" });
    expect(builderHistory.conversation_threads[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.conversation_threads[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});
