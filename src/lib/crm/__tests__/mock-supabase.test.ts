/**
 * Tests for Supabase CRM tool mock helper.
 * @module lib/crm/__tests__/mock-supabase.test
 */
import { describe, expect, it } from "vitest";

import { createMockSupabase } from "./mock-supabase";

describe("createMockSupabase", () => {
  it("returns configured data when a chain is awaited", async () => {
    const contacts = [{ contact_id: "1", first_name: "John" }];
    const { client } = createMockSupabase({
      contacts: { data: contacts, error: null },
    });

    const { data, error } = await client.from("contacts").select("*").limit(20);

    expect(data).toEqual(contacts);
    expect(error).toBeNull();
  });

  it("returns empty rows for unconfigured tables", async () => {
    const { client } = createMockSupabase();

    const { data, error } = await client.from("unknown_table").select("*");

    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it("exposes chainable method spies per table", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });

    await client.from("contacts").select("*").eq("type", "buyer").limit(10);

    expect(builders.contacts.select).toHaveBeenCalledWith("*");
    expect(builders.contacts.eq).toHaveBeenCalledWith("type", "buyer");
    expect(builders.contacts.limit).toHaveBeenCalledWith(10);
  });

  it("returns configured errors", async () => {
    const { client } = createMockSupabase({
      contacts: {
        data: null,
        error: { message: "RLS violation" },
      },
    });

    const { data, error } = await client.from("contacts").select("*");

    expect(data).toBeNull();
    expect(error).toEqual({ message: "RLS violation" });
  });

  it("passes through configured count values", async () => {
    const { client } = createMockSupabase({
      contacts: {
        data: null,
        error: null,
        count: 42,
      },
    });

    const result = await client.from("contacts").select("*", { count: "exact", head: true });

    expect(result.count).toBe(42);
    expect(result.error).toBeNull();
  });
});
