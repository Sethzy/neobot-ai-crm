/**
 * Zod schemas for CRM persistence tables and insert payloads.
 * @module lib/crm/schemas
 */
import { z } from "zod";

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

/** Valid contact type classifications for Singapore real estate contacts. */
export const contactTypeValues = [
  "buyer",
  "seller",
  "landlord",
  "tenant",
  "agent",
  "other",
] as const;

const contactTypeSchema = z.enum(contactTypeValues);

/** Full `contacts` row validator. */
export const contactSchema = z.object({
  contact_id: z.string().uuid(),
  client_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  type: contactTypeSchema,
  notes: z.string().nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `contacts` (id/timestamps omitted). */
export const contactInsertSchema = z.object({
  client_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  type: contactTypeSchema,
  notes: z.string().nullable().optional(),
});

export type Contact = z.infer<typeof contactSchema>;
export type ContactInsert = z.infer<typeof contactInsertSchema>;

/** Default deal pipeline stages. */
export const dealStageValues = [
  "leads",
  "viewing",
  "offer",
  "negotiation",
  "otp",
  "completion",
  "lost",
] as const;

const dealStageSchema = z.enum(dealStageValues);

/** Full `deals` row validator. */
export const dealSchema = z.object({
  deal_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  address: z.string().min(1),
  stage: dealStageSchema,
  price: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `deals` (id/timestamps omitted). */
export const dealInsertSchema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  address: z.string().min(1),
  stage: dealStageSchema.optional(),
  price: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type Deal = z.infer<typeof dealSchema>;
export type DealInsert = z.infer<typeof dealInsertSchema>;

/** Valid interaction type classifications. */
export const interactionTypeValues = [
  "call",
  "meeting",
  "email",
  "message",
  "viewing",
  "note",
] as const;

const interactionTypeSchema = z.enum(interactionTypeValues);

/** Full `interactions` row validator. */
export const interactionSchema = z.object({
  interaction_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable(),
  type: interactionTypeSchema,
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
  type: interactionTypeSchema,
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
});

export type CrmTask = z.infer<typeof crmTaskSchema>;
export type CrmTaskInsert = z.infer<typeof crmTaskInsertSchema>;

/** Full `crm_config` row validator with strict JSONB value validation. */
export const crmConfigSchema = z.object({
  config_id: z.string().uuid(),
  client_id: z.string().uuid(),
  deal_stages: jsonValueSchema.nullable(),
  task_types: jsonValueSchema.nullable(),
  interaction_types: jsonValueSchema.nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `crm_config` (id/timestamps omitted). */
export const crmConfigInsertSchema = z.object({
  client_id: z.string().uuid(),
  deal_stages: jsonValueSchema.nullable().optional(),
  task_types: jsonValueSchema.nullable().optional(),
  interaction_types: jsonValueSchema.nullable().optional(),
});

export type CrmConfig = z.infer<typeof crmConfigSchema>;
export type CrmConfigInsert = z.infer<typeof crmConfigInsertSchema>;
