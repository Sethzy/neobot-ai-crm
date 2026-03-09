/**
 * Tests for CRM interaction tools.
 * @module lib/runner/tools/crm/__tests__/interactions.test
 */
import { describe, expect, it } from "vitest";

import { createInteractionTools } from "../interactions";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("create_interaction", () => {
  it("creates and returns an interaction", async () => {
    const created = {
      interaction_id: "550e8400-e29b-41d4-a716-446655440020",
      client_id: CLIENT_ID,
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      deal_id: null,
      type: "call",
      summary: "Discussed pricing for 123 Orchard",
      occurred_at: "2026-03-01T10:00:00Z",
      created_at: "2026-03-01T10:05:00Z",
      updated_at: "2026-03-01T10:05:00Z",
    };
    const { client, builders } = createMockSupabase({
      interactions: { data: created, error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.create_interaction.execute(
      {
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
        type: "call",
        summary: "Discussed pricing for 123 Orchard",
        occurred_at: "2026-03-01T10:00:00Z",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, interaction: created });
    expect(builders.interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
        type: "call",
      }),
    );
  });

  it("includes deal_id when provided", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: {}, error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.create_interaction.execute(
      {
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
        deal_id: "550e8400-e29b-41d4-a716-446655440010",
        type: "viewing",
      },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        deal_id: "550e8400-e29b-41d4-a716-446655440010",
      }),
    );
  });

  it("normalizes date-only occurred_at inputs", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: {}, error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.create_interaction.execute(
      {
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
        type: "note",
        occurred_at: "2026-03-01",
      },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        occurred_at: "2026-03-01T00:00:00Z",
      }),
    );
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      interactions: { data: null, error: { message: "invalid contact_id" } },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.create_interaction.execute(
      {
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
        type: "note",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "invalid contact_id" });
  });
});

describe("search_interactions", () => {
  const INTERACTION_A = {
    interaction_id: "int-1",
    client_id: CLIENT_ID,
    contact_id: "c-1",
    deal_id: "d-1",
    type: "call",
    summary: "Discussed pricing for 123 Orchard",
    occurred_at: "2026-03-05T10:00:00Z",
    created_at: "2026-03-05T10:05:00Z",
    updated_at: "2026-03-05T10:05:00Z",
  };
  const INTERACTION_B = {
    interaction_id: "int-2",
    client_id: CLIENT_ID,
    contact_id: "c-2",
    deal_id: null,
    type: "meeting",
    summary: "Site visit at 456 Marina Bay",
    occurred_at: "2026-03-04T14:00:00Z",
    created_at: "2026-03-04T14:05:00Z",
    updated_at: "2026-03-04T14:05:00Z",
  };

  it("returns all interactions when no filters provided", async () => {
    const { client } = createMockSupabase({
      interactions: { data: [INTERACTION_A, INTERACTION_B], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.search_interactions.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: true,
      interactions: [INTERACTION_A, INTERACTION_B],
      count: 2,
    });
  });

  it("searches summary text via ilike", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_A], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.search_interactions.execute(
      { query: "pricing" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      interactions: [INTERACTION_A],
      count: 1,
    });
    expect(builders.interactions.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.interactions.ilike).toHaveBeenCalledWith(
      "summary",
      expect.stringContaining("pricing"),
    );
  });

  it("filters by interaction type", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_A], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute(
      { type: "call" },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.eq).toHaveBeenCalledWith("type", "call");
  });

  it("filters by contact_id", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_A], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute(
      { contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.eq).toHaveBeenCalledWith("contact_id", "c-1");
  });

  it("filters by deal_id", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_A], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute(
      { deal_id: "d-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.eq).toHaveBeenCalledWith("deal_id", "d-1");
  });

  it("filters by occurred_after using gte", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_A], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute(
      { occurred_after: "2026-03-05T00:00:00Z" },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.gte).toHaveBeenCalledWith(
      "occurred_at",
      "2026-03-05T00:00:00Z",
    );
  });

  it("filters by occurred_before using lte", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_B], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute(
      { occurred_before: "2026-03-04T23:59:59Z" },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.lte).toHaveBeenCalledWith(
      "occurred_at",
      "2026-03-04T23:59:59Z",
    );
  });

  it("normalizes date-only occurred_after and occurred_before", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute(
      { occurred_after: "2026-03-01", occurred_before: "2026-03-05" },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.gte).toHaveBeenCalledWith(
      "occurred_at",
      "2026-03-01T00:00:00Z",
    );
    expect(builders.interactions.lte).toHaveBeenCalledWith(
      "occurred_at",
      "2026-03-05T23:59:59.999Z",
    );
  });

  it("sorts by occurred_at DESC (newest first)", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_A, INTERACTION_B], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute({}, EXECUTION_OPTIONS);

    expect(builders.interactions.order).toHaveBeenCalledWith(
      "occurred_at",
      { ascending: false },
    );
  });

  it("respects custom limit", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: [INTERACTION_A], error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    await tools.search_interactions.execute(
      { limit: 5 },
      EXECUTION_OPTIONS,
    );

    expect(builders.interactions.limit).toHaveBeenCalledWith(5);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      interactions: { data: null, error: { message: "timeout" } },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.search_interactions.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: false, error: "timeout" });
  });
});
