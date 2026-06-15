/**
 * Tests for connection persistence queries.
 * @module lib/connections/__tests__/queries
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  deleteConnection,
  getActiveConnectionByToolkit,
  getActiveConnections,
  getActiveConnectionsByToolkit,
  getConnectionByToolkit,
  getConnectionByConnectedAccountId,
  getActiveToolkitSlugs,
  getAllConnections,
  getConnectionById,
  getConnectionsByIds,
  getPendingConnectionByToolkit,
  insertConnection,
  updateConnection,
  updateConnectionActivatedTools,
  updateConnectionStatus,
} from "../queries";

const ACTIVE_CONNECTIONS = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_123abc",
    toolkit_slug: "gmail",
    display_name: "Gmail",
    account_identifier: "user@gmail.com",
    status: "active",
    activated_tools: ["GMAIL_SEND_EMAIL"],
    auth_redirect_url: null,
    auth_redirect_expires_at: null,
    tool_count: 45,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "770e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_456def",
    toolkit_slug: "googlecalendar",
    display_name: "Google Calendar",
    account_identifier: null,
    status: "active",
    activated_tools: [],
    auth_redirect_url: null,
    auth_redirect_expires_at: null,
    tool_count: 20,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
] as const;

describe("getActiveConnections", () => {
  it("returns parsed active connections for a client", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: ACTIVE_CONNECTIONS, error: null },
    });

    const result = await getActiveConnections(
      supabase as never,
      "660e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS);
    expect(supabase.calls.from).toEqual(["connections"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", ACTIVE_CONNECTIONS[0].client_id],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["status", "active"],
    });
  });

  it("throws when the active-connections query fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "db is down" } },
    });

    await expect(
      getActiveConnections(supabase as never, ACTIVE_CONNECTIONS[0].client_id),
    ).rejects.toThrow("Failed to load active connections: db is down");
  });

  it("throws when Supabase returns an invalid connection row", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ ...ACTIVE_CONNECTIONS[0], toolkit_slug: null }],
        error: null,
      },
    });

    await expect(
      getActiveConnections(supabase as never, ACTIVE_CONNECTIONS[0].client_id),
    ).rejects.toThrow();
  });
});

describe("getActiveConnectionByToolkit", () => {
  it("returns one parsed active connection for a toolkit", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    const result = await getActiveConnectionByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].toolkit_slug,
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["toolkit_slug", ACTIVE_CONNECTIONS[0].toolkit_slug],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: true }],
    });
    expect(supabase.calls.methods).toContainEqual({ method: "limit", args: [1] });
    expect(supabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("uses deterministic ordering when multiple active rows exist", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          ACTIVE_CONNECTIONS[0],
          {
            ...ACTIVE_CONNECTIONS[0],
            id: "880e8400-e29b-41d4-a716-446655440000",
            composio_connected_account_id: "conn_789ghi",
          },
        ],
        error: null,
      },
    });

    const result = await getActiveConnectionByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].toolkit_slug,
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.methods).toContainEqual({ method: "limit", args: [1] });
  });

  it("returns null when no active connection exists", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(
      getActiveConnectionByToolkit(
        supabase as never,
        ACTIVE_CONNECTIONS[0].client_id,
        "slack",
      ),
    ).resolves.toBeNull();
  });

  it("throws when the single-toolkit lookup fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "boom" } },
    });

    await expect(
      getActiveConnectionByToolkit(
        supabase as never,
        ACTIVE_CONNECTIONS[0].client_id,
        ACTIVE_CONNECTIONS[0].toolkit_slug,
      ),
    ).rejects.toThrow("Failed to load active connection for gmail: boom");
  });

  it("throws when the single-toolkit row shape is invalid", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ ...ACTIVE_CONNECTIONS[0], status: "broken" }],
        error: null,
      },
    });

    await expect(
      getActiveConnectionByToolkit(
        supabase as never,
        ACTIVE_CONNECTIONS[0].client_id,
        ACTIVE_CONNECTIONS[0].toolkit_slug,
      ),
    ).rejects.toThrow();
  });
});

describe("getConnectionByToolkit", () => {
  it("returns one parsed connection for a toolkit regardless of status", async () => {
    const inactiveConnection = {
      ...ACTIVE_CONNECTIONS[0],
      status: "inactive" as const,
    };
    const supabase = createMockSupabaseClient({
      selectResult: { data: [inactiveConnection], error: null },
    });

    const result = await getConnectionByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].toolkit_slug,
    );

    expect(result).toEqual(inactiveConnection);
    const statusFilters = supabase.calls.methods.filter(
      (call) => call.method === "eq" && call.args[0] === "status",
    );
    expect(statusFilters).toHaveLength(0);
    expect(supabase.calls.methods).toContainEqual({ method: "limit", args: [1] });
    expect(supabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("returns null when no connection exists for the toolkit", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(
      getConnectionByToolkit(
        supabase as never,
        ACTIVE_CONNECTIONS[0].client_id,
        ACTIVE_CONNECTIONS[0].toolkit_slug,
      ),
    ).resolves.toBeNull();
  });
});

describe("getActiveToolkitSlugs", () => {
  it("returns toolkit slugs derived from active connections", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: ACTIVE_CONNECTIONS, error: null },
    });

    const result = await getActiveToolkitSlugs(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
    );

    expect(result).toEqual(["gmail", "googlecalendar"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "select",
      args: ["toolkit_slug"],
    });
  });

  it("throws when the toolkit-slug query fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "select failed" } },
    });

    await expect(
      getActiveToolkitSlugs(supabase as never, ACTIVE_CONNECTIONS[0].client_id),
    ).rejects.toThrow("Failed to load active connection toolkits: select failed");
  });

  it("throws when the toolkit-slug query returns an invalid shape", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ toolkit_slug: null }],
        error: null,
      },
    });

    await expect(
      getActiveToolkitSlugs(supabase as never, ACTIVE_CONNECTIONS[0].client_id),
    ).rejects.toThrow();
  });
});

describe("insertConnection", () => {
  it("inserts and returns the parsed row", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    const result = await insertConnection(supabase as never, {
      client_id: ACTIVE_CONNECTIONS[0].client_id,
      composio_connected_account_id: ACTIVE_CONNECTIONS[0].composio_connected_account_id,
      toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
      display_name: ACTIVE_CONNECTIONS[0].display_name,
      account_identifier: ACTIVE_CONNECTIONS[0].account_identifier,
      status: "active",
      activated_tools: [...ACTIVE_CONNECTIONS[0].activated_tools],
      tool_count: ACTIVE_CONNECTIONS[0].tool_count,
    });

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.from).toEqual(["connections"]);
    expect(supabase.calls.methods).toContainEqual(
      expect.objectContaining({ method: "insert" }),
    );
    expect(supabase.calls.methods).toContainEqual({ method: "single", args: [] });
  });

  it("does not use onConflict because multi-connection is allowed", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    await insertConnection(supabase as never, {
      client_id: ACTIVE_CONNECTIONS[0].client_id,
      composio_connected_account_id: "conn_new",
      toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
      status: "pending",
    });

    const upsertCalls = supabase.calls.methods.filter((call) => call.method === "upsert");
    expect(upsertCalls).toHaveLength(0);
  });

  it("throws when the insert fails", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    await expect(
      insertConnection(supabase as never, {
        client_id: ACTIVE_CONNECTIONS[0].client_id,
        composio_connected_account_id: "conn_new",
        toolkit_slug: "gmail",
        status: "pending",
      }),
    ).rejects.toThrow("Failed to insert connection: insert failed");
  });
});

describe("getAllConnections", () => {
  const mixedConnections = [
    ACTIVE_CONNECTIONS[0],
    { ...ACTIVE_CONNECTIONS[1], status: "inactive" },
    {
      ...ACTIVE_CONNECTIONS[0],
      id: "880e8400-e29b-41d4-a716-446655440000",
      status: "error",
    },
    {
      ...ACTIVE_CONNECTIONS[0],
      id: "990e8400-e29b-41d4-a716-446655440000",
      status: "pending",
      composio_connected_account_id: "conn_pending",
    },
  ];

  it("returns connections of all statuses", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: mixedConnections, error: null },
    });

    const result = await getAllConnections(supabase as never, ACTIVE_CONNECTIONS[0].client_id);

    expect(result).toHaveLength(4);
    expect(result.map((connection) => connection.status)).toEqual([
      "active",
      "inactive",
      "error",
      "pending",
    ]);
  });

  it("does not filter by status", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: ACTIVE_CONNECTIONS, error: null },
    });

    await getAllConnections(supabase as never, ACTIVE_CONNECTIONS[0].client_id);

    const statusFilters = supabase.calls.methods.filter(
      (call) => call.method === "eq" && call.args[0] === "status",
    );
    expect(statusFilters).toHaveLength(0);
  });

  it("throws when the query fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "db down" } },
    });

    await expect(
      getAllConnections(supabase as never, ACTIVE_CONNECTIONS[0].client_id),
    ).rejects.toThrow("Failed to load connections: db down");
  });
});

describe("getActiveConnectionsByToolkit", () => {
  const multiGmailConnections = [
    ACTIVE_CONNECTIONS[0],
    {
      ...ACTIVE_CONNECTIONS[0],
      id: "880e8400-e29b-41d4-a716-446655440000",
      composio_connected_account_id: "conn_gmail_work",
      display_name: "Work Gmail",
    },
  ];

  it("returns all active connections for a toolkit", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: multiGmailConnections, error: null },
    });

    const result = await getActiveConnectionsByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "gmail",
    );

    expect(result).toHaveLength(2);
    expect(result.map((connection) => connection.id)).toEqual([
      ACTIVE_CONNECTIONS[0].id,
      "880e8400-e29b-41d4-a716-446655440000",
    ]);
  });

  it("filters by active status and toolkit slug", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: multiGmailConnections, error: null },
    });

    await getActiveConnectionsByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "gmail",
    );

    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["status", "active"],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["toolkit_slug", "gmail"],
    });
  });

  it("returns an empty array when no active connections exist", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await getActiveConnectionsByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "gmail",
    );

    expect(result).toEqual([]);
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "db down" } },
    });

    await expect(
      getActiveConnectionsByToolkit(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "gmail"),
    ).rejects.toThrow("Failed to load connections for toolkit: db down");
  });
});

describe("getConnectionById", () => {
  it("returns the connection when found", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    const result = await getConnectionById(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", ACTIVE_CONNECTIONS[0].client_id],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["id", ACTIVE_CONNECTIONS[0].id],
    });
    expect(supabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("returns null when no connection exists", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(
      getConnectionById(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "missing"),
    ).resolves.toBeNull();
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "boom" } },
    });

    await expect(
      getConnectionById(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "missing"),
    ).rejects.toThrow("Failed to load connection: boom");
  });
});

describe("getConnectionByConnectedAccountId", () => {
  it("returns the connection when the connected account id exists", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    const result = await getConnectionByConnectedAccountId(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].composio_connected_account_id,
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["composio_connected_account_id", ACTIVE_CONNECTIONS[0].composio_connected_account_id],
    });
    expect(supabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("returns null when the connected account id is missing", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(
      getConnectionByConnectedAccountId(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "missing"),
    ).resolves.toBeNull();
  });
});

describe("getPendingConnectionByToolkit", () => {
  it("returns the oldest pending connection for a toolkit", async () => {
    const pendingConnection = {
      ...ACTIVE_CONNECTIONS[0],
      id: "990e8400-e29b-41d4-a716-446655440000",
      composio_connected_account_id: "pending:123",
      status: "pending",
    } as const;
    const supabase = createMockSupabaseClient({
      selectResult: { data: [pendingConnection], error: null },
    });

    const result = await getPendingConnectionByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "gmail",
    );

    expect(result).toEqual(pendingConnection);
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["status", "pending"],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "limit",
      args: [1],
    });
  });

  it("returns null when no pending connection exists", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(
      getPendingConnectionByToolkit(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "gmail"),
    ).resolves.toBeNull();
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "pending failed" } },
    });

    await expect(
      getPendingConnectionByToolkit(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "gmail"),
    ).rejects.toThrow("Failed to load pending connection for gmail: pending failed");
  });
});

describe("getConnectionsByIds", () => {
  it("returns matching connections", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: ACTIVE_CONNECTIONS, error: null },
    });

    const ids = ACTIVE_CONNECTIONS.map((connection) => connection.id);
    const result = await getConnectionsByIds(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ids,
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS);
    expect(supabase.calls.methods).toContainEqual({
      method: "in",
      args: ["id", ids],
    });
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "in failed" } },
    });

    await expect(
      getConnectionsByIds(supabase as never, ACTIVE_CONNECTIONS[0].client_id, ["a"]),
    ).rejects.toThrow("Failed to load connections: in failed");
  });
});

describe("deleteConnection", () => {
  it("deletes a connection row", async () => {
    const supabase = createMockSupabaseClient({
      deleteResult: { data: null, error: null },
    });

    await deleteConnection(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
    );

    expect(supabase.calls.methods).toContainEqual(
      expect.objectContaining({ method: "delete" }),
    );
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", ACTIVE_CONNECTIONS[0].client_id],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["id", ACTIVE_CONNECTIONS[0].id],
    });
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      deleteResult: { data: null, error: { message: "delete failed" } },
    });

    await expect(
      deleteConnection(supabase as never, ACTIVE_CONNECTIONS[0].client_id, ACTIVE_CONNECTIONS[0].id),
    ).rejects.toThrow("Failed to delete connection: delete failed");
  });
});

describe("updateConnectionActivatedTools", () => {
  it("updates activated_tools and returns the updated row", async () => {
    const updatedRow = {
      ...ACTIVE_CONNECTIONS[0],
      activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
    };
    const supabase = createMockSupabaseClient({
      updateResult: { data: [updatedRow], error: null },
    });

    const result = await updateConnectionActivatedTools(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
      ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
    );

    expect(result.activated_tools).toEqual(["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "update",
      args: [{ activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"] }],
    });
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: null, error: { message: "update failed" } },
    });

    await expect(
      updateConnectionActivatedTools(
        supabase as never,
        ACTIVE_CONNECTIONS[0].client_id,
        ACTIVE_CONNECTIONS[0].id,
        [],
      ),
    ).rejects.toThrow("Failed to update activated tools: update failed");
  });
});

describe("updateConnectionStatus", () => {
  it("updates status and returns the updated row", async () => {
    const updatedRow = {
      ...ACTIVE_CONNECTIONS[0],
      status: "error" as const,
    };
    const supabase = createMockSupabaseClient({
      updateResult: { data: [updatedRow], error: null },
    });

    const result = await updateConnectionStatus(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
      "error",
    );

    expect(result.status).toBe("error");
    expect(supabase.calls.methods).toContainEqual({
      method: "update",
      args: [{ status: "error" }],
    });
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: null, error: { message: "status failed" } },
    });

    await expect(
      updateConnectionStatus(
        supabase as never,
        ACTIVE_CONNECTIONS[0].client_id,
        ACTIVE_CONNECTIONS[0].id,
        "active",
      ),
    ).rejects.toThrow("Failed to update connection status: status failed");
  });
});

describe("updateConnection", () => {
  it("updates callback reconciliation fields and returns the parsed row", async () => {
    const updatedRow = {
      ...ACTIVE_CONNECTIONS[0],
      composio_connected_account_id: "conn_999xyz",
      account_identifier: "agent@example.com",
    };
    const supabase = createMockSupabaseClient({
      updateResult: { data: [updatedRow], error: null },
    });

    const result = await updateConnection(supabase as never, ACTIVE_CONNECTIONS[0].client_id, {
      id: ACTIVE_CONNECTIONS[0].id,
      composio_connected_account_id: "conn_999xyz",
      account_identifier: "agent@example.com",
      status: "active",
    });

    expect(result).toEqual(updatedRow);
    expect(supabase.calls.methods).toContainEqual({
      method: "update",
      args: [
        {
          composio_connected_account_id: "conn_999xyz",
          account_identifier: "agent@example.com",
          status: "active",
        },
      ],
    });
  });

  it("throws when the update query fails", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: null, error: { message: "update failed" } },
    });

    await expect(
      updateConnection(supabase as never, ACTIVE_CONNECTIONS[0].client_id, {
        id: ACTIVE_CONNECTIONS[0].id,
        status: "active",
      }),
    ).rejects.toThrow("Failed to update connection: update failed");
  });

  it("throws when the update payload is invalid", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    await expect(
      updateConnection(supabase as never, ACTIVE_CONNECTIONS[0].client_id, {
        id: "not-a-uuid",
        status: "active",
      }),
    ).rejects.toThrow();
  });
});
