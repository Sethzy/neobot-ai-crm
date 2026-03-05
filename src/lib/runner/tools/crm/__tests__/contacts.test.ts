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
  it("creates and returns a contact when no duplicates found", async () => {
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
    const { client, builderHistory } = createMockSupabase({
      // First call: dedup search returns empty, second call: insert returns created
      contacts: [
        { data: [], error: null },
        { data: created, error: null },
      ],
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
    // First call: dedup search
    expect(builderHistory.contacts[0].ilike).toHaveBeenCalledWith("first_name", "%Jane%");
    expect(builderHistory.contacts[0].ilike).toHaveBeenCalledWith("last_name", "%Doe%");
    // Second call: insert
    expect(builderHistory.contacts[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
      }),
    );
    expect(builderHistory.contacts[1].single).toHaveBeenCalled();
  });

  it("returns possible_duplicates when matching contacts exist", async () => {
    const existing = [
      {
        contact_id: "existing-1",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane.old@example.com",
        type: "buyer",
      },
    ];
    const { client } = createMockSupabase({
      contacts: { data: existing, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.create_contact.execute(
      { first_name: "Jane", last_name: "Doe" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      reason: "possible_duplicates",
      possible_duplicates: existing,
      message: expect.stringContaining("Jane Doe"),
    });
  });

  it("skips dedup when force_create is true", async () => {
    const created = {
      contact_id: "new-1",
      client_id: CLIENT_ID,
      first_name: "Jane",
      last_name: "Doe",
      type: "other",
    };
    const { client, from } = createMockSupabase({
      // Only one call — the insert (no dedup search)
      contacts: { data: created, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.create_contact.execute(
      { first_name: "Jane", last_name: "Doe", force_create: true },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contact: created });
    // Only one from("contacts") call — no dedup search
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("falls through to insert when dedup search errors", async () => {
    const created = {
      contact_id: "new-2",
      client_id: CLIENT_ID,
      first_name: "Jane",
      last_name: "Doe",
      type: "other",
    };
    const { client } = createMockSupabase({
      contacts: [
        // First call: dedup search errors
        { data: null, error: { message: "timeout" } },
        // Second call: insert succeeds
        { data: created, error: null },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.create_contact.execute(
      { first_name: "Jane", last_name: "Doe" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contact: created });
  });

  it("returns default type when omitted", async () => {
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: {}, error: null },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.create_contact.execute(
      { first_name: "No", last_name: "Type" },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.contacts[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "other" }),
    );
  });

  it("returns errors from Supabase insert", async () => {
    const { client } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: null, error: { message: "duplicate email" } },
      ],
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
  it("creates multiple contacts when no duplicates found", async () => {
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
    const { client, builderHistory } = createMockSupabase({
      // Call 1: dedup search for Alice Tan, Call 2: dedup search for Bob Lee, Call 3: insert
      contacts: [
        { data: [], error: null },
        { data: [], error: null },
        { data: created, error: null },
      ],
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
    expect(builderHistory.contacts[2].insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ client_id: CLIENT_ID, first_name: "Alice" }),
        expect.objectContaining({ client_id: CLIENT_ID, first_name: "Bob", type: "other" }),
      ]),
    );
  });

  it("returns possible_duplicates when existing contacts match", async () => {
    const existing = [{ contact_id: "existing-1", first_name: "Alice", last_name: "Tan" }];
    const { client } = createMockSupabase({
      // First dedup search finds a match
      contacts: [
        { data: existing, error: null },
        { data: [], error: null },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.batch_create_contacts.execute(
      {
        contacts: [
          { first_name: "Alice", last_name: "Tan" },
          { first_name: "Bob", last_name: "Lee" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "possible_duplicates",
    });
  });

  it("detects intra-batch duplicates", async () => {
    const { client } = createMockSupabase();
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.batch_create_contacts.execute(
      {
        contacts: [
          { first_name: "Alice", last_name: "Tan" },
          { first_name: "alice", last_name: "tan" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "possible_duplicates",
      message: expect.stringContaining("Intra-batch"),
    });
  });

  it("skips dedup when force_create is true", async () => {
    const created = [{ contact_id: "aaa", first_name: "Alice", last_name: "Tan" }];
    const { client, from } = createMockSupabase({
      contacts: { data: created, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.batch_create_contacts.execute(
      {
        contacts: [{ first_name: "Alice", last_name: "Tan" }],
        force_create: true,
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contacts: created, count: 1 });
    // Only one from("contacts") call — no dedup searches
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("defaults type to 'other' for each contact", async () => {
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: [{}], error: null },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.batch_create_contacts.execute(
      { contacts: [{ first_name: "No", last_name: "Type" }] },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.contacts[1].insert).toHaveBeenCalledWith([
      expect.objectContaining({ type: "other" }),
    ]);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: null, error: { message: "batch insert failed" } },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.batch_create_contacts.execute(
      { contacts: [{ first_name: "Jane", last_name: "Doe" }] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "batch insert failed" });
  });
});
