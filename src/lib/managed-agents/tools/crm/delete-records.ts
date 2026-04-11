/**
 * Unified CRM deletion tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/delete-records
 */
import { z } from "zod";

import { captureTimelineActivity } from "@/lib/crm/timeline-capture";

import type { ManagedAgentTool } from "../types";

const DELETE_ENTITIES = ["contacts", "companies", "deals", "interactions", "tasks"] as const;
type DeleteEntity = (typeof DELETE_ENTITIES)[number];

const ENTITY_ROUTING: Record<DeleteEntity, { table: string; pk: string }> = {
  contacts: { table: "contacts", pk: "contact_id" },
  companies: { table: "companies", pk: "company_id" },
  deals: { table: "deals", pk: "deal_id" },
  interactions: { table: "interactions", pk: "interaction_id" },
  tasks: { table: "crm_tasks", pk: "task_id" },
};

const RECORD_TYPE_MAP: Partial<Record<DeleteEntity, "contact" | "company" | "deal">> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
};

const TIMELINE_RECORD_TYPE_MAP: Partial<
  Record<DeleteEntity, "contact" | "company" | "deal" | "task">
> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
  tasks: "task",
};

const inputSchema = z.object({
  entity: z.enum(DELETE_ENTITIES).describe("CRM entity type to delete."),
  ids: z.array(z.string().uuid()).min(1).max(50).describe("Array of UUIDs to delete."),
  reason: z.string().min(1).describe("Why these records are being deleted. Logged for audit."),
});

type DeleteRecordsInput = z.infer<typeof inputSchema>;

export const deleteRecordsTool: ManagedAgentTool<DeleteRecordsInput> = {
  name: "delete_records",
  description:
    "Permanently delete one or more CRM records by ID. This is irreversible. " +
    "Supports batch deletion (up to 50 records per call). " +
    "For deal_contacts links, use link_records with action 'unlink' instead. " +
    "Requires user approval before execution.",
  inputSchema,
  execute: async ({ entity, ids, reason }, context) => {
    void reason;

    const { table, pk } = ENTITY_ROUTING[entity];
    const deletedIds: string[] = [];
    const failedIds: string[] = [];

    for (const id of ids) {
      let existingRecord: Record<string, unknown> | null = null;
      const timelineRecordType = TIMELINE_RECORD_TYPE_MAP[entity];

      if (timelineRecordType) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: readError } = await (context.supabase as any)
          .from(table)
          .select("*")
          .eq(pk, id)
          .eq("client_id", context.clientId)
          .maybeSingle();

        if (!readError) {
          existingRecord = (data as Record<string, unknown> | null) ?? null;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (context.supabase as any)
        .from(table)
        .delete()
        .eq(pk, id)
        .eq("client_id", context.clientId);

      if (error) {
        failedIds.push(id);
        continue;
      }

      deletedIds.push(id);
      const recordType = RECORD_TYPE_MAP[entity];
      if (recordType) {
        await context.supabase
          .from("record_notes")
          .delete()
          .eq("record_type", recordType)
          .eq("record_id", id)
          .eq("client_id", context.clientId);
      }

      if (timelineRecordType && existingRecord) {
        void captureTimelineActivity({
          supabase: context.supabase,
          clientId: context.clientId,
          recordType: timelineRecordType,
          recordId: id,
          action: "deleted",
          actorType: "agent",
          before: existingRecord,
        });
      }
    }

    if (failedIds.length > 0) {
      return {
        success: false as const,
        error: `Failed to delete ${failedIds.length} record(s)`,
        deleted_count: deletedIds.length,
        failed_ids: failedIds,
      };
    }

    return {
      success: true as const,
      deleted_count: deletedIds.length,
      ids: deletedIds,
    };
  },
};
