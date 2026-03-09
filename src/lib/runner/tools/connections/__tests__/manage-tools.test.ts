/**
 * Tests for the manage_activated_tools_for_connections tool.
 * @module lib/runner/tools/connections/__tests__/manage-tools
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  getConnectionById: vi.fn(),
  updateConnectionActivatedTools: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import { getConnectionById, updateConnectionActivatedTools } from "@/lib/connections/queries";

import { createManageToolsTool } from "../manage-tools";

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
  tool_count: 3,
  created_at: "2026-03-07T00:00:00.000Z",
  updated_at: "2026-03-07T00:00:00.000Z",
};

const RAW_TOOLS = [
  { slug: "GMAIL_SEND_EMAIL", name: "Send Email" },
  { slug: "GMAIL_READ_EMAIL", name: "Read Email" },
  { slug: "GMAIL_DELETE_EMAIL", name: "Delete Email" },
];

function mockComposioCatalog() {
  const composio = {
    tools: {
      getRawComposioTools: vi.fn().mockResolvedValue(RAW_TOOLS),
    },
  };

  vi.mocked(getComposio).mockReturnValue(composio as never);

  return composio;
}

describe("createManageToolsTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("activates and deactivates tools per connection", async () => {
    mockComposioCatalog();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue({} as never);

    const { manage_activated_tools_for_connections } = createManageToolsTool(
      {} as never,
      CLIENT_ID,
    );
    const result = await manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_READ_EMAIL", "GMAIL_DELETE_EMAIL"],
            deactivate: ["GMAIL_SEND_EMAIL"],
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(updateConnectionActivatedTools).toHaveBeenCalledWith(
      {} as never,
      CLIENT_ID,
      "conn-1",
      ["GMAIL_READ_EMAIL", "GMAIL_DELETE_EMAIL"],
    );
    expect(result).toEqual({
      success: true,
      connections: [
        {
          connectionId: "conn-1",
          userAction: "approved",
          tools: {
            activated: ["GMAIL_READ_EMAIL", "GMAIL_DELETE_EMAIL"],
            deactivated: ["GMAIL_SEND_EMAIL"],
          },
          skills: undefined,
        },
      ],
    });
  });

  it("returns a skills pointer only on first activation", async () => {
    mockComposioCatalog();
    vi.mocked(getConnectionById).mockResolvedValue({
      ...MOCK_CONNECTION,
      activated_tools: [],
    } as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue({} as never);

    const { manage_activated_tools_for_connections } = createManageToolsTool(
      {} as never,
      CLIENT_ID,
    );
    const result = await manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_SEND_EMAIL"],
            deactivate: [],
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result.connections[0].skills).toContain("/agent/skills/connections/conn-1/SKILL.md");
    expect(result.connections[0].skills).toContain("not all connections have one");
  });

  it("returns a per-connection error when unknown tools are requested", async () => {
    mockComposioCatalog();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);

    const { manage_activated_tools_for_connections } = createManageToolsTool(
      {} as never,
      CLIENT_ID,
    );
    const result = await manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["NOT_A_REAL_TOOL"],
            deactivate: [],
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result.connections).toEqual([
      {
        connectionId: "conn-1",
        error: "Unknown tools: NOT_A_REAL_TOOL",
      },
    ]);
    expect(updateConnectionActivatedTools).not.toHaveBeenCalled();
  });

  it("returns a per-connection error when the connection is missing", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(null);

    const { manage_activated_tools_for_connections } = createManageToolsTool(
      {} as never,
      CLIENT_ID,
    );
    const result = await manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-missing",
            activate: [],
            deactivate: [],
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result.connections).toEqual([
      {
        connectionId: "conn-missing",
        error: "Connection not found.",
      },
    ]);
  });
});
