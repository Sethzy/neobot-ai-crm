/**
 * Tests for the list_users_connections tool.
 * @module lib/runner/tools/connections/__tests__/list-connections
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createListConnectionsTool } from "../list-connections";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

const MIXED_CONNECTIONS = [
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
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    client_id: CLIENT_ID,
    composio_connected_account_id: "composio-3",
    toolkit_slug: "googlecalendar",
    display_name: null,
    account_identifier: null,
    status: "error",
    activated_tools: [],
    tool_count: 20,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    client_id: CLIENT_ID,
    composio_connected_account_id: "composio-4",
    toolkit_slug: "notion",
    display_name: null,
    account_identifier: null,
    status: "pending",
    activated_tools: [],
    tool_count: 0,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    client_id: CLIENT_ID,
    composio_connected_account_id: "composio-2",
    toolkit_slug: "slack",
    display_name: "Slack",
    account_identifier: null,
    status: "inactive",
    activated_tools: [],
    tool_count: 30,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
];

describe("createListConnectionsTool", () => {
  it("returns an empty list when the client has no connections", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const { list_users_connections } = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await list_users_connections.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, connections: [] });
  });

  it("returns connections across all lifecycle statuses", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: MIXED_CONNECTIONS, error: null },
    });

    const { list_users_connections } = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await list_users_connections.execute({}, EXECUTION_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.connections.map((connection) => connection.status)).toEqual([
      "active",
      "error",
      "pending",
      "inactive",
    ]);
  });

  it("maps the response into the Tasklet-shaped connection summary", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MIXED_CONNECTIONS[0]], error: null },
    });

    const { list_users_connections } = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await list_users_connections.execute({}, EXECUTION_OPTIONS);

    expect(result.connections[0]).toEqual({
      connectionId: "11111111-1111-4111-8111-111111111111",
      serviceName: "gmail",
      description: "Gmail",
      accountName: "user@gmail.com",
      connectionType: "integrations",
      status: "active",
      activatedToolCount: 1,
      totalToolCount: 45,
    });
  });

  it("falls back to display name and toolkit slug when account details are missing", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MIXED_CONNECTIONS[3], MIXED_CONNECTIONS[1]], error: null },
    });

    const { list_users_connections } = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await list_users_connections.execute({}, EXECUTION_OPTIONS);

    expect(result.connections[0].accountName).toBe("Slack");
    expect(result.connections[1].description).toBe("googlecalendar");
    expect(result.connections[1].accountName).toBe("googlecalendar");
  });
});
