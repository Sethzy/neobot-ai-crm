/**
 * Helpers for wiring configured custom fields into CRM list filters.
 * @module lib/crm/custom-field-filters
 */
import type { CustomFieldDefinition } from "@/lib/crm/config";

/** Returns custom fields that can be represented by the shared yes/no filter. */
export function getBooleanCustomFields(
  definitions: CustomFieldDefinition[] | null | undefined,
): CustomFieldDefinition[] {
  return (definitions ?? []).filter((definition) => definition.type === "boolean");
}

/** Returns stable keys for configured custom fields used by JSONB query filters. */
export function getCustomFieldFilterKeys(
  definitions: CustomFieldDefinition[] | null | undefined,
): string[] {
  return (definitions ?? []).map((definition) => definition.key);
}

/** Picks active boolean custom-field filters from a shared filter value map. */
export function pickBooleanCustomFieldFilters(
  values: Record<string, unknown>,
  definitions: CustomFieldDefinition[] | null | undefined,
): Record<string, boolean> {
  const nextFilters: Record<string, boolean> = {};

  for (const definition of definitions ?? []) {
    const value = values[definition.key];

    if (typeof value === "boolean") {
      nextFilters[definition.key] = value;
    }
  }

  return nextFilters;
}
