/**
 * Shared default widths for config-driven CRM list columns.
 *
 * Widths apply when a field definition has not been explicitly resized yet.
 * They give the fixed-layout table a stable first render before the user has
 * persisted custom widths.
 *
 * @module lib/crm/column-widths
 */
import type { FieldType } from "./field-definitions";

/** Matches Twenty's minimum resizable record-table column width. */
export const RESIZE_MIN_WIDTH = 104;

const DEFAULT_COLUMN_WIDTHS: Record<FieldType, number> = {
  text: 180,
  full_name: 240,
  number: 120,
  currency: 140,
  email: 220,
  phone: 160,
  url: 200,
  date: 140,
  boolean: 100,
  select: 180,
  tags: 200,
  richtext: 220,
  file: 160,
  relation: 200,
};

/**
 * Returns the default width for a CRM field type.
 *
 * Unknown values fall back to the standard text-column width so malformed
 * config rows degrade safely instead of collapsing the table.
 */
export function getDefaultWidthForFieldType(type: FieldType): number {
  return DEFAULT_COLUMN_WIDTHS[type] ?? 180;
}
