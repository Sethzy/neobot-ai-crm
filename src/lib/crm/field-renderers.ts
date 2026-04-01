/**
 * Cell value extractors and display formatters for config-driven CRM columns.
 * Used by buildColumnsFromConfig to render table cells per field type.
 * @module lib/crm/field-renderers
 */
import type { FieldSource, FieldType } from "./field-definitions";

/**
 * Extract the raw value from a row based on field key and source.
 * Column fields read directly from the row; custom fields read from the JSONB custom_fields column.
 */
export function getFieldValue(
  row: Record<string, unknown>,
  key: string,
  source: FieldSource,
): unknown {
  if (source === "custom") {
    const cf = row.custom_fields;
    if (cf && typeof cf === "object" && !Array.isArray(cf)) {
      return (cf as Record<string, unknown>)[key];
    }
    return undefined;
  }
  return row[key];
}

/**
 * Format a field value for display in a table cell.
 * Returns null if value is null/undefined.
 */
export function formatFieldDisplay(type: FieldType, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  switch (type) {
    case "currency": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return String(value);
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
    }
    case "number": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return String(value);
      return new Intl.NumberFormat("en-US").format(num);
    }
    case "date": {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "text":
    case "full_name":
    case "email":
    case "phone":
    case "url":
    case "select":
    case "richtext":
    case "file":
    case "relation":
    case "tags":
    default:
      return String(value);
  }
}
