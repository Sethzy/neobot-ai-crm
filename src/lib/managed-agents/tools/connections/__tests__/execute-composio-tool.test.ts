import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeMock,
  toolkitsGetMock,
} = vi.hoisted(() => ({
  executeMock: vi.fn(),
  toolkitsGetMock: vi.fn(),
}));

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(() => ({
    tools: {
      execute: executeMock,
    },
    toolkits: {
      get: toolkitsGetMock,
    },
    connectedAccounts: {},
  })),
}));

import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { executeComposioToolTool, _resetToolkitVersionCache } from "../execute-composio-tool";

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
    _resetToolkitVersionCache();
  });

  it("executes a composio action for an active connection with resolved version", async () => {
    toolkitsGetMock.mockResolvedValueOnce({
      meta: { availableVersions: ["13042026_00", "01042026_00"] },
    });
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
    expect(toolkitsGetMock).toHaveBeenCalledWith("gmail");
    expect(executeMock).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      userId: "client-1",
      arguments: { to: "user@example.com" },
      version: "13042026_00",
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
    toolkitsGetMock.mockResolvedValueOnce({
      meta: { availableVersions: ["13042026_00"] },
    });
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

  it("returns error when toolkit has no available versions", async () => {
    toolkitsGetMock.mockResolvedValueOnce({
      meta: { availableVersions: [] },
    });

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

    expect(executeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: 'No available versions found for toolkit "gmail".',
    });
  });
});
