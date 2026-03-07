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
    first_name: "John",
    last_name: "Smith",
    email: "john@example.com",
    phone: "+6591234567",
    type: "buyer" as const,
    notes: "Met at property viewing",
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
      notes: null,
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
    address: "123 Orchard Road, #08-01",
    stage: "negotiation" as const,
    price: 1500000,
    notes: "3BR condo",
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
    const nullableRow = { ...validRow, price: null, notes: null };
    expect(dealSchema.parse(nullableRow)).toEqual(nullableRow);
  });

  test("rejects negative price", () => {
    const invalid = { ...validRow, price: -1 };
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
      price: null,
      notes: null,
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
    status: "open" as const,
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
      status: "completed" as const,
      due_date: null,
    };
    expect(crmTaskInsertSchema.parse(insert)).toEqual(insert);
  });

  test("crmTaskStatusValues contains allowed values", () => {
    expect(crmTaskStatusValues).toEqual(["open", "completed"]);
  });
});

describe("crm config schemas", () => {
  const validRow = {
    config_id: "a50e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    deal_label: "Deal",
    deal_stages: [{ id: "leads", name: "Leads" }],
    contact_types: ["buyer", "seller"],
    task_types: [{ id: "follow_up", name: "Follow up" }],
    interaction_types: [{ id: "call", name: "Call" }],
    deal_contact_roles: ["buyer", "agent"],
    deal_custom_fields: [],
    contact_custom_fields: [],
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
