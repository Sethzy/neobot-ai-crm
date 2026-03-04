/**
 * Tests for CRM contact tools.
 * @module lib/runner/tools/crm/__tests__/contacts.test
 */
import { describe, expect, it } from "vitest";

import { createContactTools } from "../contacts";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("search_contacts", () => {
  it("returns matching contacts for a query", async () => {
    const contacts = [
      {
        contact_id: "550e8400-e29b-41d4-a716-446655440000",
        first_name: "John",
        last_name: "Smith",
        email: "john@example.com",
        phone: "+6591234567",
        type: "buyer",
        notes: null,
      },
    ];
    const { client, builders } = createMockSupabase({
      contacts: { data: contacts, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.search_contacts.execute(
      { query: "John" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contacts, count: 1 });
    expect(builders.contacts.or).toHaveBeenCalledWith(expect.stringContaining("John"));
  });

  it("applies contact type filter when provided", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.search_contacts.execute(
      { query: "test", type: "buyer" },
      EXECUTION_OPTIONS,
    );

    expect(builders.contacts.eq).toHaveBeenCalledWith("type", "buyer");
  });

  it("defaults to limit 20", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.search_contacts.execute({ query: "test" }, EXECUTION_OPTIONS);

    expect(builders.contacts.limit).toHaveBeenCalledWith(20);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "connection timeout" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.search_contacts.execute(
      { query: "test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "connection timeout" });
  });

  it("escapes reserved PostgREST and LIKE characters in query text", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.search_contacts.execute(
      { query: "John, (Doe)%_ \"VIP\"" },
      EXECUTION_OPTIONS,
    );

    const [orExpression] = builders.contacts.or.mock.calls[0] as [string];

    expect(orExpression).toContain("first_name.ilike.\"%John, (Doe)\\%\\_");
    expect(orExpression).toContain("email.ilike.\"%John, (Doe)\\%\\_");
    expect(orExpression).toContain("VIP");
  });
});

describe("create_contact", () => {
  it("creates and returns a contact", async () => {
    const created = {
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: CLIENT_ID,
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: null,
      type: "seller",
      notes: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      contacts: { data: created, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.create_contact.execute(
      {
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        type: "seller",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contact: created });
    expect(builders.contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
      }),
    );
    expect(builders.contacts.single).toHaveBeenCalled();
  });

  it("returns default type when omitted", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: {}, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.create_contact.execute(
      { first_name: "No", last_name: "Type" },
      EXECUTION_OPTIONS,
    );

    expect(builders.contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "other" }),
    );
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "duplicate email" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.create_contact.execute(
      { first_name: "Jane", last_name: "Doe" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "duplicate email" });
  });
});

describe("update_contact", () => {
  it("updates and returns a contact", async () => {
    const updated = {
      contact_id: "550e8400-e29b-41d4-a716-446655440002",
      client_id: CLIENT_ID,
      first_name: "John",
      last_name: "Updated",
      email: "john@example.com",
      phone: null,
      type: "buyer",
      notes: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      contacts: { data: updated, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.update_contact.execute(
      {
        contact_id: "550e8400-e29b-41d4-a716-446655440002",
        last_name: "Updated",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contact: updated });
    expect(builders.contacts.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_name: "Updated" }),
    );
    expect(builders.contacts.eq).toHaveBeenCalledWith(
      "contact_id",
      "550e8400-e29b-41d4-a716-446655440002",
    );
  });

  it("returns an error when no fields are provided", async () => {
    const { client } = createMockSupabase();
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.update_contact.execute(
      { contact_id: "550e8400-e29b-41d4-a716-446655440002" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "Row not found" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.update_contact.execute(
      {
        contact_id: "550e8400-e29b-41d4-a716-446655440002",
        first_name: "Ghost",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});

describe("batch_create_contacts", () => {
  it("creates multiple contacts in a single call", async () => {
    const created = [
      {
        contact_id: "aaa",
        client_id: CLIENT_ID,
        first_name: "Alice",
        last_name: "Tan",
        email: "alice@example.com",
        phone: null,
        type: "buyer",
        notes: null,
      },
      {
        contact_id: "bbb",
        client_id: CLIENT_ID,
        first_name: "Bob",
        last_name: "Lee",
        email: null,
        phone: "+6591234567",
        type: "other",
        notes: null,
      },
    ];
    const { client, builders } = createMockSupabase({
      contacts: { data: created, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.batch_create_contacts.execute(
      {
        contacts: [
          { first_name: "Alice", last_name: "Tan", email: "alice@example.com", type: "buyer" },
          { first_name: "Bob", last_name: "Lee", phone: "+6591234567" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contacts: created, count: 2 });
    expect(builders.contacts.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ client_id: CLIENT_ID, first_name: "Alice" }),
        expect.objectContaining({ client_id: CLIENT_ID, first_name: "Bob", type: "other" }),
      ]),
    );
  });

  it("defaults type to 'other' for each contact", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [{}], error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.batch_create_contacts.execute(
      { contacts: [{ first_name: "No", last_name: "Type" }] },
      EXECUTION_OPTIONS,
    );

    expect(builders.contacts.insert).toHaveBeenCalledWith([
      expect.objectContaining({ type: "other" }),
    ]);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "batch insert failed" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.batch_create_contacts.execute(
      { contacts: [{ first_name: "Jane", last_name: "Doe" }] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "batch insert failed" });
  });
});
