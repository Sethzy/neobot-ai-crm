/**
 * Shared helper for merging CRM custom field patches with the latest stored row value.
 * @module hooks/crm-custom-fields
 */
"use client";

import { supabase } from "@/lib/supabase";

interface MergeCustomFieldPatchParams<TUpdates extends Record<string, unknown>> {
  /** CRM table name to read the existing `custom_fields` JSONB document from. */
  table: "contacts" | "deals" | "crm_tasks";
  /** Primary key column used for the targeted record. */
  idColumn: "contact_id" | "deal_id" | "task_id";
  /** Primary key value for the targeted record. */
  recordId: string;
  /** Update payload that may contain a partial `custom_fields` patch. */
  updates: TUpdates & { custom_fields?: Record<string, unknown> };
}

/**
 * Merges a partial `custom_fields` patch with the latest stored JSON document.
 *
 * This keeps drawer-driven edits from replacing sibling custom fields that were
 * not part of the current mutation payload.
 */
export async function mergeCustomFieldPatch<TUpdates extends Record<string, unknown>>({
  table,
  idColumn,
  recordId,
  updates,
}: MergeCustomFieldPatchParams<TUpdates>) {
  if (!("custom_fields" in updates) || updates.custom_fields === undefined) {
    return updates;
  }

  const { data, error } = await supabase
    .from(table)
    .select("custom_fields")
    .eq(idColumn, recordId)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...updates,
    custom_fields: {
      ...((data?.custom_fields as Record<string, unknown> | null) ?? {}),
      ...updates.custom_fields,
    },
  };
}
