/**
 * Tests for config-driven contact tool schemas and custom fields.
 * @module lib/runner/tools/crm/__tests__/contacts-configurable
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { createContactTools } from "../contacts";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const INSURANCE_CONFIG = {
  ...CRM_DEFAULTS,
  contact_types: ["prospect", "client", "broker"],
  contact_custom_fields: [
    { key: "referrer", label: "Referrer", type: "text" as const },
    { key: "priority_score", label: "Priority Score", type: "number" as const },
  ],
};

describe("createContactTools configurable vocab", () => {
  it("uses config-driven contact type enums and descriptions", () => {
    const { client } = createMockSupabase();
    const tools = createContactTools(client, CLIENT_ID, INSURANCE_CONFIG);

    expect(tools.search_contacts.inputSchema.safeParse({ type: "prospect" }).success).toBe(true);
    expect(tools.search_contacts.inputSchema.safeParse({ type: "buyer" }).success).toBe(false);
    expect(tools.create_contact.description).toContain("prospect, client, broker");
  });

  it("validates and persists configured custom_fields on create", async () => {
    const created = {
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: CLIENT_ID,
      first_name: "Jamie",
      last_name: "Lim",
      email: null,
      phone: null,
      type: "prospect",
      notes: null,
      custom_fields: { referrer: "AIA", priority_score: 5 },
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: created, error: null },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID, INSURANCE_CONFIG);

    const result = await tools.create_contact.execute({
      first_name: "Jamie",
      last_name: "Lim",
      type: "prospect",
      custom_fields: { referrer: "AIA", priority_score: 5 },
    }, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, contact: created });
    expect(builderHistory.contacts[1].insert).toHaveBeenCalledWith(expect.objectContaining({
      custom_fields: { referrer: "AIA", priority_score: 5 },
    }));
    expect(tools.create_contact.inputSchema.safeParse({
      first_name: "Jamie",
      last_name: "Lim",
      custom_fields: { unknown: "value" },
    }).success).toBe(false);
  });

  it("merges custom_fields patches on update instead of replacing the whole object", async () => {
    const existing = {
      contact_id: "550e8400-e29b-41d4-a716-446655440010",
      client_id: CLIENT_ID,
      first_name: "Jamie",
      last_name: "Lim",
      email: null,
      phone: null,
      type: "prospect",
      notes: null,
      custom_fields: { referrer: "AIA", priority_score: 4 },
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const updated = {
      ...existing,
      custom_fields: { referrer: "AIA", priority_score: 5 },
      updated_at: "2026-03-01T01:00:00Z",
    };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID, INSURANCE_CONFIG);

    const result = await tools.update_contact.execute({
      contact_id: existing.contact_id,
      custom_fields: { priority_score: 5 },
    }, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, contact: updated });
    expect(builderHistory.contacts[1].update).toHaveBeenCalledWith(expect.objectContaining({
      custom_fields: { referrer: "AIA", priority_score: 5 },
    }));
  });
});
