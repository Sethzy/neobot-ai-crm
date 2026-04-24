import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { createRecordTool } from "../create-record";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
  captureServerEvents: vi.fn(),
}));

const mockCaptureTimelineActivity = vi.fn();
vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("createRecordTool", () => {
  beforeEach(() => {
    mockCaptureTimelineActivity.mockReset();
  });

  it("creates a single contact after duplicate check and uses the explicit client_id filter", async () => {
    const inserted = { contact_id: "c1", first_name: "John", last_name: "Tan" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: inserted, error: null },
      ],
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Tan" }],
      },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, record: inserted, count: 1 });
    expect(builderHistory.contacts[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.contacts[1]?.insert).toHaveBeenCalled();
  });

  it("rejects invalid email format on contact create", async () => {
    const { client } = createMockSupabase({
      contacts: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "Jane", last_name: "Doe", email: "not-an-email" }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Doesn't look like an email",
    });
  });

  it("lowercases email on contact create", async () => {
    const inserted = { contact_id: "c1", first_name: "Jane", last_name: "Doe", email: "jane@acme.com" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: inserted, error: null },
      ],
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "Jane", last_name: "Doe", email: "Jane@ACME.COM" }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    expect(builderHistory.contacts[0]?.or).toHaveBeenCalledWith(
      expect.stringContaining("email.eq.jane@acme.com"),
    );
    if (result.success && "record" in result) {
      const record = result.record as { email: string };
      expect(record.email).toBe("jane@acme.com");
    }
  });

  it("stores plausible non-E.164 phone input as trimmed raw on contact create", async () => {
    const inserted = { contact_id: "c1", first_name: "Jane", last_name: "Doe", phone: "9123 4567" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: inserted, error: null },
      ],
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "Jane", last_name: "Doe", phone: "9123 4567" }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    expect(builderHistory.contacts[0]?.or).toHaveBeenCalledWith(
      expect.stringContaining("phone.eq.9123 4567"),
    );
    expect(builderHistory.contacts[1]?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "9123 4567" }),
    );
  });

  it("canonicalizes duplicate lookup email before querying existing contacts", async () => {
    const inserted = { contact_id: "c1", first_name: "Jane", last_name: "Doe", email: "foo@bar.com" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: inserted, error: null },
      ],
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "Jane", last_name: "Doe", email: "  Foo@Bar.COM  " }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    expect(builderHistory.contacts[0]?.or).toHaveBeenCalledWith(
      expect.stringContaining("email.eq.foo@bar.com"),
    );
  });

  it("canonicalizes duplicate lookup phone before querying existing contacts", async () => {
    const inserted = { contact_id: "c1", first_name: "Jane", last_name: "Doe", phone: "9123 4567" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: inserted, error: null },
      ],
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "Jane", last_name: "Doe", phone: " 9123 4567 " }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    expect(builderHistory.contacts[0]?.or).toHaveBeenCalledWith(
      expect.stringContaining("phone.eq.9123 4567"),
    );
  });

  it("rejects implausible phone input on contact create", async () => {
    const { client } = createMockSupabase({
      contacts: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "Jane", last_name: "Doe", phone: "123" }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Doesn't look like a phone number",
    });
  });

  it("rejects invalid email format on company create", async () => {
    const { client } = createMockSupabase({
      companies: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "companies",
        records: [{ name: "Acme", email: "bad-email" }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Doesn't look like an email",
    });
  });

  it("rejects deal with negative amount on create", async () => {
    const { client } = createMockSupabase({
      deals: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "deals",
        records: [{ address: "123 Main St", amount: -100 }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/amount.*finite.*non-negative/i);
    }
  });

  it("rejects deal with Infinity amount on create", async () => {
    const { client } = createMockSupabase({
      deals: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "deals",
        records: [{ address: "123 Main St", amount: Infinity }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(false);
  });

  it("rejects deal with NaN amount on create", async () => {
    const { client } = createMockSupabase({
      deals: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "deals",
        records: [{ address: "123 Main St", amount: Number.NaN }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(false);
  });

  it("normalises company website on create", async () => {
    const inserted = { company_id: "co1", name: "Acme", website: "acme.com" };
    const { client, builderHistory } = createMockSupabase({
      companies: [
        { data: [], error: null },
        { data: inserted, error: null },
      ],
    });

    const result = await createRecordTool.execute(
      {
        entity: "companies",
        records: [{ name: "Acme", website: "https://www.acme.com/?utm=test" }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    // Verify the insert received the normalised website
    expect(builderHistory.companies[1]?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ website: "acme.com" }),
    );
  });

  it("rejects invalid website format on company create", async () => {
    const { client } = createMockSupabase({
      companies: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "companies",
        records: [{ name: "Acme", website: "not a url" }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Doesn't look like a website",
    });
  });

  it("returns possible_duplicates when duplicate detection finds a match", async () => {
    const { client } = createMockSupabase({
      contacts: {
        data: [{ contact_id: "c1", first_name: "John", last_name: "Tan" }],
        error: null,
      },
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Tan" }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ reason: "possible_duplicates" });
  });

  it("rejects intra-batch duplicates that only differ by surrounding whitespace", async () => {
    const { client } = createMockSupabase({
      contacts: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [
          { first_name: "John", last_name: "Tan" },
          { first_name: " John ", last_name: "Tan " },
        ],
      },
      makeContext(client),
    );

    expect(result).toMatchObject({
      success: false,
      reason: "possible_duplicates",
    });
  });

  it("rejects intra-batch contact duplicates that share the same email", async () => {
    const { client } = createMockSupabase({
      contacts: { data: [], error: null },
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [
          { first_name: "John", last_name: "Tan", email: "shared@example.com" },
          { first_name: "Jane", last_name: "Lim", email: "SHARED@example.com " },
        ],
      },
      makeContext(client),
    );

    expect(result).toMatchObject({
      success: false,
      reason: "possible_duplicates",
    });
  });
});
