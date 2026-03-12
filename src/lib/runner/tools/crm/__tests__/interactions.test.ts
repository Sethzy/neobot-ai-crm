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
