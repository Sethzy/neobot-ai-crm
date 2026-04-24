/**
 * Generates TanStack Table ColumnDefs from a FieldDefinition array.
 * Replaces all three page-specific hardcoded column arrays.
 * @module lib/crm/build-columns
 */
import type { ColumnDef } from "@tanstack/react-table";

import { getDefaultWidthForFieldType, RESIZE_MIN_WIDTH } from "./column-widths";
import type { FieldDefinition } from "./field-definitions";
import { getFieldIcon } from "./field-icons";
import { getFieldValue, renderFieldCell } from "./field-renderers";

type EntityType = "contacts" | "companies" | "deals";

/**
 * Build TanStack Table columns from a field definition array.
 * Filters to visible fields, sorts by order, picks cell renderer per type.
 * Renders an Attio-style header with a leading lucide icon per field.
 */
export function buildColumnsFromConfig<TData extends Record<string, unknown>>(
  fields: FieldDefinition[],
  entityType: EntityType,
): ColumnDef<TData, unknown>[] {
  void entityType;
  return fields
    .filter((f) => f.visible)
    .sort((a, b) => a.order - b.order)
    .map((field) => {
      const Icon = getFieldIcon(field);
      return {
        id: field.key,
        accessorFn: (row: TData) => getFieldValue(row as Record<string, unknown>, field.key, field.source),
        header: () => (
          <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {field.label}
          </span>
        ),
        enableResizing: true,
        minSize: RESIZE_MIN_WIDTH,
        size: field.width ?? getDefaultWidthForFieldType(field.type),
        cell: ({ getValue }: { getValue: () => unknown }) => renderFieldCell(field.type, getValue()),
      };
    });
}
