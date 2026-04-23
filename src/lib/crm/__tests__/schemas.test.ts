/**
 * Tests for CRM Zod schemas covering row validation and insert payload validation.
 */
import { describe, expect, test } from "vitest";
import {
  contactInsertSchema,
  contactSchema,
  contactTypeValues,
  crmConfigInsertSchema,
  crmConfigSchema,
  crmTaskInsertSchema,
  crmTaskSchema,
  crmTaskStatusValues,
  crmViewSchema,
  dealContactInsertSchema,
  dealContactRoleValues,
  dealContactSchema,
  dealInsertSchema,
  dealSchema,
  dealStageValues,
  interactionInsertSchema,
  interactionSchema,
  interactionTypeValues,
} from "../schemas";

const ISO = "2026-03-01T00:00:00Z";

describe("contact schemas", () => {
  const validRow = {
    contact_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    company_id: null,
    first_name: "John",
    last_name: "Smith",
    email: "john@example.com",
    phone: "+6591234567",
    type: "buyer" as const,
    custom_fields: {},
    created_at: ISO,
    updated_at: ISO,
  };

  test("validates a valid contact row", () => {
    expect(contactSchema.parse(validRow)).toEqual(validRow);
  });

  test("rejects invalid timestamp format", () => {
    const invalid = { ...validRow, created_at: "2026-03-01" };
    expect(() => contactSchema.parse(invalid)).toThrow();
  });

  test("contact insert allows omitting nullable optional fields", () => {
    const insert = {
      client_id: validRow.client_id,
      first_name: "Jane",
      last_name: "Doe",
      type: "seller" as const,
    };
    expect(contactInsertSchema.parse(insert)).toEqual(insert);
  });

  test("contact insert accepts explicit null nullable fields", () => {
    const insert = {
      client_id: validRow.client_id,
      first_name: "Jane",
      last_name: "Doe",
      type: "seller" as const,
      email: null,
      phone: null,
    };
    expect(contactInsertSchema.parse(insert)).toEqual(insert);
  });

  test("contact insert rejects missing first_name", () => {
    const invalid = {
      client_id: validRow.client_id,
      last_name: "Doe",
      type: "seller" as const,
    };
    expect(() => contactInsertSchema.parse(invalid)).toThrow();
  });

  test("contactTypeValues contains allowed values", () => {
    expect(contactTypeValues).toEqual([
      "buyer",
      "seller",
      "landlord",
      "tenant",
      "agent",
      "other",
    ]);
  });
});

describe("deal schemas", () => {
  const validRow = {
    deal_id: "750e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    company_id: null,
    address: "123 Orchard Road, #08-01",
    stage: "negotiation" as const,
    amount: 1500000,
    custom_fields: {},
    created_at: ISO,
    updated_at: ISO,
  };

  test("validates a valid deal row", () => {
    expect(dealSchema.parse(validRow)).toEqual(validRow);
  });

  test("no longer has contact_id field", () => {
    expect(dealSchema.shape).not.toHaveProperty("contact_id");
  });

  test("allows nullable fields in row", () => {
    const nullableRow = { ...validRow, amount: null };
    expect(dealSchema.parse(nullableRow)).toEqual(nullableRow);
  });

  test("rejects negative amount", () => {
    const invalid = { ...validRow, amount: -1 };
    expect(() => dealSchema.parse(invalid)).toThrow();
  });

  test("deal insert allows DB-default stage and status-like optional fields", () => {
    const insert = {
      client_id: validRow.client_id,
      address: "1 Holland Ave",
    };
    expect(dealInsertSchema.parse(insert)).toEqual(insert);
  });

  test("deal insert accepts explicit nullable optionals", () => {
    const insert = {
      client_id: validRow.client_id,
      address: "1 Holland Ave",
      stage: "offer" as const,
      amount: null,
    };
    expect(dealInsertSchema.parse(insert)).toEqual(insert);
  });

  test("dealStageValues contains allowed values", () => {
    expect(dealStageValues).toEqual([
      "leads",
      "negotiation",
      "offer",
      "closing",
      "lost",
    ]);
  });
});

describe("deal contact schemas", () => {
  test("dealContactRoleValues contains expected roles", () => {
    expect(dealContactRoleValues).toEqual(["buyer", "seller", "agent", "other"]);
  });

  test("validates a full deal_contacts row", () => {
    const result = dealContactSchema.safeParse({
      deal_contact_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_id: "550e8400-e29b-41d4-a716-446655440010",
      contact_id: "550e8400-e29b-41d4-a716-446655440020",
      role: "buyer",
      is_primary: true,
      created_at: ISO,
    });
    expect(result.success).toBe(true);
  });

  test("validates a minimal insert payload", () => {
    const result = dealContactInsertSchema.safeParse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_id: "550e8400-e29b-41d4-a716-446655440010",
      contact_id: "550e8400-e29b-41d4-a716-446655440020",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid role", () => {
    const result = dealContactSchema.safeParse({
      deal_contact_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_id: "550e8400-e29b-41d4-a716-446655440010",
      contact_id: "550e8400-e29b-41d4-a716-446655440020",
      role: "",
      is_primary: true,
      created_at: ISO,
    });
    expect(result.success).toBe(false);
  });
});

describe("interaction schemas", () => {
  const validRow = {
    interaction_id: "850e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    contact_id: "550e8400-e29b-41d4-a716-446655440000",
    deal_id: null,
    type: "call" as const,
    summary: "Discussed viewing timeline",
    occurred_at: ISO,
    created_at: ISO,
    updated_at: ISO,
  };

  test("validates a valid interaction row", () => {
    expect(interactionSchema.parse(validRow)).toEqual(validRow);
  });

  test("rejects invalid occurred_at timestamp", () => {
    const invalid = { ...validRow, occurred_at: "yesterday" };
    expect(() => interactionSchema.parse(invalid)).toThrow();
  });

  test("interaction insert allows optional nullable fields", () => {
    const insert = {
      client_id: validRow.client_id,
      contact_id: validRow.contact_id,
      type: "note" as const,
      occurred_at: ISO,
    };
    expect(interactionInsertSchema.parse(insert)).toEqual(insert);
  });

  test("interaction insert accepts explicit null optionals", () => {
    const insert = {
      client_id: validRow.client_id,
      contact_id: validRow.contact_id,
      deal_id: null,
      type: "email" as const,
      summary: null,
      occurred_at: ISO,
    };
    expect(interactionInsertSchema.parse(insert)).toEqual(insert);
  });

  test("interactionTypeValues contains allowed values", () => {
    expect(interactionTypeValues).toEqual([
      "call",
      "meeting",
      "email",
      "message",
      "viewing",
      "note",
    ]);
  });
});

describe("crm task schemas", () => {
  const validRow = {
    task_id: "950e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    contact_id: null,
    deal_id: null,
    title: "Follow up with buyer",
    description: "Call and confirm preferred district",
    status: "todo" as const,
    due_date: ISO,
    custom_fields: {},
    created_at: ISO,
    updated_at: ISO,
  };

  test("validates a valid crm task row", () => {
    expect(crmTaskSchema.parse(validRow)).toEqual(validRow);
  });

  test("rejects invalid due_date timestamp", () => {
    const invalid = { ...validRow, due_date: "2026/03/01" };
    expect(() => crmTaskSchema.parse(invalid)).toThrow();
  });

  test("crm task insert allows defaults and optional nullable fields", () => {
    const insert = {
      client_id: validRow.client_id,
      title: "Prepare comparables",
    };
    expect(crmTaskInsertSchema.parse(insert)).toEqual(insert);
  });

  test("crm task insert accepts explicit null optionals", () => {
    const insert = {
      client_id: validRow.client_id,
      contact_id: null,
      deal_id: null,
      title: "Prepare comparables",
      description: null,
      status: "done" as const,
      due_date: null,
    };
    expect(crmTaskInsertSchema.parse(insert)).toEqual(insert);
  });

  test("crmTaskStatusValues contains allowed values", () => {
    expect(crmTaskStatusValues).toEqual(["todo", "in_progress", "done"]);
  });
});

describe("crm config schemas", () => {
    const validRow = {
      config_id: "a50e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_label: "Deal",
      company_label: "Company",
      deal_stages: [{ id: "leads", name: "Leads" }],
      contact_types: ["buyer", "seller"],
      task_types: [{ id: "follow_up", name: "Follow up" }],
      interaction_types: [{ id: "call", name: "Call" }],
      deal_contact_roles: ["buyer", "agent"],
      company_industries: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
      created_at: ISO,
      updated_at: ISO,
  };

  test("validates a valid crm config row", () => {
    expect(crmConfigSchema.parse(validRow)).toEqual(validRow);
  });

  test("allows null jsonb columns in row", () => {
    const nullableRow = {
      ...validRow,
      deal_stages: null,
      contact_types: null,
      task_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_industries: null,
    };
    expect(crmConfigSchema.parse(nullableRow)).toEqual(nullableRow);
  });

  test("crm config insert allows omitting optional nullable jsonb fields", () => {
    const insert = {
      client_id: validRow.client_id,
    };
    expect(crmConfigInsertSchema.parse(insert)).toEqual(insert);
  });

  test("crm config insert accepts explicit null jsonb fields", () => {
    const insert = {
      client_id: validRow.client_id,
      deal_stages: null,
      task_types: null,
      interaction_types: null,
    };
    expect(crmConfigInsertSchema.parse(insert)).toEqual(insert);
  });
});

describe("crmViewSchema", () => {
  test("validates a complete view row", () => {
    const result = crmViewSchema.safeParse({
      view_id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      client_id: "c1d2e3f4-a5b6-4890-8def-123456789abc",
      name: "Active pipeline",
      entity_type: "deals",
      filters: { stage: ["leads", "offer"] },
      sort: { column: "created_at", ascending: false },
      state: {
        version: 1,
        viewType: "table",
        filters: { stage: ["leads", "offer"] },
        sort: { column: "created_at", ascending: false },
        columns: [],
        columnOrder: [],
        groupBy: null,
        calendarField: null,
        openMode: "drawer",
        isDefault: false,
      },
      is_default: false,
      is_seeded: true,
      created_at: "2026-04-05T00:00:00+00:00",
      updated_at: "2026-04-05T00:00:00+00:00",
    });
    expect(result.success).toBe(true);
  });

  test("accepts null sort", () => {
    const result = crmViewSchema.safeParse({
      view_id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      client_id: "c1d2e3f4-a5b6-4890-8def-123456789abc",
      name: "Overdue",
      entity_type: "tasks",
      filters: { status: "todo", due_date_before: "$today" },
      sort: null,
      state: {
        version: 1,
        viewType: "table",
        filters: { status: "todo", due_date_before: "$today" },
        sort: null,
        columns: [],
        columnOrder: [],
        groupBy: null,
        calendarField: null,
        openMode: "drawer",
        isDefault: false,
      },
      is_default: false,
      is_seeded: true,
      created_at: "2026-04-05T00:00:00+00:00",
      updated_at: "2026-04-05T00:00:00+00:00",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid entity_type", () => {
    const result = crmViewSchema.safeParse({
      view_id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      client_id: "c1d2e3f4-a5b6-4890-8def-123456789abc",
      name: "Test",
      entity_type: "widgets",
      filters: {},
      sort: null,
      state: {
        version: 1,
        viewType: "table",
        filters: {},
        sort: null,
        columns: [],
        columnOrder: [],
        groupBy: null,
        calendarField: null,
        openMode: "drawer",
        isDefault: false,
      },
      is_default: false,
      is_seeded: false,
      created_at: "2026-04-05T00:00:00+00:00",
      updated_at: "2026-04-05T00:00:00+00:00",
    });
    expect(result.success).toBe(false);
  });
});
