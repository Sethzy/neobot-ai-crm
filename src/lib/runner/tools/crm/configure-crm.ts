/**
 * CRM configuration tool (available in setup mode and when config mode is active).
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
          "deal_label, company_label, deal_stages, contact_types, interaction_types, deal_contact_roles, company_industries, deal_custom_fields, contact_custom_fields, company_custom_fields, task_custom_fields",
        )
        .single();

      if (error || !data) {
        return { success: false as const, error: error?.message ?? "Failed to update CRM configuration." };
      }

      return {
        success: true as const,
        resolved_config: resolveCrmConfig(data as CrmConfigRow),
        message: "CRM configuration updated. Changes take effect on the next message.",
      };
    },
  });

  return { configure_crm };
}
