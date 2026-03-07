/**
 * Setup-mode-only CRM configuration tool.
 * @module lib/runner/tools/crm/configure-crm
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  customFieldDefinitionSchema,
  loadCrmConfig,
  resolveCrmConfig,
  type CrmConfigRow,
} from "@/lib/crm/config";
import type { Database } from "@/types/database";

const vocabularyFieldSchema = z.array(z.string().trim().min(2)).min(1).max(30);

const dealCustomFieldsSchema = z.array(customFieldDefinitionSchema)
  .superRefine((definitions, context) => {
    const seenKeys = new Set<string>();

    for (const definition of definitions) {
      if (seenKeys.has(definition.key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate custom field key "${definition.key}".`,
          path: ["deal_custom_fields"],
        });
      }

      seenKeys.add(definition.key);
    }
  });

const contactCustomFieldsSchema = z.array(customFieldDefinitionSchema)
  .superRefine((definitions, context) => {
    const seenKeys = new Set<string>();

    for (const definition of definitions) {
      if (seenKeys.has(definition.key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate custom field key "${definition.key}".`,
          path: ["contact_custom_fields"],
        });
      }

      seenKeys.add(definition.key);
    }
  });

const taskCustomFieldsSchema = z.array(customFieldDefinitionSchema)
  .superRefine((definitions, context) => {
    const seenKeys = new Set<string>();

    for (const definition of definitions) {
      if (seenKeys.has(definition.key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate custom field key "${definition.key}".`,
          path: ["task_custom_fields"],
        });
      }

      seenKeys.add(definition.key);
    }
  });

const inputSchema = z.object({
  deal_label: z.string().trim().min(1).optional()
    .describe("Display label for deals such as Policy, Opportunity, or Deal."),
  deal_stages: vocabularyFieldSchema.optional()
    .describe("Ordered deal stages such as lead, quoted, bound, lost."),
  contact_types: vocabularyFieldSchema.optional()
    .describe("Available contact classifications such as buyer, seller, prospect."),
  interaction_types: vocabularyFieldSchema.optional()
    .describe("Available interaction types such as call, meeting, email, note."),
  deal_contact_roles: vocabularyFieldSchema.optional()
    .describe("Roles a contact can hold on a deal such as buyer, seller, agent."),
  deal_custom_fields: dealCustomFieldsSchema.optional()
    .describe("Custom field definitions for deals."),
  contact_custom_fields: contactCustomFieldsSchema.optional()
    .describe("Custom field definitions for contacts."),
  task_custom_fields: taskCustomFieldsSchema.optional()
    .describe("Custom field definitions for CRM tasks."),
  confirm_removals: z.boolean().optional()
    .describe("Set true to confirm removing values or custom fields that existing records still use."),
});

const vocabularyEntityMap = {
  deal_stages: { table: "deals", column: "stage" },
  contact_types: { table: "contacts", column: "type" },
  interaction_types: { table: "interactions", column: "type" },
  deal_contact_roles: { table: "deal_contacts", column: "role" },
} as const;

const customFieldEntityMap = {
  deal_custom_fields: "deals",
  contact_custom_fields: "contacts",
  task_custom_fields: "crm_tasks",
} as const;

type VocabularyFieldName = keyof typeof vocabularyEntityMap;
type CustomFieldConfigName = keyof typeof customFieldEntityMap;

function deduplicateStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

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
    .eq("client_id", clientId);

  if (error || !Array.isArray(data)) {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const removedValue of removedValues) {
    const count = data.filter((row) => {
      if (!row || typeof row !== "object") {
        return false;
      }

      return (row as Record<string, unknown>)[column] === removedValue;
    }).length;

    if (count > 0) {
      counts[removedValue] = count;
    }
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

      if (updates.deal_stages) {
        updates.deal_stages = deduplicateStrings(updates.deal_stages);
      }

      if (updates.contact_types) {
        updates.contact_types = deduplicateStrings(updates.contact_types);
      }

      if (updates.interaction_types) {
        updates.interaction_types = deduplicateStrings(updates.interaction_types);
      }

      if (updates.deal_contact_roles) {
        updates.deal_contact_roles = deduplicateStrings(updates.deal_contact_roles);
      }

      const { config: currentConfig } = await loadCrmConfig(supabase, clientId);

      if (!confirm_removals) {
        const inUseValues: Partial<Record<VocabularyFieldName, Record<string, number>>> = {};
        const inUseCustomFields:
          Partial<Record<CustomFieldConfigName, Record<string, number>>> = {};

        if (updates.deal_stages) {
          const counts = await checkVocabularyRemovals(
            supabase,
            clientId,
            "deal_stages",
            currentConfig.deal_stages,
            updates.deal_stages,
          );
          if (Object.keys(counts).length > 0) {
            inUseValues.deal_stages = counts;
          }
        }

        if (updates.contact_types) {
          const counts = await checkVocabularyRemovals(
            supabase,
            clientId,
            "contact_types",
            currentConfig.contact_types,
            updates.contact_types,
          );
          if (Object.keys(counts).length > 0) {
            inUseValues.contact_types = counts;
          }
        }

        if (updates.interaction_types) {
          const counts = await checkVocabularyRemovals(
            supabase,
            clientId,
            "interaction_types",
            currentConfig.interaction_types,
            updates.interaction_types,
          );
          if (Object.keys(counts).length > 0) {
            inUseValues.interaction_types = counts;
          }
        }

        if (updates.deal_contact_roles) {
          const counts = await checkVocabularyRemovals(
            supabase,
            clientId,
            "deal_contact_roles",
            currentConfig.deal_contact_roles,
            updates.deal_contact_roles,
          );
          if (Object.keys(counts).length > 0) {
            inUseValues.deal_contact_roles = counts;
          }
        }

        if (updates.deal_custom_fields) {
          const counts = await checkCustomFieldDefinitionRemovals(
            supabase,
            clientId,
            "deal_custom_fields",
            currentConfig.deal_custom_fields.map((field) => field.key),
            updates.deal_custom_fields.map((field) => field.key),
          );
          if (Object.keys(counts).length > 0) {
            inUseCustomFields.deal_custom_fields = counts;
          }
        }

        if (updates.contact_custom_fields) {
          const counts = await checkCustomFieldDefinitionRemovals(
            supabase,
            clientId,
            "contact_custom_fields",
            currentConfig.contact_custom_fields.map((field) => field.key),
            updates.contact_custom_fields.map((field) => field.key),
          );
          if (Object.keys(counts).length > 0) {
            inUseCustomFields.contact_custom_fields = counts;
          }
        }

        if (updates.task_custom_fields) {
          const counts = await checkCustomFieldDefinitionRemovals(
            supabase,
            clientId,
            "task_custom_fields",
            currentConfig.task_custom_fields.map((field) => field.key),
            updates.task_custom_fields.map((field) => field.key),
          );
          if (Object.keys(counts).length > 0) {
            inUseCustomFields.task_custom_fields = counts;
          }
        }

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
          "deal_label, deal_stages, contact_types, interaction_types, deal_contact_roles, deal_custom_fields, contact_custom_fields, task_custom_fields",
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
