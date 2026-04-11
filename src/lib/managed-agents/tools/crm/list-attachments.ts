/**
 * CRM attachment listing tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/list-attachments
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";

const recordTypeSchema = z.enum(["contact", "company", "deal"]);

const inputSchema = z.object({
  record_type: recordTypeSchema.describe("CRM record type."),
  record_id: z.string().uuid().describe("UUID of the CRM record."),
});

type ListAttachmentsInput = z.infer<typeof inputSchema>;

export const listRecordAttachmentsTool: ManagedAgentTool<ListAttachmentsInput> = {
  name: "list_record_attachments",
  description:
    "List all file attachments on a CRM record. " +
    "Use this before discussing what files are already attached or before deleting one.",
  inputSchema,
  execute: async ({ record_type, record_id }, context) => {
    const { data, error } = await context.supabase
      .from("record_attachments")
      .select("attachment_id, filename, file_category, file_size, content_type, created_at")
      .eq("client_id", context.clientId)
      .eq("record_type", record_type)
      .eq("record_id", record_id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false as const, error: error.message };
    }

    return {
      success: true as const,
      attachments: data ?? [],
      count: data?.length ?? 0,
    };
  },
};
