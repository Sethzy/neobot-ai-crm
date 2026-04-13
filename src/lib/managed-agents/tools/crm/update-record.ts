/**
 * Unified CRM record update tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/update-record
 */
import { z } from "zod";

import { CRM_DEFAULTS, matchVocabularyValue, type CrmVocabConfig } from "@/lib/crm/config";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { normalizeEmail, normalizePhone, normalizeWebsite } from "@/lib/crm/normalize";
import type { JsonObject } from "@/types/database";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

import { mergeCustomFields } from "@/lib/crm/custom-fields";

import type { ManagedAgentTool, ToolContext } from "../types";

const UPDATE_ENTITIES = ["contacts", "companies", "deals"] as const;
type UpdateEntity = (typeof UPDATE_ENTITIES)[number];

const ENTITY_ROUTING: Record<
  UpdateEntity,
  { table: "contacts" | "companies" | "deals"; pk: string }
> = {
  contacts: { table: "contacts", pk: "contact_id" },
  companies: { table: "companies", pk: "company_id" },
  deals: { table: "deals", pk: "deal_id" },
};

const RECORD_TYPE_MAP: Record<UpdateEntity, "contact" | "company" | "deal"> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
};

const inputSchema = z.object({
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
});

type UpdateRecordInput = z.infer<typeof inputSchema>;

async function updateOne(
  context: ToolContext,
  entity: UpdateEntity,
  table: "contacts" | "companies" | "deals",
  pk: string,
  recordId: string,
  fields: Record<string, unknown>,
  config: CrmVocabConfig,
): Promise<{ success: true; record: unknown } | { success: false; error: string }> {
  const updates = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  const noteBody = typeof updates.notes === "string" ? updates.notes.trim() : null;
  delete updates.notes;

  if (Object.keys(updates).length === 0 && noteBody) {
    await context.supabase.from("record_notes").insert({
      client_id: context.clientId,
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
  const { data: existingRecord, error: readError } = await (context.supabase as any)
    .from(table)
    .select("*")
    .eq(pk, recordId)
    .eq("client_id", context.clientId)
    .maybeSingle();

  const beforeSnapshot = readError ? null : (existingRecord as Record<string, unknown> | null);

  if (entity === "deals" && typeof updates.stage === "string") {
    updates.stage = matchVocabularyValue(updates.stage, config.deal_stages);
  }
  if (entity === "contacts" && typeof updates.type === "string") {
    updates.type = matchVocabularyValue(updates.type, config.contact_types);
  }
  if (entity === "companies" && typeof updates.industry === "string") {
    updates.industry = matchVocabularyValue(updates.industry, config.company_industries);
  }

  if ((entity === "contacts" || entity === "companies") && typeof updates.phone === "string") {
    updates.phone = normalizePhone(updates.phone) ?? updates.phone;
  }

  if (entity === "deals" && typeof updates.amount === "number") {
    if (!Number.isFinite(updates.amount) || updates.amount < 0) {
      return { success: false, error: "amount must be a finite non-negative number" };
    }
  }

  if ((entity === "contacts" || entity === "companies") && typeof updates.email === "string") {
    try {
      updates.email = normalizeEmail(updates.email) ?? updates.email;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Invalid email" };
    }
  }

  if (entity === "companies" && typeof updates.website === "string") {
    updates.website = normalizeWebsite(updates.website) ?? updates.website;
  }

  const previousStage =
    entity === "deals" && typeof beforeSnapshot?.stage === "string"
      ? beforeSnapshot.stage
      : null;
  const previousAmount =
    entity === "deals" && typeof beforeSnapshot?.amount === "number"
      ? beforeSnapshot.amount
      : null;

  if ("custom_fields" in updates) {
    const result = await mergeCustomFields(
      context.supabase,
      table,
      pk,
      recordId,
      context.clientId,
      (updates.custom_fields as JsonObject | undefined) ?? {},
    );

    if (result.error) {
      return { success: false, error: result.error };
    }

    updates.custom_fields = result.merged;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (context.supabase as any)
    .from(table)
    .update(updates)
    .eq(pk, recordId)
    .eq("client_id", context.clientId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  if (noteBody) {
    await context.supabase.from("record_notes").insert({
      client_id: context.clientId,
      record_type: RECORD_TYPE_MAP[entity],
      record_id: recordId,
      body: noteBody,
    });
  }

  if (entity === "deals" && updates.stage && previousStage && previousStage !== data.stage) {
    await captureServerEvent({
      distinctId: context.clientId,
      event: "deal_stage_changed",
      properties: {
        from_stage: previousStage,
        to_stage: data.stage,
        deal_value: typeof data.amount === "number" ? data.amount : previousAmount,
      },
    });
  }

  if (beforeSnapshot) {
    void captureTimelineActivity({
      supabase: context.supabase,
      clientId: context.clientId,
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

export const updateRecordTool: ManagedAgentTool<UpdateRecordInput> = {
  name: "update_record",
  description:
    "Update one or more CRM records by ID. Only provided fields are changed. " +
    "Pass null to clear a nullable field. Omit fields to leave them unchanged. " +
    "Custom fields are deep-merged (existing keys not in the patch are preserved). " +
    "Supports batch updates (up to 50 records per call) - all records must be the same entity type. " +
    "Data Modification Warning: Only update records when the user has explicitly asked.",
  inputSchema,
  execute: async ({ entity, updates }, context) => {
    const config = context.crmConfig ?? CRM_DEFAULTS;
    const { table, pk } = ENTITY_ROUTING[entity];

    if (updates.length === 1) {
      const { id, fields } = updates[0];
      const result = await updateOne(context, entity, table, pk, id, fields, config);
      if (!result.success) {
        return { success: false as const, error: result.error };
      }
      return { success: true as const, record: result.record };
    }

    const results: Array<{
      id: string;
      success: boolean;
      record?: unknown;
      error?: string;
    }> = [];
    let hasError = false;

    for (const { id, fields } of updates) {
      const result = await updateOne(context, entity, table, pk, id, fields, config);
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

    const records = results.map((result) => result.record);
    return {
      success: true as const,
      records,
      count: records.length,
    };
  },
};
