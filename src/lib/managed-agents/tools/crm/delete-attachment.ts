/**
 * CRM attachment deletion tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/delete-attachment
 */
import { z } from "zod";

import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  attachment_id: z.string().uuid().describe("UUID of the attachment row to delete."),
});

type DeleteAttachmentInput = z.infer<typeof inputSchema>;

export const deleteRecordAttachmentTool: ManagedAgentTool<DeleteAttachmentInput> = {
  name: "delete_record_attachment",
  description:
    "Delete one CRM record attachment. " +
    "This removes both the database row and the stored file. " +
    "DESTRUCTIVE: ask the user for confirmation before calling this tool.",
  inputSchema,
  execute: async ({ attachment_id }, context) => {
    const { data, error } = await context.supabase
      .from("record_attachments")
      .delete()
      .eq("attachment_id", attachment_id)
      .eq("client_id", context.clientId)
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    await context.supabase.storage
      .from(AGENT_FILES_BUCKET)
      .remove([`${context.clientId}/${data.storage_path}`]);

    return {
      success: true as const,
      deleted_id: attachment_id,
    };
  },
};
