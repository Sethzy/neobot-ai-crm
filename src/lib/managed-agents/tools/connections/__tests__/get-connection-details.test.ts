import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
  COMPOSIO_TOOL_FETCH_LIMIT: 200,
}));

import { getComposio } from "@/lib/composio/client";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { getConnectionDetailsTool } from "../get-connection-details";

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

describe("getConnectionDetailsTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns activated and deactivated tool groups with an explicit client_id filter", async () => {
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn().mockResolvedValue([
          {
            slug: "GMAIL_SEND_EMAIL",
            name: "Send Email",
            description: "Send an email via Gmail",
            inputParameters: { to: { type: "string" } },
          },
          {
            slug: "GMAIL_READ_EMAIL",
            name: "Read Email",
            description: "Read emails from Gmail",
            inputParameters: { query: { type: "string" } },
          },
        ]),
      },
    } as never);

    const { client, builders } = createMockSupabase({
      connections: {
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            client_id: CLIENT_ID,
            composio_connected_account_id: "composio-1",
            toolkit_slug: "gmail",
            display_name: "Gmail",
            account_identifier: "user@gmail.com",
            status: "active",
            activated_tools: ["GMAIL_SEND_EMAIL"],
            tool_count: 2,
          },
        ],
        error: null,
      },
    });

    const result = await getConnectionDetailsTool.execute(
      {
        connectionIds: ["11111111-1111-4111-8111-111111111111"],
        includeToolDetails: false,
      },
      makeContext(client),
    );

    expect(builders.connections.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result).toMatchObject({
      success: true,
      connections: [
        {
          connectionId: "11111111-1111-4111-8111-111111111111",
          tools: {
            activated: [{ slug: "GMAIL_SEND_EMAIL", name: "Send Email" }],
            deactivated: [{ slug: "GMAIL_READ_EMAIL", name: "Read Email" }],
          },
        },
      ],
    });
  });
});
