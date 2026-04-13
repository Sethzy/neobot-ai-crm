import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
  COMPOSIO_TOOL_FETCH_LIMIT: 200,
}));

import { getComposio } from "@/lib/composio/client";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { manageActivatedToolsForConnectionsTool } from "../manage-activated-tools";

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

describe("manageActivatedToolsForConnectionsTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("activates and deactivates tools with an explicit client_id filter", async () => {
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn().mockResolvedValue([
          { slug: "GMAIL_SEND_EMAIL", name: "Send Email" },
          { slug: "GMAIL_READ_EMAIL", name: "Read Email" },
        ]),
      },
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
            tool_count: 2,
          },
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
    });

    const result = await manageActivatedToolsForConnectionsTool.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_READ_EMAIL"],
            deactivate: ["GMAIL_SEND_EMAIL"],
          },
        ],
      },
      makeContext(client),
    );

    expect(builderHistory.connections[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.connections[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result).toEqual({
      success: true,
      connections: [
        {
          connectionId: "conn-1",
          userAction: "approved",
          tools: {
            activated: ["GMAIL_READ_EMAIL"],
            deactivated: ["GMAIL_SEND_EMAIL"],
          },
          skills: undefined,
        },
      ],
    });
  });
});
