/**
 * Zod schemas for CRM persistence tables and insert payloads.
 * @module lib/crm/schemas
 */
import { z } from "zod";

import { customFieldDefinitionSchema } from "@/lib/crm/config";

/** ISO-8601 timestamp validator aligned with existing chat schemas. */
const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Recursive JSON value type used for JSONB columns in crm_config. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

/** Recursive JSON schema used to validate JSONB-shaped values. */
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

/** JSON object schema used for `custom_fields` JSONB columns. */
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

/** Valid contact type classifications for Singapore real estate contacts. */
export const contactTypeValues = [
  "buyer",
  "seller",
  "landlord",
  "tenant",
  "agent",
  "other",
] as const;

const configurableVocabularySchema = z.string().min(1);

/** Full `contacts` row validator. */
export const contactSchema = z.object({
  contact_id: z.string().uuid(),
  client_id: z.string().uuid(),
  company_id: z.string().uuid().nullable(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  type: configurableVocabularySchema,
  notes: z.string().nullable(),
  custom_fields: jsonObjectSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `contacts` (id/timestamps omitted). */
export const contactInsertSchema = z.object({
  client_id: z.string().uuid(),
  company_id: z.string().uuid().nullable().optional(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  type: configurableVocabularySchema,
  notes: z.string().nullable().optional(),
  custom_fields: jsonObjectSchema.optional(),
});

export type Contact = z.infer<typeof contactSchema>;
export type ContactInsert = z.infer<typeof contactInsertSchema>;

/** Default deal pipeline stages. */
export const dealStageValues = [
  "leads",
  "negotiation",
  "offer",
  "closing",
  "lost",
] as const;

/** Full `companies` row validator. */
export const companySchema = z.object({
  company_id: z.string().uuid(),
  client_id: z.string().uuid(),
  name: z.string().min(1),
  industry: configurableVocabularySchema.nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  custom_fields: jsonObjectSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `companies` (id/timestamps omitted). */
export const companyInsertSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  industry: configurableVocabularySchema.nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: jsonObjectSchema.optional(),
});

export type Company = z.infer<typeof companySchema>;
export type CompanyInsert = z.infer<typeof companyInsertSchema>;

/** Full `deals` row validator. */
export const dealSchema = z.object({
  deal_id: z.string().uuid(),
  client_id: z.string().uuid(),
  company_id: z.string().uuid().nullable(),
  address: z.string().min(1),
  stage: configurableVocabularySchema,
  amount: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
  custom_fields: jsonObjectSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `deals` (id/timestamps omitted). */
export const dealInsertSchema = z.object({
  client_id: z.string().uuid(),
  company_id: z.string().uuid().nullable().optional(),
  address: z.string().min(1),
  stage: configurableVocabularySchema.optional(),
  amount: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: jsonObjectSchema.optional(),
});

export type Deal = z.infer<typeof dealSchema>;
export type DealInsert = z.infer<typeof dealInsertSchema>;

/** Valid roles for contacts linked to a deal. */
export const dealContactRoleValues = [
  "buyer",
  "seller",
  "agent",
  "other",
] as const;

/** Full `deal_contacts` row validator. */
export const dealContactSchema = z.object({
  deal_contact_id: z.string().uuid(),
  client_id: z.string().uuid(),
  deal_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  role: configurableVocabularySchema,
  is_primary: z.boolean(),
  created_at: isoDateTimeSchema,
});

/** Insert payload validator for `deal_contacts` (id/created_at omitted). */
export const dealContactInsertSchema = z.object({
  client_id: z.string().uuid(),
  deal_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  role: configurableVocabularySchema.optional(),
  is_primary: z.boolean().optional(),
});

export type DealContact = z.infer<typeof dealContactSchema>;
export type DealContactInsert = z.infer<typeof dealContactInsertSchema>;

/** Valid interaction type classifications. */
export const interactionTypeValues = [
  "call",
  "meeting",
  "email",
  "message",
  "viewing",
  "note",
] as const;

/** Full `interactions` row validator. */
export const interactionSchema = z.object({
  interaction_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable(),
  type: configurableVocabularySchema,
  summary: z.string().nullable(),
  occurred_at: isoDateTimeSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `interactions` (id/timestamps omitted). */
export const interactionInsertSchema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable().optional(),
  type: configurableVocabularySchema,
  summary: z.string().nullable().optional(),
  occurred_at: isoDateTimeSchema,
});

export type Interaction = z.infer<typeof interactionSchema>;
export type InteractionInsert = z.infer<typeof interactionInsertSchema>;

/** CRM tasks use binary status only (not the broader agent task lifecycle). */
export const crmTaskStatusValues = ["open", "completed"] as const;

const crmTaskStatusSchema = z.enum(crmTaskStatusValues);

/** Full `crm_tasks` row validator. */
export const crmTaskSchema = z.object({
  task_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  deal_id: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: crmTaskStatusSchema,
  due_date: isoDateTimeSchema.nullable(),
  custom_fields: jsonObjectSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `crm_tasks` (id/timestamps omitted). */
export const crmTaskInsertSchema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: crmTaskStatusSchema.optional(),
  due_date: isoDateTimeSchema.nullable().optional(),
  custom_fields: jsonObjectSchema.optional(),
});

export type CrmTask = z.infer<typeof crmTaskSchema>;
export type CrmTaskInsert = z.infer<typeof crmTaskInsertSchema>;

/** Full `crm_config` row validator with strict JSONB value validation. */
export const crmConfigSchema = z.object({
  config_id: z.string().uuid(),
  client_id: z.string().uuid(),
  deal_label: z.string(),
  company_label: z.string(),
  deal_stages: jsonValueSchema.nullable(),
  contact_types: jsonValueSchema.nullable(),
  task_types: jsonValueSchema.nullable(),
  interaction_types: jsonValueSchema.nullable(),
  deal_contact_roles: jsonValueSchema.nullable(),
  company_industries: jsonValueSchema.nullable(),
  deal_custom_fields: z.array(customFieldDefinitionSchema),
  contact_custom_fields: z.array(customFieldDefinitionSchema),
  company_custom_fields: z.array(customFieldDefinitionSchema),
  task_custom_fields: z.array(customFieldDefinitionSchema),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `crm_config` (id/timestamps omitted). */
export const crmConfigInsertSchema = z.object({
  client_id: z.string().uuid(),
  deal_label: z.string().optional(),
  company_label: z.string().optional(),
  deal_stages: jsonValueSchema.nullable().optional(),
  contact_types: jsonValueSchema.nullable().optional(),
  task_types: jsonValueSchema.nullable().optional(),
  interaction_types: jsonValueSchema.nullable().optional(),
  deal_contact_roles: jsonValueSchema.nullable().optional(),
  company_industries: jsonValueSchema.nullable().optional(),
  deal_custom_fields: z.array(customFieldDefinitionSchema).optional(),
  contact_custom_fields: z.array(customFieldDefinitionSchema).optional(),
  company_custom_fields: z.array(customFieldDefinitionSchema).optional(),
  task_custom_fields: z.array(customFieldDefinitionSchema).optional(),
});

export type CrmConfig = z.infer<typeof crmConfigSchema>;
export type CrmConfigInsert = z.infer<typeof crmConfigInsertSchema>;
