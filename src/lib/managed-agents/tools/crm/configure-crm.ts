/**
 * CRM configuration tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/configure-crm
 */
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

import type { ManagedAgentTool, ToolContext } from "../types";

const vocabularyFieldSchema = z.array(z.string().trim().min(2)).min(1).max(30);

function uniqueKeyCustomFieldsSchema(pathLabel: string) {
  return z.array(customFieldDefinitionSchema).superRefine((definitions, refineContext) => {
    const seenKeys = new Set<string>();
    for (const definition of definitions) {
      if (seenKeys.has(definition.key)) {
        refineContext.addIssue({
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
  deal_label: z.string().trim().min(1).optional().describe("Display label for deals such as Policy, Opportunity, or Deal."),
  company_label: z.string().trim().min(1).optional().describe("Display label for companies such as Company, Account, or Brokerage."),
  deal_stages: vocabularyFieldSchema.optional().describe("Ordered deal stages such as lead, quoted, bound, lost."),
  contact_types: vocabularyFieldSchema.optional().describe("Available contact classifications such as buyer, seller, prospect."),
  company_industries: vocabularyFieldSchema.optional().describe("Available company classifications such as developer, bank, or law_firm."),
  interaction_types: vocabularyFieldSchema.optional().describe("Available interaction types such as call, meeting, email, note."),
  deal_contact_roles: vocabularyFieldSchema.optional().describe("Roles a contact can hold on a deal such as buyer, seller, agent."),
  deal_custom_fields: dealCustomFieldsSchema.optional().describe("Custom field definitions for deals."),
  contact_custom_fields: contactCustomFieldsSchema.optional().describe("Custom field definitions for contacts."),
  company_custom_fields: companyCustomFieldsSchema.optional().describe("Custom field definitions for companies."),
  task_custom_fields: taskCustomFieldsSchema.optional().describe("Custom field definitions for CRM tasks."),
  contact_fields: z.array(fieldDefinitionSchema).optional().describe("Full contact field definitions array. Include ALL fields (defaults + custom). Omitting a custom field removes it."),
  company_fields: z.array(fieldDefinitionSchema).optional().describe("Full company field definitions array."),
  deal_fields: z.array(fieldDefinitionSchema).optional().describe("Full deal field definitions array."),
  confirm_removals: z.boolean().optional().describe("Set true to confirm removing values or custom fields that existing records still use."),
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
  context: ToolContext,
  fieldName: VocabularyFieldName,
  currentValues: string[],
  nextValues: string[],
): Promise<Record<string, number>> {
  const removedValues = currentValues.filter((value) => !nextValues.includes(value));
  if (removedValues.length === 0) {
    return {};
  }

  const { table, column } = vocabularyEntityMap[fieldName];
  const { data, error } = await context.supabase
    .from(table)
    .select(column)
    .eq("client_id", context.clientId)
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
  context: ToolContext,
  fieldName: CustomFieldConfigName,
  currentKeys: string[],
  nextKeys: string[],
): Promise<Record<string, number>> {
  const removedKeys = currentKeys.filter((key) => !nextKeys.includes(key));
  if (removedKeys.length === 0) {
    return {};
  }

  const table = customFieldEntityMap[fieldName];
  const { data, error } = await context.supabase
    .from(table)
    .select("custom_fields")
    .eq("client_id", context.clientId);

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

const defaultFieldsByEntity: Record<string, FieldDefinition[]> = {
  contact_fields: CONTACT_DEFAULT_FIELDS,
  company_fields: COMPANY_DEFAULT_FIELDS,
  deal_fields: DEAL_DEFAULT_FIELDS,
};

function validateFieldChanges(
  incoming: FieldDefinition[],
  defaults: FieldDefinition[],
  entityName: string,
): string | null {
  const defaultsByKey = new Map(defaults.map((definition) => [definition.key, definition]));

  for (const field of incoming) {
    const canonical = defaultsByKey.get(field.key);
    const effectiveTier = canonical ? canonical.tier : field.tier;

    if (effectiveTier === "indestructible" && !field.visible) {
      return `Cannot hide indestructible field "${field.label}" on ${entityName}`;
    }
  }

  const defaultKeys = new Set(defaults.filter((field) => field.tier !== "custom").map((field) => field.key));
  const incomingKeys = new Set(incoming.map((field) => field.key));
  for (const key of defaultKeys) {
    if (!incomingKeys.has(key)) {
      return `Cannot delete default field "${key}" on ${entityName}. You can hide it instead.`;
    }
  }

  for (const field of incoming) {
    const original = defaultsByKey.get(field.key);
    if (original && original.tier !== "custom") {
      if (field.type !== original.type) {
        return `Cannot change type of default field "${field.key}"`;
      }
      if (field.source !== original.source) {
        return `Cannot change source of default field "${field.key}"`;
      }
    }
  }

  for (const field of incoming) {
    const canonical = defaultsByKey.get(field.key);
    if (canonical) {
      field.tier = canonical.tier;
    }
  }

  return null;
}

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

async function checkAffectedViews(
  context: ToolContext,
  updates: Partial<z.infer<typeof inputSchema>>,
  currentConfig: ReturnType<typeof resolveCrmConfig>,
): Promise<AffectedView[]> {
  const affected: AffectedView[] = [];

  for (const [vocabKey, mapping] of Object.entries(vocabToViewEntity)) {
    const nextValues = updates[vocabKey as VocabularyFieldName];
    if (!nextValues) {
      continue;
    }

    const currentValues = currentConfig[vocabKey as VocabularyFieldName] as string[];
    const removedValues = currentValues.filter((value) => !nextValues.includes(value));
    if (removedValues.length === 0) {
      continue;
    }

    const { data: views } = await context.supabase
      .from("crm_views")
      .select("view_id, name, entity_type, filters")
      .eq("client_id", context.clientId)
      .eq("entity_type", mapping.entityType);

    if (!views) {
      continue;
    }

    for (const view of views) {
      const filters = view.filters as Record<string, unknown> | null;
      if (!filters) {
        continue;
      }

      const filterValue = filters[mapping.filterKey];
      if (filterValue === undefined) {
        continue;
      }

      const referencedValues = Array.isArray(filterValue) ? filterValue : [filterValue];
      const broken = referencedValues.some((value) => removedValues.includes(String(value)));

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

type ConfigureCrmInput = z.infer<typeof inputSchema>;
type ConfigureCrmResult =
  | { success: false; error: string }
  | {
      success: false;
      reason: "values_in_use";
      in_use_values: Partial<Record<VocabularyFieldName, Record<string, number>>>;
      message: string;
    }
  | {
      success: false;
      reason: "custom_fields_in_use";
      in_use_custom_fields: Partial<Record<CustomFieldConfigName, Record<string, number>>>;
      message: string;
    }
  | {
      success: true;
      resolved_config: ReturnType<typeof resolveCrmConfig>;
      message: string;
      affected_saved_views?: string[];
      view_warning?: string;
    };

export const configureCrmTool: ManagedAgentTool<ConfigureCrmInput, ConfigureCrmResult> = {
  name: "configure_crm",
  description:
    "Update CRM vocabulary and custom field definitions for the current client. " +
    "Accepts partial updates and always returns the fully resolved resulting config. " +
    "If requested removals would affect existing records, it returns a warning instead. " +
    "Re-call with confirm_removals: true to proceed. " +
    "Data Modification Warning: Only use this after the user has explicitly asked to configure or reconfigure CRM. " +
    "Requires user approval before execution.",
  inputSchema,
  execute: async ({ confirm_removals, ...input }, context) => {
    const updates = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Partial<z.infer<typeof inputSchema>>;

    if (Object.keys(updates).length === 0) {
      return { success: false as const, error: "No fields to update." };
    }

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

    const { config: currentConfig } = await loadCrmConfig(context.supabase, context.clientId);

    if (!confirm_removals) {
      const inUseValues: Partial<Record<VocabularyFieldName, Record<string, number>>> = {};
      const inUseCustomFields: Partial<Record<CustomFieldConfigName, Record<string, number>>> = {};

      const vocabChecks = (Object.keys(vocabularyEntityMap) as VocabularyFieldName[])
        .filter((key) => updates[key])
        .map(async (key) => {
          const counts = await checkVocabularyRemovals(
            context,
            key,
            currentConfig[key],
            updates[key]!,
          );
          if (Object.keys(counts).length > 0) {
            inUseValues[key] = counts;
          }
        });

      const customFieldChecks = (Object.keys(customFieldEntityMap) as CustomFieldConfigName[])
        .filter((key) => updates[key])
        .map(async (key) => {
          const counts = await checkCustomFieldDefinitionRemovals(
            context,
            key,
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

    const affectedViews = await checkAffectedViews(context, updates, currentConfig);
    if (affectedViews.length > 0) {
      const warnings = affectedViews.map(
        (view) => `"${view.name}" (${view.entity_type}) filters on ${view.affectedKeys.join(", ")}`,
      );
      (updates as Record<string, unknown>).__viewWarnings = warnings;
    }

    if (currentConfig) {
      const { data: currentRow } = await context.supabase
        .from("crm_config")
        .select("*")
        .eq("client_id", context.clientId)
        .maybeSingle();

      if (currentRow) {
        await context.supabase.from("crm_config_history").insert({
          client_id: context.clientId,
          config_snapshot: currentRow,
        });

        const { data: history } = await context.supabase
          .from("crm_config_history")
          .select("id")
          .eq("client_id", context.clientId)
          .order("created_at", { ascending: false });

        if (history && history.length > 20) {
          const idsToDelete = history.slice(20).map((historyRow: { id: string }) => historyRow.id);
          await context.supabase
            .from("crm_config_history")
            .delete()
            .eq("client_id", context.clientId)
            .in("id", idsToDelete);
        }
      }
    }

    const { data, error } = await context.supabase
      .from("crm_config")
      .upsert(
        {
          client_id: context.clientId,
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
      ...(viewWarnings && viewWarnings.length > 0
        ? {
            affected_saved_views: viewWarnings,
            view_warning: `${viewWarnings.length} saved view(s) may now return incorrect results because they filter on values you just changed. Consider updating or deleting them with manage_views.`,
          }
        : {}),
    };
  },
};
