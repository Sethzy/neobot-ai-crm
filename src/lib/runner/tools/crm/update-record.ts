/**
 * Unified CRM record update tool — replaces 3 per-entity update tools.
 * @module lib/runner/tools/crm/update-record
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CRM_DEFAULTS, matchVocabularyValue, type CrmVocabConfig } from "@/lib/crm/config";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { normalizePhone } from "@/lib/crm/normalize";
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

/** Maps plural entity names to record_notes record_type values. */
const RECORD_TYPE_MAP: Record<UpdateEntity, "contact" | "company" | "deal"> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
};

/**
 * Creates the update_record tool.
 */
export function createUpdateRecordTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
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
          const result = await updateOne(supabase, clientId, entity, table, pk, id, fields, config);
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
          const result = await updateOne(supabase, clientId, entity, table, pk, id, fields, config);
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
  config: CrmVocabConfig,
): Promise<{ success: true; record: unknown } | { success: false; error: string }> {
  // Filter out undefined values
  const updates = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  // Extract notes — written to record_notes instead of the legacy column.
  const noteBody = typeof updates.notes === "string" ? updates.notes.trim() : null;
  delete updates.notes;

  // If the only field was notes, just create the note and return.
  if (Object.keys(updates).length === 0 && noteBody) {
    await supabase.from("record_notes").insert({
      client_id: clientId,
      record_type: RECORD_TYPE_MAP[entity],
      record_id: recordId,
      body: noteBody,
    });
    return { success: true, record: { [pk]: recordId, note_added: true } };
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No fields to update" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRecord, error: readError } = await (supabase as any)
    .from(table)
    .select("*")
    .eq(pk, recordId)
    .eq("client_id", clientId)
    .maybeSingle();

  const beforeSnapshot = readError ? null : (existingRecord as Record<string, unknown> | null);

  // Normalize configurable vocabulary values to match config keys
  if (entity === "deals" && typeof updates.stage === "string") {
    updates.stage = matchVocabularyValue(updates.stage, config.deal_stages);
  }
  if (entity === "contacts" && typeof updates.type === "string") {
    updates.type = matchVocabularyValue(updates.type, config.contact_types);
  }
  if (entity === "companies" && typeof updates.industry === "string") {
    updates.industry = matchVocabularyValue(updates.industry, config.company_industries);
  }

  if (entity === "deals") {
    if (
      typeof updates.amount === "number" &&
      (!Number.isFinite(updates.amount) || updates.amount < 0)
    ) {
      return { success: false, error: "amount must be a finite non-negative number" };
    }

    if (
      typeof updates.probability === "number" &&
      (!Number.isFinite(updates.probability) ||
        updates.probability < 0 ||
        updates.probability > 100)
    ) {
      return { success: false, error: "probability must be a finite number between 0 and 100" };
    }
  }

  // Normalize phone to E.164 on contacts and companies. Fall back to raw string so
  // data is never silently dropped; the DB constraint will surface truly bad values.
  if (
    (entity === "contacts" || entity === "companies") &&
    typeof updates.phone === "string"
  ) {
    updates.phone = normalizePhone(updates.phone) ?? updates.phone;
  }

  // --- Deal stage analytics: read previous stage before update ---
  const previousStage =
    entity === "deals" && typeof beforeSnapshot?.stage === "string"
      ? beforeSnapshot.stage
      : null;
  const previousAmount =
    entity === "deals" && typeof beforeSnapshot?.amount === "number"
      ? beforeSnapshot.amount
      : null;

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

  // --- Create record_note if notes was provided alongside other fields ---
  if (noteBody) {
    await supabase.from("record_notes").insert({
      client_id: clientId,
      record_type: RECORD_TYPE_MAP[entity],
      record_id: recordId,
      body: noteBody,
    });
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

  if (beforeSnapshot) {
    void captureTimelineActivity({
      supabase,
      clientId,
      recordType: RECORD_TYPE_MAP[entity],
      recordId,
      action: "updated",
      actorType: "agent",
      before: beforeSnapshot,
      after: data as Record<string, unknown>,
    });
  }

  return { success: true, record: data };
}
