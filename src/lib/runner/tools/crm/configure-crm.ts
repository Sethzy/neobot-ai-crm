/**
 * CRM configuration tool.
 * @module lib/runner/tools/crm/configure-crm
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  customFieldDefinitionSchema,
  deduplicateStrings,
  loadCrmConfig,
  resolveCrmConfig,
  type CrmConfigRow,
} from "@/lib/crm/config";
import {
  type FieldDefinition,
  fieldDefinitionSchema,
  CONTACT_DEFAULT_FIELDS,
  COMPANY_DEFAULT_FIELDS,
  DEAL_DEFAULT_FIELDS,
} from "@/lib/crm/field-definitions";
import type { Database } from "@/types/database";

const vocabularyFieldSchema = z.array(z.string().trim().min(2)).min(1).max(30);

/** Creates a Zod schema for custom field definition arrays that rejects duplicate keys. */
function uniqueKeyCustomFieldsSchema(pathLabel: string) {
  return z.array(customFieldDefinitionSchema)
    .superRefine((definitions, context) => {
      const seenKeys = new Set<string>();
      for (const definition of definitions) {
        if (seenKeys.has(definition.key)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate custom field key "${definition.key}".`,
            path: [pathLabel],
          });
        }
        seenKeys.add(definition.key);
      }
    });
}

const dealCustomFieldsSchema = uniqueKeyCustomFieldsSchema("deal_custom_fields");
const contactCustomFieldsSchema = uniqueKeyCustomFieldsSchema("contact_custom_fields");
const companyCustomFieldsSchema = uniqueKeyCustomFieldsSchema("company_custom_fields");
const taskCustomFieldsSchema = uniqueKeyCustomFieldsSchema("task_custom_fields");

const inputSchema = z.object({
  deal_label: z.string().trim().min(1).optional()
    .describe("Display label for deals such as Policy, Opportunity, or Deal."),
  company_label: z.string().trim().min(1).optional()
    .describe("Display label for companies such as Company, Account, or Brokerage."),
  deal_stages: vocabularyFieldSchema.optional()
    .describe("Ordered deal stages such as lead, quoted, bound, lost."),
  contact_types: vocabularyFieldSchema.optional()
    .describe("Available contact classifications such as buyer, seller, prospect."),
  company_industries: vocabularyFieldSchema.optional()
    .describe("Available company classifications such as developer, bank, or law_firm."),
  interaction_types: vocabularyFieldSchema.optional()
    .describe("Available interaction types such as call, meeting, email, note."),
  deal_contact_roles: vocabularyFieldSchema.optional()
    .describe("Roles a contact can hold on a deal such as buyer, seller, agent."),
  deal_custom_fields: dealCustomFieldsSchema.optional()
    .describe("Custom field definitions for deals."),
  contact_custom_fields: contactCustomFieldsSchema.optional()
    .describe("Custom field definitions for contacts."),
  company_custom_fields: companyCustomFieldsSchema.optional()
    .describe("Custom field definitions for companies."),
  task_custom_fields: taskCustomFieldsSchema.optional()
    .describe("Custom field definitions for CRM tasks."),
  contact_fields: z.array(fieldDefinitionSchema).optional()
    .describe("Full contact field definitions array. Include ALL fields (defaults + custom). Omitting a custom field removes it."),
  company_fields: z.array(fieldDefinitionSchema).optional()
    .describe("Full company field definitions array."),
  deal_fields: z.array(fieldDefinitionSchema).optional()
    .describe("Full deal field definitions array."),
  confirm_removals: z.boolean().optional()
    .describe("Set true to confirm removing values or custom fields that existing records still use."),
});

const vocabularyEntityMap = {
  deal_stages: { table: "deals", column: "stage" },
  contact_types: { table: "contacts", column: "type" },
  company_industries: { table: "companies", column: "industry" },
  interaction_types: { table: "interactions", column: "type" },
  deal_contact_roles: { table: "deal_contacts", column: "role" },
} as const;

const customFieldEntityMap = {
  deal_custom_fields: "deals",
  contact_custom_fields: "contacts",
  company_custom_fields: "companies",
  task_custom_fields: "crm_tasks",
} as const;

type VocabularyFieldName = keyof typeof vocabularyEntityMap;
type CustomFieldConfigName = keyof typeof customFieldEntityMap;

function isPopulatedCustomFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

async function checkVocabularyRemovals(
  supabase: SupabaseClient<Database>,
  clientId: string,
  fieldName: VocabularyFieldName,
  currentValues: string[],
  nextValues: string[],
): Promise<Record<string, number>> {
  const removedValues = currentValues.filter((value) => !nextValues.includes(value));
  if (removedValues.length === 0) {
    return {};
  }

  const { table, column } = vocabularyEntityMap[fieldName];
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .eq("client_id", clientId)
    .in(column, removedValues);

  if (error || !Array.isArray(data)) {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const row of data) {
    const value = (row as unknown as Record<string, string>)[column];
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

async function checkCustomFieldDefinitionRemovals(
  supabase: SupabaseClient<Database>,
  clientId: string,
  fieldName: CustomFieldConfigName,
  currentKeys: string[],
  nextKeys: string[],
): Promise<Record<string, number>> {
  const removedKeys = currentKeys.filter((key) => !nextKeys.includes(key));
  if (removedKeys.length === 0) {
    return {};
  }

  const table = customFieldEntityMap[fieldName];
  const { data, error } = await supabase
    .from(table)
    .select("custom_fields")
    .eq("client_id", clientId);

  if (error || !Array.isArray(data)) {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const removedKey of removedKeys) {
    const count = data.filter((row) => {
      if (!row || typeof row !== "object") {
        return false;
      }

      const customFields = (row as Record<string, unknown>).custom_fields;
      if (!customFields || typeof customFields !== "object") {
        return false;
      }

      return isPopulatedCustomFieldValue((customFields as Record<string, unknown>)[removedKey]);
    }).length;

    if (count > 0) {
      counts[removedKey] = count;
    }
  }

  return counts;
}

/** Default field arrays per entity, used for tier enforcement validation. */
const defaultFieldsByEntity: Record<string, FieldDefinition[]> = {
  contact_fields: CONTACT_DEFAULT_FIELDS,
  company_fields: COMPANY_DEFAULT_FIELDS,
  deal_fields: DEAL_DEFAULT_FIELDS,
};

/**
 * Validate field array changes against tier rules.
 * Uses the CANONICAL tier from defaults — never trusts the incoming payload's tier.
 * Returns error message if invalid, null if OK.
 */
function validateFieldChanges(
  incoming: FieldDefinition[],
  defaults: FieldDefinition[],
  entityName: string,
): string | null {
  const defaultsByKey = new Map(defaults.map((d) => [d.key, d]));

  for (const field of incoming) {
    // Look up canonical tier from defaults; fall back to incoming tier for custom fields
    const canonical = defaultsByKey.get(field.key);
    const effectiveTier = canonical ? canonical.tier : field.tier;

    if (effectiveTier === "indestructible" && !field.visible) {
      return `Cannot hide indestructible field "${field.label}" on ${entityName}`;
    }
  }

  const defaultKeys = new Set(defaults.filter((f) => f.tier !== "custom").map((f) => f.key));
  const incomingKeys = new Set(incoming.map((f) => f.key));
  for (const key of defaultKeys) {
    if (!incomingKeys.has(key)) {
      return `Cannot delete default field "${key}" on ${entityName}. You can hide it instead.`;
    }
  }

  for (const field of incoming) {
    const original = defaultsByKey.get(field.key);
    if (original && original.tier !== "custom") {
      if (field.type !== original.type) return `Cannot change type of default field "${field.key}"`;
      if (field.source !== original.source) return `Cannot change source of default field "${field.key}"`;
    }
  }

  // Overwrite tier on incoming fields to match canonical defaults (prevents tier spoofing)
  for (const field of incoming) {
    const canonical = defaultsByKey.get(field.key);
    if (canonical) {
      field.tier = canonical.tier;
    }
  }

  return null;
}

/** Maps vocabulary config keys to the CRM entity type used in saved views. */
const vocabToViewEntity: Partial<Record<VocabularyFieldName, { entityType: string; filterKey: string }>> = {
  deal_stages: { entityType: "deals", filterKey: "stage" },
  contact_types: { entityType: "contacts", filterKey: "type" },
  company_industries: { entityType: "companies", filterKey: "industry" },
};

interface AffectedView {
  name: string;
  entity_type: string;
  view_id: string;
  affectedKeys: string[];
}

/**
 * Checks if vocabulary changes would invalidate any saved view filters.
 * Returns views whose filters reference values being removed.
 */
async function checkAffectedViews(
  supabase: SupabaseClient<Database>,
  clientId: string,
  updates: Partial<z.infer<typeof inputSchema>>,
  currentConfig: ReturnType<typeof resolveCrmConfig>,
): Promise<AffectedView[]> {
  const affected: AffectedView[] = [];

  for (const [vocabKey, mapping] of Object.entries(vocabToViewEntity)) {
    const nextValues = updates[vocabKey as VocabularyFieldName];
    if (!nextValues) continue;

    const currentValues = currentConfig[vocabKey as VocabularyFieldName] as string[];
    const removedValues = currentValues.filter((v) => !nextValues.includes(v));
    if (removedValues.length === 0) continue;

    // Fetch saved views for this entity type
    const { data: views } = await supabase
      .from("crm_views")
      .select("view_id, name, entity_type, filters")
      .eq("client_id", clientId)
      .eq("entity_type", mapping.entityType);

    if (!views) continue;

    for (const view of views) {
      const filters = view.filters as Record<string, unknown> | null;
      if (!filters) continue;

      const filterValue = filters[mapping.filterKey];
      if (filterValue === undefined) continue;

      // Check if the filter references any removed values
      const referencedValues = Array.isArray(filterValue) ? filterValue : [filterValue];
      const broken = referencedValues.some((v) => removedValues.includes(String(v)));

      if (broken) {
        affected.push({
          name: view.name,
          entity_type: view.entity_type,
          view_id: view.view_id,
          affectedKeys: [mapping.filterKey],
        });
      }
    }
  }

  return affected;
}

/**
 * Creates the configure_crm tool for explicit setup/reconfiguration flows.
 */
export function createConfigureCrmTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const configure_crm = tool({
    description:
      "Update CRM vocabulary and custom field definitions for the current client. " +
      "Accepts partial updates and always returns the fully resolved resulting config. " +
      "If requested removals would affect existing records, it returns a warning instead. " +
      "Re-call with confirm_removals: true to proceed. " +
      "Data Modification Warning: Only use this after the user has explicitly asked to configure or reconfigure CRM.",
    inputSchema,
    execute: async ({ confirm_removals, ...input }) => {
      const updates = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ) as Partial<z.infer<typeof inputSchema>>;

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update." };
      }

      // Validate field array tier rules before any DB work
      for (const fieldKey of ["contact_fields", "company_fields", "deal_fields"] as const) {
        if (updates[fieldKey]) {
          const defaults = defaultFieldsByEntity[fieldKey];
          const validationError = validateFieldChanges(updates[fieldKey]!, defaults, fieldKey);
          if (validationError) {
            return { success: false as const, error: validationError };
          }
        }
      }

      for (const key of Object.keys(vocabularyEntityMap) as VocabularyFieldName[]) {
        if (updates[key]) {
          updates[key] = deduplicateStrings(updates[key]);
        }
      }

      const { config: currentConfig } = await loadCrmConfig(supabase, clientId);

      if (!confirm_removals) {
        const inUseValues: Partial<Record<VocabularyFieldName, Record<string, number>>> = {};
        const inUseCustomFields:
          Partial<Record<CustomFieldConfigName, Record<string, number>>> = {};

        // Run all removal checks in parallel (independent DB queries)
        const vocabChecks = (Object.keys(vocabularyEntityMap) as VocabularyFieldName[])
          .filter((key) => updates[key])
          .map(async (key) => {
            const counts = await checkVocabularyRemovals(
              supabase, clientId, key, currentConfig[key], updates[key]!,
            );
            if (Object.keys(counts).length > 0) {
              inUseValues[key] = counts;
            }
          });

        const customFieldChecks = (Object.keys(customFieldEntityMap) as CustomFieldConfigName[])
          .filter((key) => updates[key])
          .map(async (key) => {
            const counts = await checkCustomFieldDefinitionRemovals(
              supabase, clientId, key,
              currentConfig[key].map((field) => field.key),
              updates[key]!.map((field) => field.key),
            );
            if (Object.keys(counts).length > 0) {
              inUseCustomFields[key] = counts;
            }
          });

        await Promise.all([...vocabChecks, ...customFieldChecks]);

        if (Object.keys(inUseValues).length > 0) {
          return {
            success: false as const,
            reason: "values_in_use" as const,
            in_use_values: inUseValues,
            message: "Some vocabulary values are still used by existing records. Re-call with confirm_removals: true to proceed.",
          };
        }

        if (Object.keys(inUseCustomFields).length > 0) {
          return {
            success: false as const,
            reason: "custom_fields_in_use" as const,
            in_use_custom_fields: inUseCustomFields,
            message: "Some custom fields still contain stored values. Re-call with confirm_removals: true to proceed.",
          };
        }
      }

      // Check if vocabulary changes would break any saved views
      const affectedViews = await checkAffectedViews(
        supabase, clientId, updates, currentConfig,
      );
      if (affectedViews.length > 0) {
        const warnings = affectedViews.map(
          (v) => `"${v.name}" (${v.entity_type}) filters on ${v.affectedKeys.join(", ")}`,
        );

        // Non-blocking: include warning in the response but don't prevent the update
        // The agent should offer to update or delete the affected views after applying config
        (updates as Record<string, unknown>).__viewWarnings = warnings;
      }

      // Snapshot current config to history before writing (same pattern as PATCH route)
      if (currentConfig) {
        const { data: currentRow } = await supabase
          .from("crm_config")
          .select("*")
          .eq("client_id", clientId)
          .maybeSingle();

        if (currentRow) {
          await supabase.from("crm_config_history").insert({
            client_id: clientId,
            config_snapshot: currentRow,
          });

          // Trim to last 20 versions
          const { data: history } = await supabase
            .from("crm_config_history")
            .select("id")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false });

          if (history && history.length > 20) {
            const idsToDelete = history.slice(20).map((h: { id: string }) => h.id);
            await supabase.from("crm_config_history").delete().in("id", idsToDelete);
          }
        }
      }

      const { data, error } = await supabase
        .from("crm_config")
        .upsert(
          {
            client_id: clientId,
            ...updates,
          },
          { onConflict: "client_id" },
        )
        .select(
          "deal_label, company_label, deal_stages, contact_types, interaction_types, deal_contact_roles, company_industries, deal_custom_fields, contact_custom_fields, company_custom_fields, task_custom_fields, contact_fields, company_fields, deal_fields",
        )
        .single();

      if (error || !data) {
        return { success: false as const, error: error?.message ?? "Failed to update CRM configuration." };
      }

      const viewWarnings = (updates as Record<string, unknown>).__viewWarnings as string[] | undefined;
      delete (updates as Record<string, unknown>).__viewWarnings;

      return {
        success: true as const,
        resolved_config: resolveCrmConfig(data as CrmConfigRow),
        message: "CRM configuration updated. Changes take effect on the next message.",
        ...(viewWarnings && viewWarnings.length > 0 ? {
          affected_saved_views: viewWarnings,
          view_warning: `${viewWarnings.length} saved view(s) may now return incorrect results because they filter on values you just changed. Consider updating or deleting them with manage_views.`,
        } : {}),
      };
    },
  });

  return { configure_crm };
}
