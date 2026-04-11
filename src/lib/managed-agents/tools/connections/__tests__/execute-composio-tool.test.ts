import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeMock,
} = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(() => ({
    tools: {
      execute: executeMock,
    },
    connectedAccounts: {},
  })),
}));

import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { executeComposioToolTool } from "../execute-composio-tool";

function makeContext(client: ReturnType<typeof createMockSupabase>["client"]): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: "client-1",
    threadId: "t-1",
    isChatContext: true,
  };
}

describe("executeComposioToolTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes a composio action for an active connection", async () => {
    executeMock.mockResolvedValueOnce({
      ok: true,
      payload: { userId: "client-1", arguments: { to: "user@example.com" } },
    });

    const { client, builders } = createMockSupabase({
      connections: {
        data: [{ id: "conn-1", toolkit_slug: "gmail", status: "active" }],
        error: null,
      },
    });

    const result = await executeComposioToolTool.execute(
      {
        app: "gmail",
        action: "GMAIL_SEND_EMAIL",
        input: { to: "user@example.com" },
      },
      makeContext(client),
    );

    expect(builders.connections.eq).toHaveBeenCalledWith("client_id", "client-1");
    expect(executeMock).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      userId: "client-1",
      arguments: { to: "user@example.com" },
    });
    expect(result).toEqual({
      success: true,
      app: "gmail",
      action: "GMAIL_SEND_EMAIL",
      result: {
        ok: true,
        payload: { userId: "client-1", arguments: { to: "user@example.com" } },
      },
    });
  });

  it("returns a clear error when no active connection exists", async () => {
    const { client } = createMockSupabase({
      connections: {
        data: null,
        error: null,
      },
    });

    const result = await executeComposioToolTool.execute(
      {
        app: "gmail",
        action: "GMAIL_SEND_EMAIL",
        input: { to: "user@example.com" },
      },
      makeContext(client),
    );

    expect(executeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: "No active gmail connection found. Create or re-authorize the connection first.",
    });
  });

  it("propagates Composio execution errors", async () => {
    executeMock.mockRejectedValueOnce(new Error("execution failed"));

    const { client } = createMockSupabase({
      connections: {
        data: [{ id: "conn-1", toolkit_slug: "gmail", status: "active" }],
        error: null,
      },
    });

    const result = await executeComposioToolTool.execute(
      {
        app: "gmail",
        action: "GMAIL_SEND_EMAIL",
        input: { to: "user@example.com" },
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "execution failed",
    });
  });
});
