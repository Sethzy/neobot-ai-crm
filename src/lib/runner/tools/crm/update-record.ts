/**
 * Unified CRM record update tool — replaces 3 per-entity update tools.
 * @module lib/runner/tools/crm/update-record
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";
import type { Database, JsonObject } from "@/types/database";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

import { mergeCustomFields } from "./custom-fields";

/** Entity types supported by update_record. */
const UPDATE_ENTITIES = ["contacts", "companies", "deals"] as const;
type UpdateEntity = (typeof UPDATE_ENTITIES)[number];

/** Per-entity routing: table name + primary key column. */
const ENTITY_ROUTING: Record<UpdateEntity, { table: "contacts" | "companies" | "deals"; pk: string }> = {
  contacts: { table: "contacts", pk: "contact_id" },
  companies: { table: "companies", pk: "company_id" },
  deals: { table: "deals", pk: "deal_id" },
};

/**
 * Creates the update_record tool.
 */
export function createUpdateRecordTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  _config: CrmVocabConfig = CRM_DEFAULTS,
) {
  return {
    update_record: tool({
      description:
        "Update one or more CRM records by ID. Only provided fields are changed. " +
        "Pass null to clear a nullable field. Omit fields to leave them unchanged. " +
        "Custom fields are deep-merged (existing keys not in the patch are preserved). " +
        "Supports batch updates (up to 50 records per call) — all records must be the same entity type. " +
        "Data Modification Warning: Only update records when the user has explicitly asked.",
      inputSchema: z.object({
        entity: z.enum(UPDATE_ENTITIES).describe("CRM entity type to update."),
        updates: z
          .array(
            z.object({
              id: z.string().uuid().describe("UUID of the record to update."),
              fields: z
                .record(z.string(), z.unknown())
                .describe("Partial field patch. Only included keys are updated."),
            }),
          )
          .min(1)
          .max(50)
          .describe("Array of { id, fields } patches."),
      }),
      execute: async ({ entity, updates }) => {
        const { table, pk } = ENTITY_ROUTING[entity];

        // Single update: return { record }
        if (updates.length === 1) {
          const { id, fields } = updates[0];
          const result = await updateOne(supabase, clientId, entity, table, pk, id, fields);
          if (!result.success) {
            return { success: false as const, error: result.error };
          }
          return { success: true as const, record: result.record };
        }

        // Batch: sequential updates with partial failure support
        const results: Array<{
          id: string;
          success: boolean;
          record?: unknown;
          error?: string;
        }> = [];
        let hasError = false;

        for (const { id, fields } of updates) {
          const result = await updateOne(supabase, clientId, entity, table, pk, id, fields);
          if (result.success) {
            results.push({ id, success: true, record: result.record });
          } else {
            results.push({ id, success: false, error: result.error });
            hasError = true;
          }
        }

        if (hasError) {
          return {
            success: false as const,
            error: "Some updates failed",
            results,
          };
        }

        const records = results.map((r) => r.record);
        return {
          success: true as const,
          records,
          count: records.length,
        };
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Internal: single-record update with custom_fields merge + deal analytics
// ---------------------------------------------------------------------------

async function updateOne(
  supabase: SupabaseClient<Database>,
  clientId: string,
  entity: UpdateEntity,
  table: "contacts" | "companies" | "deals",
  pk: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<{ success: true; record: unknown } | { success: false; error: string }> {
  // Filter out undefined values
  const updates = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No fields to update" };
  }

  // --- Deal stage analytics: read previous stage before update ---
  let previousStage: string | null = null;
  let previousAmount: number | null = null;

  if (entity === "deals" && updates.stage) {
    const { data: existingDeal, error: fetchError } = await supabase
      .from("deals")
      .select("stage, amount")
      .eq("deal_id", recordId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    previousStage = existingDeal?.stage ?? null;
    previousAmount = existingDeal?.amount ?? null;
  }

  // --- Custom fields deep merge ---
  if ("custom_fields" in updates) {
    const result = await mergeCustomFields(
      supabase,
      table,
      pk,
      recordId,
      clientId,
      (updates.custom_fields as JsonObject | undefined) ?? {},
    );
    if (result.error) {
      return { success: false, error: result.error };
    }
    updates.custom_fields = result.merged;
  }

  // --- Execute update ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(table)
    .update(updates)
    .eq(pk, recordId)
    .eq("client_id", clientId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // --- Deal stage changed analytics ---
  if (entity === "deals" && updates.stage && previousStage && previousStage !== data.stage) {
    await captureServerEvent({
      distinctId: clientId,
      event: "deal_stage_changed",
      properties: {
        from_stage: previousStage,
        to_stage: data.stage,
        deal_value:
          typeof data.amount === "number" ? data.amount : previousAmount,
      },
    });
  }

  return { success: true, record: data };
}
