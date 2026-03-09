/**
 * Tests for the delete_connection tool.
 * @module lib/runner/tools/connections/__tests__/delete-connection
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  deleteConnection: vi.fn(),
  getConnectionById: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import { deleteConnection, getConnectionById } from "@/lib/connections/queries";

import { createDeleteConnectionTool } from "../delete-connection";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

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
  status: "active",
  activated_tools: ["GMAIL_SEND_EMAIL"],
  tool_count: 45,
  created_at: "2026-03-07T00:00:00.000Z",
  updated_at: "2026-03-07T00:00:00.000Z",
};

describe("createDeleteConnectionTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("has needsApproval set to true", () => {
    const { delete_connection } = createDeleteConnectionTool({} as never, CLIENT_ID);

    expect(delete_connection).toHaveProperty("needsApproval", true);
  });

  it("deletes both the Composio account and the local row", async () => {
    const deleteRemote = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(deleteConnection).mockResolvedValue(undefined);
    vi.mocked(getComposio).mockReturnValue({
      connectedAccounts: {
        delete: deleteRemote,
      },
    } as never);

    const { delete_connection } = createDeleteConnectionTool({} as never, CLIENT_ID);
    const result = await delete_connection.execute(
      { connectionId: "conn-1" },
      EXECUTION_OPTIONS,
    );

    expect(deleteRemote).toHaveBeenCalledWith("composio-1");
    expect(deleteConnection).toHaveBeenCalledWith({} as never, CLIENT_ID, "conn-1");
    expect(result).toEqual({
      success: true,
      connectionId: "conn-1",
      message: "Connection to gmail permanently deleted.",
    });
  });

  it("still deletes the local row if Composio deletion fails", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(deleteConnection).mockResolvedValue(undefined);
    vi.mocked(getComposio).mockReturnValue({
      connectedAccounts: {
        delete: vi.fn().mockRejectedValue(new Error("Composio timeout")),
      },
    } as never);

    const { delete_connection } = createDeleteConnectionTool({} as never, CLIENT_ID);
    const result = await delete_connection.execute(
      { connectionId: "conn-1" },
      EXECUTION_OPTIONS,
    );

    expect(deleteConnection).toHaveBeenCalledWith({} as never, CLIENT_ID, "conn-1");
    expect(result.success).toBe(true);
  });

  it("returns an error when the connection does not exist", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(null);

    const { delete_connection } = createDeleteConnectionTool({} as never, CLIENT_ID);
    const result = await delete_connection.execute(
      { connectionId: "missing" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Connection not found.",
    });
  });
});
