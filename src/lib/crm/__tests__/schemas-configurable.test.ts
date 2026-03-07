/**
 * Tests for configurable CRM persistence schema behavior.
 * @module lib/crm/__tests__/schemas-configurable
 */
import { describe, expect, it } from "vitest";

import {
  contactInsertSchema,
  contactSchema,
  crmConfigInsertSchema,
  crmConfigSchema,
  crmTaskInsertSchema,
  crmTaskSchema,
  dealContactInsertSchema,
  dealContactSchema,
  dealInsertSchema,
  dealSchema,
  interactionInsertSchema,
  interactionSchema,
} from "../schemas";

const ISO = "2026-03-01T10:00:00+08:00";

describe("configurable CRM entity schemas", () => {
  it("accepts custom vocabulary strings in persisted contact, deal, interaction, and deal-contact rows", () => {
    expect(contactSchema.parse({
      contact_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      first_name: "Jamie",
      last_name: "Lim",
      email: null,
      phone: null,
      type: "prospect",
      notes: null,
      custom_fields: {},
      created_at: ISO,
      updated_at: ISO,
    }).type).toBe("prospect");

    expect(dealSchema.parse({
      deal_id: "750e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      address: "123 Orchard Road",
      stage: "underwriting",
      price: 1500000,
      notes: null,
      custom_fields: {},
      created_at: ISO,
      updated_at: ISO,
    }).stage).toBe("underwriting");

    expect(interactionSchema.parse({
      interaction_id: "850e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      contact_id: "550e8400-e29b-41d4-a716-446655440000",
      deal_id: null,
      type: "site_visit",
      summary: null,
      occurred_at: ISO,
      created_at: ISO,
      updated_at: ISO,
    }).type).toBe("site_visit");

    expect(dealContactSchema.parse({
      deal_contact_id: "950e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_id: "750e8400-e29b-41d4-a716-446655440000",
      contact_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "broker",
      is_primary: false,
      created_at: ISO,
    }).role).toBe("broker");
  });

  it("accepts custom_fields on contacts, deals, and crm tasks", () => {
    expect(contactInsertSchema.parse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      first_name: "Jamie",
      last_name: "Lim",
      type: "prospect",
      custom_fields: { source: "web" },
    }).custom_fields).toEqual({ source: "web" });

    expect(dealInsertSchema.parse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      address: "123 Orchard Road",
      stage: "underwriting",
      custom_fields: { policy_number: "POL-1" },
    }).custom_fields).toEqual({ policy_number: "POL-1" });

    expect(crmTaskSchema.parse({
      task_id: "050e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      contact_id: null,
      deal_id: null,
      title: "Review policy",
      description: null,
      status: "open",
      due_date: null,
      custom_fields: { priority_score: 3 },
      created_at: ISO,
      updated_at: ISO,
    }).custom_fields).toEqual({ priority_score: 3 });

    expect(crmTaskInsertSchema.parse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      title: "Review policy",
      custom_fields: { priority_score: 3 },
    }).custom_fields).toEqual({ priority_score: 3 });
  });

  it("accepts the extended crm_config shape", () => {
    const row = {
      config_id: "a50e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_label: "Policy",
      deal_stages: ["lead", "quoted", "bound"],
      contact_types: ["prospect", "client"],
      interaction_types: ["call", "email"],
      deal_contact_roles: ["client", "broker"],
      task_types: null,
      deal_custom_fields: [{ key: "policy_number", label: "Policy Number", type: "text" }],
      contact_custom_fields: [],
      task_custom_fields: [],
      created_at: ISO,
      updated_at: ISO,
    };

    expect(crmConfigSchema.parse(row)).toEqual(row);
    expect(crmConfigInsertSchema.parse({
      client_id: row.client_id,
      deal_label: "Policy",
      deal_stages: ["lead", "quoted"],
      contact_types: ["prospect"],
      interaction_types: ["call"],
      deal_contact_roles: ["broker"],
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    }).deal_label).toBe("Policy");
  });

  it("still keeps crm task status binary even while other vocab becomes configurable", () => {
    expect(() =>
      crmTaskInsertSchema.parse({
        client_id: "660e8400-e29b-41d4-a716-446655440000",
        title: "Follow up",
        status: "in_progress",
      }),
    ).toThrow();
  });

  it("keeps link insert schema permissive for configurable roles", () => {
    expect(dealContactInsertSchema.parse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_id: "750e8400-e29b-41d4-a716-446655440000",
      contact_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "broker",
    }).role).toBe("broker");

    expect(interactionInsertSchema.parse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      contact_id: "550e8400-e29b-41d4-a716-446655440000",
      type: "site_visit",
      occurred_at: ISO,
    }).type).toBe("site_visit");
  });
});
