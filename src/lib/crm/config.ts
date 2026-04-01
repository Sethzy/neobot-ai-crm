/**
 * CRM configurability helpers and runtime schemas.
 * @module lib/crm/config
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";
import {
  type FieldDefinition,
  fieldDefinitionSchema,
  CONTACT_DEFAULT_FIELDS,
  COMPANY_DEFAULT_FIELDS,
  DEAL_DEFAULT_FIELDS,
} from "./field-definitions";

/** Supported custom field data types for configurable CRM schemas. */
export const customFieldTypeValues = [
  "text",
  "number",
  "currency",
  "date",
  "select",
] as const;

/** Zod schema for one configurable CRM custom field definition. */
export const customFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(customFieldTypeValues),
  options: z.array(z.string().min(1)).min(1).optional(),
  required: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.type === "select" && (!value.options || value.options.length === 0)) {
    context.addIssue({
      code: "custom",
      message: "Select fields require at least one option.",
      path: ["options"],
    });
  }
});

export type CustomFieldDefinition = z.infer<typeof customFieldDefinitionSchema>;

/** Fully resolved CRM vocabulary + custom-field config used at runtime. */
export interface CrmVocabConfig {
  deal_label: string;
  company_label: string;
  deal_stages: string[];
  contact_types: string[];
  interaction_types: string[];
  deal_contact_roles: string[];
  company_industries: string[];
  deal_custom_fields: CustomFieldDefinition[];
  contact_custom_fields: CustomFieldDefinition[];
  company_custom_fields: CustomFieldDefinition[];
  task_custom_fields: CustomFieldDefinition[];
  contact_fields: FieldDefinition[];
  company_fields: FieldDefinition[];
  deal_fields: FieldDefinition[];
}

/** Loose DB row shape for crm_config before runtime normalization. */
export interface CrmConfigRow {
  deal_label: string | null;
  company_label: string | null;
  deal_stages: unknown;
  contact_types: unknown;
  interaction_types: unknown;
  deal_contact_roles: unknown;
  company_industries: unknown;
  deal_custom_fields: unknown;
  contact_custom_fields: unknown;
  company_custom_fields: unknown;
  task_custom_fields: unknown;
  contact_fields?: unknown;
  company_fields?: unknown;
  deal_fields?: unknown;
}

/** Real-estate defaults used when a client has not configured CRM vocab yet. */
export const CRM_DEFAULTS: CrmVocabConfig = {
  deal_label: "Deal",
  company_label: "Company",
  deal_stages: ["leads", "negotiation", "offer", "closing", "lost"],
  contact_types: ["buyer", "seller", "landlord", "tenant", "agent", "other"],
  interaction_types: ["call", "meeting", "email", "message", "viewing", "note"],
  deal_contact_roles: ["buyer", "seller", "agent", "other"],
  company_industries: [
    "property_agency",
    "developer",
    "law_firm",
    "bank",
    "government",
    "other",
  ],
  deal_custom_fields: [],
  contact_custom_fields: [],
  company_custom_fields: [],
  task_custom_fields: [],
  contact_fields: CONTACT_DEFAULT_FIELDS,
  company_fields: COMPANY_DEFAULT_FIELDS,
  deal_fields: DEAL_DEFAULT_FIELDS,
};

/** Removes duplicate entries from a string array (preserves first occurrence order). */
export function deduplicateStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const normalized = value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object" && "id" in item) {
        const rawId = (item as Record<string, unknown>).id;
        return typeof rawId === "string" ? rawId.trim() : "";
      }

      return "";
    })
    .filter((item): item is string => item.length > 0);

  if (normalized.length === 0) {
    return null;
  }

  return deduplicateStrings(normalized);
}

function parseCustomFields(value: unknown): CustomFieldDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const byKey = new Map<string, CustomFieldDefinition>();

  for (const item of value) {
    const parsed = customFieldDefinitionSchema.safeParse(item);

    if (!parsed.success) {
      continue;
    }

    byKey.set(parsed.data.key, parsed.data);
  }

  return Array.from(byKey.values());
}

/** Parses a stored field definition array, falling back to defaults on failure. */
function parseFieldArray(value: unknown, defaults: FieldDefinition[]): FieldDefinition[] {
  if (!Array.isArray(value) || value.length === 0) return defaults;
  try {
    return value.map((f) => fieldDefinitionSchema.parse(f));
  } catch {
    return defaults;
  }
}

/**
 * Resolves a raw crm_config row into runtime-safe CRM config.
 * Tolerates legacy object-array rows and malformed custom-field definitions.
 */
export function resolveCrmConfig(row: CrmConfigRow | null): CrmVocabConfig {
  if (!row) {
    return { ...CRM_DEFAULTS };
  }

  return {
    deal_label: row.deal_label?.trim() || CRM_DEFAULTS.deal_label,
    company_label: row.company_label?.trim() || CRM_DEFAULTS.company_label,
    deal_stages: parseStringArray(row.deal_stages) ?? CRM_DEFAULTS.deal_stages,
    contact_types: parseStringArray(row.contact_types) ?? CRM_DEFAULTS.contact_types,
    interaction_types: parseStringArray(row.interaction_types) ?? CRM_DEFAULTS.interaction_types,
    deal_contact_roles: parseStringArray(row.deal_contact_roles) ?? CRM_DEFAULTS.deal_contact_roles,
    company_industries: parseStringArray(row.company_industries) ?? CRM_DEFAULTS.company_industries,
    deal_custom_fields: parseCustomFields(row.deal_custom_fields),
    contact_custom_fields: parseCustomFields(row.contact_custom_fields),
    company_custom_fields: parseCustomFields(row.company_custom_fields),
    task_custom_fields: parseCustomFields(row.task_custom_fields),
    contact_fields: parseFieldArray(row.contact_fields, CONTACT_DEFAULT_FIELDS),
    company_fields: parseFieldArray(row.company_fields, COMPANY_DEFAULT_FIELDS),
    deal_fields: parseFieldArray(row.deal_fields, DEAL_DEFAULT_FIELDS),
  };
}

function buildConfiguredFieldSchema(
  field: CustomFieldDefinition,
  mode: "create" | "update",
): z.ZodTypeAny {
  const baseSchema = (() => {
    switch (field.type) {
      case "select":
        return z.enum(field.options as [string, ...string[]]);
      case "number":
      case "currency":
        return z.number();
      case "date":
        return z.string().date();
      default:
        return z.string();
    }
  })();

  if (mode === "update") {
    return baseSchema.nullable().optional();
  }

  if (field.required) {
    return baseSchema;
  }

  return baseSchema.nullable().optional();
}

/**
 * Builds the tool-input schema for configured custom fields.
 * Unknown keys are rejected so writes stay aligned with the stored definitions.
 */
export function buildCustomFieldsSchema(
  definitions: CustomFieldDefinition[],
  mode: "create" | "update" = "create",
) {
  if (definitions.length === 0) {
    return z.strictObject({});
  }

  const shape = Object.fromEntries(
    definitions.map((field) => [field.key, buildConfiguredFieldSchema(field, mode)]),
  );

  return z.strictObject(shape);
}

/**
 * Loads the current client's CRM config and whether an explicit row exists.
 * Defaults are returned when the config row is absent or unreadable.
 */
export async function loadCrmConfig(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<{ config: CrmVocabConfig; hasConfig: boolean }> {
  const { data, error } = await supabase
    .from("crm_config")
    .select(
      "deal_label, company_label, deal_stages, contact_types, interaction_types, deal_contact_roles, company_industries, deal_custom_fields, contact_custom_fields, company_custom_fields, task_custom_fields",
    )
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data) {
    return {
      config: { ...CRM_DEFAULTS },
      hasConfig: false,
    };
  }

  return {
    config: resolveCrmConfig(data as CrmConfigRow),
    hasConfig: true,
  };
}
