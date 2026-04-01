/**
 * Generates TanStack Table ColumnDefs from a FieldDefinition array.
 * Replaces all three page-specific hardcoded column arrays.
 * @module lib/crm/build-columns
 */
import type { ColumnDef } from "@tanstack/react-table";

import type { FieldDefinition } from "./field-definitions";
import { getFieldValue, formatFieldDisplay } from "./field-renderers";

type EntityType = "contacts" | "companies" | "deals";

/**
 * Build TanStack Table columns from a field definition array.
 * Filters to visible fields, sorts by order, picks cell renderer per type.
 */
export function buildColumnsFromConfig<TData extends Record<string, unknown>>(
  fields: FieldDefinition[],
  _entityType: EntityType,
): ColumnDef<TData, unknown>[] {
  return fields
    .filter((f) => f.visible)
    .sort((a, b) => a.order - b.order)
    .map((field) => ({
      id: field.key,
      accessorFn: (row: TData) => getFieldValue(row as Record<string, unknown>, field.key, field.source),
      header: field.label,
      size: field.width,
      cell: ({ getValue }: { getValue: () => unknown }) => {
        const value = getValue();
        return formatFieldDisplay(field.type, value) ?? "";
      },
    }));
}
