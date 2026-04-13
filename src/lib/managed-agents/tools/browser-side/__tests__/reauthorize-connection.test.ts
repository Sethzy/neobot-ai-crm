import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { reauthorizeConnectionTool } from "../reauthorize-connection";

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

describe("reauthorizeConnectionTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.sunder.local");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("marks the connection active when silent refresh succeeds", async () => {
    vi.mocked(getComposio).mockReturnValue({
      connectedAccounts: {
        refresh: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
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
            status: "error",
          },
          error: null,
        },
        { data: null, error: null },
      ],
    });

    const result = await reauthorizeConnectionTool.execute(
      { connectionId: "conn-1" },
      makeContext(client),
    );

    expect(builderHistory.connections[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.connections[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result).toEqual({
      success: true,
      connectionId: "conn-1",
      status: "reauthorized",
      message: "Connection credentials refreshed successfully.",
    });
  });

  it("falls back to redirect-based reauth when silent refresh fails", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("Token expired"))
      .mockResolvedValueOnce({ redirect_url: "https://composio.dev/oauth/reauth" });

    vi.mocked(getComposio).mockReturnValue({
      connectedAccounts: {
        refresh,
        get: vi.fn(),
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
            status: "error",
          },
          error: null,
        },
        { data: null, error: null },
      ],
    });

    const result = await reauthorizeConnectionTool.execute(
      { connectionId: "conn-1" },
      makeContext(client),
    );

    expect(builderHistory.connections[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.connections[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result).toMatchObject({
      success: true,
      connectionId: "conn-1",
      status: "pending_reauth",
      redirectUrl: "https://composio.dev/oauth/reauth",
    });
  });
});
