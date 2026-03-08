/**
 * Tests for the get_details_for_connections tool.
 * @module lib/runner/tools/connections/__tests__/get-connection-details
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createGetConnectionDetailsTool } from "../get-connection-details";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

const MOCK_CONNECTION = {
  id: "11111111-1111-4111-8111-111111111111",
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

const MOCK_RAW_TOOLS = [
  {
    slug: "GMAIL_SEND_EMAIL",
    name: "Send Email",
    description: "Send an email via Gmail",
    inputParameters: { to: { type: "string" } },
    toolkit: { slug: "gmail", name: "Gmail" },
  },
  {
    slug: "GMAIL_READ_EMAIL",
    name: "Read Email",
    description: "Read emails from Gmail",
    inputParameters: { query: { type: "string" } },
    toolkit: { slug: "gmail", name: "Gmail" },
  },
  {
    slug: "GMAIL_DELETE_EMAIL",
    name: "Delete Email",
    description: "Delete an email",
    inputParameters: { id: { type: "string" } },
    toolkit: { slug: "gmail", name: "Gmail" },
  },
];

function mockComposioCatalog() {
  const composio = {
    tools: {
      getRawComposioTools: vi.fn().mockResolvedValue(MOCK_RAW_TOOLS),
    },
  };

  vi.mocked(getComposio).mockReturnValue(composio as never);

  return composio;
}

describe("createGetConnectionDetailsTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns activated and deactivated tool groups for each connection", async () => {
    const composio = mockComposioCatalog();
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MOCK_CONNECTION], error: null },
    });

    const { get_details_for_connections } = createGetConnectionDetailsTool(
      supabase as never,
      CLIENT_ID,
    );
    const result = await get_details_for_connections.execute(
      {
        connectionIds: ["11111111-1111-4111-8111-111111111111"],
        includeToolDetails: false,
      },
      EXECUTION_OPTIONS,
    );

    expect(composio.tools.getRawComposioTools).toHaveBeenCalledWith({
      toolkits: ["gmail"],
    });
    expect(result.success).toBe(true);
    expect(result.connections[0].tools.activated).toEqual([
      { slug: "GMAIL_SEND_EMAIL", name: "Send Email" },
    ]);
    expect(result.connections[0].tools.deactivated).toEqual([
      { slug: "GMAIL_READ_EMAIL", name: "Read Email" },
      { slug: "GMAIL_DELETE_EMAIL", name: "Delete Email" },
    ]);
  });

  it("includes detailed tool metadata when requested", async () => {
    mockComposioCatalog();
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MOCK_CONNECTION], error: null },
    });

    const { get_details_for_connections } = createGetConnectionDetailsTool(
      supabase as never,
      CLIENT_ID,
    );
    const result = await get_details_for_connections.execute(
      {
        connectionIds: ["11111111-1111-4111-8111-111111111111"],
        includeToolDetails: true,
      },
      EXECUTION_OPTIONS,
    );

    expect(result.connections[0].tools.activated[0]).toEqual({
      slug: "GMAIL_SEND_EMAIL",
      name: "Send Email",
      description: "Send an email via Gmail",
      arguments: { to: { type: "string" } },
    });
  });

  it("returns connection metadata with the derived tool count", async () => {
    mockComposioCatalog();
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MOCK_CONNECTION], error: null },
    });

    const { get_details_for_connections } = createGetConnectionDetailsTool(
      supabase as never,
      CLIENT_ID,
    );
    const result = await get_details_for_connections.execute(
      {
        connectionIds: ["11111111-1111-4111-8111-111111111111"],
        includeToolDetails: false,
      },
      EXECUTION_OPTIONS,
    );

    expect(result.connections[0]).toMatchObject({
      connectionId: "11111111-1111-4111-8111-111111111111",
      serviceName: "gmail",
      description: "Gmail",
      accountName: "user@gmail.com",
      connectionType: "integrations",
      status: "active",
      toolCount: 3,
    });
  });

  it("handles a connection with zero activated tools", async () => {
    mockComposioCatalog();
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            ...MOCK_CONNECTION,
            id: "22222222-2222-4222-8222-222222222222",
            activated_tools: [],
          },
        ],
        error: null,
      },
    });

    const { get_details_for_connections } = createGetConnectionDetailsTool(
      supabase as never,
      CLIENT_ID,
    );
    const result = await get_details_for_connections.execute(
      {
        connectionIds: ["22222222-2222-4222-8222-222222222222"],
        includeToolDetails: false,
      },
      EXECUTION_OPTIONS,
    );

    expect(result.connections[0].tools.activated).toEqual([]);
    expect(result.connections[0].tools.deactivated).toHaveLength(3);
  });
});
