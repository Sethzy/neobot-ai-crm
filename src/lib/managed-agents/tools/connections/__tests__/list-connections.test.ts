import { describe, expect, it } from "vitest";

import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { listConnectionsTool } from "../list-connections";

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

describe("listConnectionsTool", () => {
  it("lists all connections with an explicit client_id filter", async () => {
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
            tool_count: 45,
          },
        ],
        error: null,
      },
    });

    const result = await listConnectionsTool.execute({}, makeContext(client));

    expect(result).toEqual({
      success: true,
      connections: [
        {
          connectionId: "11111111-1111-4111-8111-111111111111",
          toolkitSlug: "gmail",
          serviceName: "gmail",
          displayName: "Gmail",
          description: "Gmail",
          accountName: "user@gmail.com",
          status: "active",
        },
      ],
    });
    expect(builders.connections.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("does not include activated-tool counts in the response", async () => {
    const { client } = createMockSupabase({
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
            tool_count: 45,
          },
        ],
        error: null,
      },
    });

    const result = await listConnectionsTool.execute({}, makeContext(client));

    expect(result).toMatchObject({
      success: true,
      connections: [
        expect.objectContaining({
          toolkitSlug: "gmail",
          serviceName: "gmail",
          displayName: "Gmail",
          status: "active",
        }),
      ],
    });
    if (!result.success) {
      throw new Error("Expected list_connections to succeed.");
    }
    expect(result.connections[0]).not.toHaveProperty("activatedToolCount");
    expect(result.connections[0]).not.toHaveProperty("totalToolCount");
  });
});
