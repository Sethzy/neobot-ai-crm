/**
 * Unified field definition system for config-driven CRM columns.
 * Three protection tiers: indestructible (always visible), default (hideable), custom (fully mutable).
 * @module lib/crm/field-definitions
 */
import { z } from "zod";

/** All supported field types for CRM columns. */
export const fieldTypeValues = [
  "text",
  "full_name",
  "number",
  "currency",
  "email",
  "phone",
  "url",
  "date",
  "boolean",
  "select",
  "tags",
  "richtext",
  "file",
  "relation",
] as const;

export type FieldType = (typeof fieldTypeValues)[number];

/** Protection tiers for field definitions. */
export const fieldTierValues = ["indestructible", "default", "custom"] as const;
export type FieldTier = (typeof fieldTierValues)[number];

/** Where the field data lives. */
export const fieldSourceValues = ["column", "custom"] as const;
export type FieldSource = (typeof fieldSourceValues)[number];

/**
 * Zod schema for a single field definition.
 * Enforces: select/tags require options, relation requires related_entity.
 */
export const fieldDefinitionSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(fieldTypeValues),
    source: z.enum(fieldSourceValues),
    tier: z.enum(fieldTierValues),
    visible: z.boolean(),
    order: z.number().int().min(0),
    editable: z.boolean(),
    required: z.boolean(),
    width: z.number().int().positive().optional(),
    options: z.array(z.string()).optional(),
    related_entity: z.enum(["contacts", "companies", "deals"]).optional(),
  })
  .refine(
    (f) => {
      if (f.type === "select" || f.type === "tags") {
        return Array.isArray(f.options) && f.options.length > 0;
      }
      return true;
    },
    { message: "select and tags fields require a non-empty options array" },
  )
  .refine(
    (f) => {
      if (f.type === "relation") {
        return typeof f.related_entity === "string";
      }
      return true;
    },
    { message: "relation fields require a related_entity" },
  );

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

// ---------------------------------------------------------------------------
// Default field arrays — one per entity type.
// See design doc: docs/plans/2026-04-01-configurable-crm-columns-design.md
// ---------------------------------------------------------------------------

/** Contacts: default fields shipped with every new client. */
export const CONTACT_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true, width: 240 },
  { key: "emails", label: "Email", type: "email", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false, width: 220 },
  { key: "phones", label: "Phone", type: "phone", source: "column", tier: "default", visible: true, order: 2, editable: true, required: false, width: 160 },
  { key: "city", label: "City", type: "text", source: "column", tier: "default", visible: false, order: 3, editable: true, required: false, width: 160 },
  { key: "company_id", label: "Company", type: "relation", source: "column", tier: "default", visible: true, order: 4, editable: true, required: false, related_entity: "companies", width: 200 },
  { key: "job_title", label: "Job Title", type: "text", source: "column", tier: "default", visible: false, order: 5, editable: true, required: false, width: 180 },
  { key: "type", label: "Type", type: "select", source: "column", tier: "default", visible: true, order: 6, editable: true, required: false, options: ["buyer", "seller", "landlord", "tenant", "agent", "other"], width: 160 },
  { key: "linkedin", label: "Linkedin", type: "url", source: "column", tier: "default", visible: false, order: 7, editable: true, required: false, width: 200 },
  { key: "x_link", label: "X", type: "url", source: "column", tier: "default", visible: false, order: 8, editable: true, required: false, width: 160 },
  { key: "created_at", label: "Created", type: "date", source: "column", tier: "default", visible: false, order: 9, editable: false, required: false, width: 140 },
  { key: "updated_at", label: "Updated", type: "date", source: "column", tier: "default", visible: true, order: 10, editable: false, required: false, width: 140 },
  { key: "created_by", label: "Created by", type: "text", source: "column", tier: "default", visible: false, order: 11, editable: false, required: false, width: 160 },
];

/** Companies: default fields shipped with every new client. */
export const COMPANY_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: true, required: true, width: 240 },
  { key: "website", label: "Website", type: "url", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false, width: 200 },
  { key: "address", label: "Address", type: "text", source: "column", tier: "default", visible: true, order: 2, editable: true, required: false, width: 220 },
  { key: "phone", label: "Phone", type: "phone", source: "column", tier: "default", visible: true, order: 3, editable: true, required: false, width: 160 },
  { key: "email", label: "Email", type: "email", source: "column", tier: "default", visible: true, order: 4, editable: true, required: false, width: 220 },
  { key: "industry", label: "Industry", type: "select", source: "column", tier: "default", visible: true, order: 5, editable: true, required: false, options: ["property_agency", "insurance", "financial_services", "legal", "other"], width: 180 },
  { key: "linkedin", label: "Linkedin", type: "url", source: "column", tier: "default", visible: false, order: 6, editable: true, required: false, width: 200 },
  { key: "created_at", label: "Created", type: "date", source: "column", tier: "default", visible: false, order: 7, editable: false, required: false, width: 140 },
  { key: "updated_at", label: "Updated", type: "date", source: "column", tier: "default", visible: true, order: 8, editable: false, required: false, width: 140 },
];

/** Deals: default fields shipped with every new client. */
export const DEAL_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "text", source: "column", tier: "indestructible", visible: true, order: 0, editable: true, required: true, width: 240 },
  { key: "amount", label: "Amount", type: "currency", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false, width: 140 },
  { key: "close_date", label: "Close date", type: "date", source: "column", tier: "default", visible: false, order: 2, editable: true, required: false, width: 140 },
  { key: "stage", label: "Stage", type: "select", source: "column", tier: "default", visible: true, order: 3, editable: true, required: false, options: ["leads", "negotiation", "offer", "closing", "lost"], width: 160 },
  { key: "company_id", label: "Company", type: "relation", source: "column", tier: "default", visible: true, order: 4, editable: true, required: false, related_entity: "companies", width: 200 },
  { key: "point_of_contact", label: "Point of Contact", type: "relation", source: "column", tier: "default", visible: false, order: 5, editable: true, required: false, related_entity: "contacts", width: 200 },
  { key: "address", label: "Address", type: "text", source: "column", tier: "default", visible: true, order: 6, editable: true, required: false, width: 220 },
  { key: "created_at", label: "Created", type: "date", source: "column", tier: "default", visible: false, order: 7, editable: false, required: false, width: 140 },
  { key: "updated_at", label: "Updated", type: "date", source: "column", tier: "default", visible: true, order: 8, editable: false, required: false, width: 140 },
];
