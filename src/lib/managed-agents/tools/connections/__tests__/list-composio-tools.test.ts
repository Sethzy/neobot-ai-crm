import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRawComposioToolsMock,
} = vi.hoisted(() => ({
  getRawComposioToolsMock: vi.fn(),
}));

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(() => ({
    tools: {
      getRawComposioTools: getRawComposioToolsMock,
    },
    connectedAccounts: {},
  })),
  COMPOSIO_TOOL_FETCH_LIMIT: 200,
}));

import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { listComposioToolsTool } from "../list-composio-tools";

function makeContext(client: ReturnType<typeof createMockSupabase>["client"]): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: "client-1",
    threadId: "t-1",
    isChatContext: true,
  };
}

describe("listComposioToolsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tools for an app when an active connection exists", async () => {
    getRawComposioToolsMock.mockResolvedValueOnce([
      { slug: "GMAIL_SEND_EMAIL", name: "Send Gmail", description: "Send an email" },
    ]);

    const { client, builders } = createMockSupabase({
      connections: {
        data: [{ id: "conn-1", toolkit_slug: "gmail", status: "active" }],
        error: null,
      },
    });

    const result = await listComposioToolsTool.execute({ app: "gmail" }, makeContext(client));

    expect(builders.connections.eq).toHaveBeenCalledWith("client_id", "client-1");
    expect(getRawComposioToolsMock).toHaveBeenCalledWith({
      toolkits: ["gmail"],
      limit: 200,
    });
    expect(result).toEqual({
      success: true,
      app: "gmail",
      tools: [
        { slug: "GMAIL_SEND_EMAIL", name: "Send Gmail", description: "Send an email" },
      ],
    });
  });

  it("returns a clear error when no active connection exists", async () => {
    const { client } = createMockSupabase({
      connections: {
        data: null,
        error: null,
      },
    });

    const result = await listComposioToolsTool.execute({ app: "gmail" }, makeContext(client));

    expect(getRawComposioToolsMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: "No active gmail connection found. Create or re-authorize the connection first.",
    });
  });

  it("propagates Composio SDK errors", async () => {
    getRawComposioToolsMock.mockRejectedValueOnce(new Error("tool lookup failed"));

    const { client } = createMockSupabase({
      connections: {
        data: [{ id: "conn-1", toolkit_slug: "gmail", status: "active" }],
        error: null,
      },
    });

    const result = await listComposioToolsTool.execute({ app: "gmail" }, makeContext(client));

    expect(result).toEqual({
      success: false,
      error: "tool lookup failed",
    });
  });
});
