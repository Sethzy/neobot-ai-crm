/**
 * Tests for the reauthorize_connection tool.
 * @module lib/runner/tools/connections/__tests__/reauthorize-connection
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  getConnectionById: vi.fn(),
  updateConnectionStatus: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import { getConnectionById, updateConnectionStatus } from "@/lib/connections/queries";

import { createReauthorizeConnectionTool } from "../reauthorize-connection";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

const MOCK_CONNECTION = {
  id: "conn-1",
  client_id: CLIENT_ID,
  composio_connected_account_id: "composio-1",
  toolkit_slug: "gmail",
  display_name: "Gmail",
  account_identifier: "user@gmail.com",
  status: "error",
  activated_tools: ["GMAIL_SEND_EMAIL"],
  tool_count: 45,
  created_at: "2026-03-07T00:00:00.000Z",
  updated_at: "2026-03-07T00:00:00.000Z",
};

describe("createReauthorizeConnectionTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.sunder.local";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  });

  it("marks the connection active when silent refresh succeeds", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionStatus).mockResolvedValue({} as never);
    vi.mocked(getComposio).mockReturnValue({
      connectedAccounts: {
        refresh: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
      },
    } as never);

    const { reauthorize_connection } = createReauthorizeConnectionTool({} as never, CLIENT_ID);
    const result = await reauthorize_connection.execute(
      { connectionId: "conn-1" },
      EXECUTION_OPTIONS,
    );

    expect(updateConnectionStatus).toHaveBeenCalledWith(
      {} as never,
      CLIENT_ID,
      "conn-1",
      "active",
    );
    expect(result).toEqual({
      success: true,
      connectionId: "conn-1",
      status: "reauthorized",
      message: expect.stringContaining("refreshed"),
    });
  });

  it("falls back to redirect-based reauth when silent refresh fails", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("Token expired"))
      .mockResolvedValueOnce({
        redirect_url: "https://composio.dev/oauth/reauth",
      });
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionStatus).mockResolvedValue({} as never);
    vi.mocked(getComposio).mockReturnValue({
      connectedAccounts: {
        refresh,
        get: vi.fn(),
      },
    } as never);

    const { reauthorize_connection } = createReauthorizeConnectionTool({} as never, CLIENT_ID);
    const result = await reauthorize_connection.execute(
      { connectionId: "conn-1" },
      EXECUTION_OPTIONS,
    );

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenLastCalledWith("composio-1", {
      redirectUrl: "https://app.sunder.local/api/connections/callback",
    });
    expect(updateConnectionStatus).toHaveBeenCalledWith(
      {} as never,
      CLIENT_ID,
      "conn-1",
      "pending",
    );
    expect(result).toEqual({
      success: true,
      connectionId: "conn-1",
      status: "pending_reauth",
      redirectUrl: "https://composio.dev/oauth/reauth",
      message: expect.stringContaining("re-authorization"),
    });
  });

  it("returns errors for missing or pending connections", async () => {
    vi.mocked(getConnectionById).mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...MOCK_CONNECTION,
      status: "pending",
    } as never);

    const { reauthorize_connection } = createReauthorizeConnectionTool({} as never, CLIENT_ID);

    await expect(
      reauthorize_connection.execute({ connectionId: "missing" }, EXECUTION_OPTIONS),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining("not found"),
    });

    await expect(
      reauthorize_connection.execute({ connectionId: "conn-1" }, EXECUTION_OPTIONS),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining("pending"),
    });
  });
});
