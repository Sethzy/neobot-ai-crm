/**
 * Tests for connection persistence queries.
 * @module lib/connections/__tests__/queries
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  getActiveConnectionByToolkit,
  getActiveConnections,
  getActiveToolkitSlugs,
  upsertConnection,
} from "../queries";

const ACTIVE_CONNECTIONS = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_123abc",
    toolkit_slug: "gmail",
    display_name: "Gmail",
    status: "active",
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "770e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_456def",
    toolkit_slug: "googlecalendar",
    display_name: "Google Calendar",
    status: "active",
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
];

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
    expect(supabase.calls.methods).toContainEqual({ method: "eq", args: ["client_id", ACTIVE_CONNECTIONS[0].client_id] });
    expect(supabase.calls.methods).toContainEqual({ method: "eq", args: ["status", "active"] });
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
    expect(supabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
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

describe("upsertConnection", () => {
  it("upserts and returns the parsed row", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    const result = await upsertConnection(supabase as never, {
      client_id: ACTIVE_CONNECTIONS[0].client_id,
      composio_connected_account_id: ACTIVE_CONNECTIONS[0].composio_connected_account_id,
      toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
      display_name: ACTIVE_CONNECTIONS[0].display_name,
      status: "active",
    });

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.from).toEqual(["connections"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "upsert",
      args: [
        {
          client_id: ACTIVE_CONNECTIONS[0].client_id,
          composio_connected_account_id: ACTIVE_CONNECTIONS[0].composio_connected_account_id,
          toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
          display_name: ACTIVE_CONNECTIONS[0].display_name,
          status: "active",
        },
        { onConflict: "client_id,toolkit_slug" },
      ],
    });
    expect(supabase.calls.methods).toContainEqual({ method: "single", args: [] });
  });

  it("throws when the upsert query fails", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "write failed" } },
    });

    await expect(
      upsertConnection(supabase as never, {
        client_id: ACTIVE_CONNECTIONS[0].client_id,
        composio_connected_account_id: ACTIVE_CONNECTIONS[0].composio_connected_account_id,
        toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
        display_name: ACTIVE_CONNECTIONS[0].display_name,
        status: "active",
      }),
    ).rejects.toThrow("Failed to upsert connection: write failed");
  });

  it("throws when the upserted row shape is invalid", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: {
        data: [{ ...ACTIVE_CONNECTIONS[0], composio_connected_account_id: null }],
        error: null,
      },
    });

    await expect(
      upsertConnection(supabase as never, {
        client_id: ACTIVE_CONNECTIONS[0].client_id,
        composio_connected_account_id: ACTIVE_CONNECTIONS[0].composio_connected_account_id,
        toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
        display_name: ACTIVE_CONNECTIONS[0].display_name,
        status: "active",
      }),
    ).rejects.toThrow();
  });
});
