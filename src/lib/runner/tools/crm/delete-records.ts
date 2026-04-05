/**
 * Unified CRM record deletion tool — replaces 5 per-entity delete tools.
 * @module lib/runner/tools/crm/delete-records
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import type { Database } from "@/types/database";

/** Entity types supported by delete_records. */
const DELETE_ENTITIES = ["contacts", "companies", "deals", "interactions", "tasks"] as const;
type DeleteEntity = (typeof DELETE_ENTITIES)[number];

/** Per-entity routing: table name + primary key column. */
const ENTITY_ROUTING: Record<DeleteEntity, { table: string; pk: string }> = {
  contacts: { table: "contacts", pk: "contact_id" },
  companies: { table: "companies", pk: "company_id" },
  deals: { table: "deals", pk: "deal_id" },
  interactions: { table: "interactions", pk: "interaction_id" },
  tasks: { table: "crm_tasks", pk: "task_id" },
};

/** Entities that have record_notes (polymorphic notes table). */
const RECORD_TYPE_MAP: Partial<Record<DeleteEntity, "contact" | "company" | "deal">> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
};

const TIMELINE_RECORD_TYPE_MAP: Partial<Record<DeleteEntity, "contact" | "company" | "deal" | "task">> = {
  contacts: "contact",
  companies: "company",
  deals: "deal",
  tasks: "task",
};

/**
 * Creates the delete_records tool.
 */
export function createDeleteRecordsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    delete_records: tool({
      description:
        "Permanently delete one or more CRM records by ID. This is irreversible. " +
        "Supports batch deletion (up to 50 records per call). " +
        "For deal_contacts links, use link_records with action 'unlink' instead. " +
        "DESTRUCTIVE: Use ask_user_question to confirm with the user before calling.",
      inputSchema: z.object({
        entity: z.enum(DELETE_ENTITIES).describe("CRM entity type to delete."),
        ids: z
          .array(z.string().uuid())
          .min(1)
          .max(50)
          .describe("Array of UUIDs to delete."),
        reason: z
          .string()
          .min(1)
          .describe("Why these records are being deleted. Logged for audit."),
      }),
      execute: async ({ entity, ids, reason }) => {
        void reason;
        const { table, pk } = ENTITY_ROUTING[entity];
        const deletedIds: string[] = [];
        const failedIds: string[] = [];

        for (const id of ids) {
          let existingRecord: Record<string, unknown> | null = null;
          const timelineRecordType = TIMELINE_RECORD_TYPE_MAP[entity];

          if (timelineRecordType) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error: readError } = await (supabase as any)
              .from(table)
              .select("*")
              .eq(pk, id)
              .eq("client_id", clientId)
              .maybeSingle();

            if (!readError) {
              existingRecord = (data as Record<string, unknown> | null) ?? null;
            }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from(table)
            .delete()
            .eq(pk, id)
            .eq("client_id", clientId);

          if (error) {
            failedIds.push(id);
          } else {
            deletedIds.push(id);
            // Clean up record_notes for entities that have them.
            const recordType = RECORD_TYPE_MAP[entity];
            if (recordType) {
              await supabase
                .from("record_notes")
                .delete()
                .eq("record_type", recordType)
                .eq("record_id", id)
                .eq("client_id", clientId);
            }

            if (timelineRecordType && existingRecord) {
              void captureTimelineActivity({
                supabase,
                clientId,
                recordType: timelineRecordType,
                recordId: id,
                action: "deleted",
                actorType: "agent",
                before: existingRecord,
              });
            }
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
    }),
  };
}
