import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { deleteConnectionTool } from "../delete-connection";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeContext(client: ReturnType<typeof createMockSupabase>["client"]): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("deleteConnectionTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deletes both the Composio account and the local row with an explicit client_id filter", async () => {
    const deleteRemote = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getComposio).mockReturnValue({
      connectedAccounts: { delete: deleteRemote },
    } as never);

    const { client, builderHistory } = createMockSupabase({
      connections: [
        {
          data: {
            id: "conn-1",
            client_id: CLIENT_ID,
            composio_connected_account_id: "composio-1",
            toolkit_slug: "gmail",
            display_name: "Gmail",
            account_identifier: "user@gmail.com",
            status: "active",
            activated_tools: ["GMAIL_SEND_EMAIL"],
            tool_count: 45,
          },
          error: null,
        },
        { data: null, error: null },
      ],
    });

    const result = await deleteConnectionTool.execute(
      { connectionId: "conn-1" },
      makeContext(client),
    );

    expect(deleteRemote).toHaveBeenCalledWith("composio-1");
    expect(builderHistory.connections[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.connections[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result).toEqual({
      success: true,
      connectionId: "conn-1",
      displayName: "Gmail",
      message: "Gmail connection permanently deleted.",
    });
  });

  it("description frames the tool as disconnecting a provider", () => {
    expect(deleteConnectionTool.description).toMatch(/disconnect|remove a provider/i);
    expect(deleteConnectionTool.description).not.toMatch(/manage_activated_tools/);
  });
});
