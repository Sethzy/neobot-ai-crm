/**
 * CRM attachment creation tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/attach-file
 */
import { z } from "zod";

import { getFileCategory } from "@/lib/crm/file-categories";
import { AGENT_FILES_BUCKET, normalizeWorkspacePath } from "@/lib/storage/agent-files";

import type { ManagedAgentTool } from "../types";

const recordTypeSchema = z.enum(["contact", "company", "deal"]);

function resolveAttachmentSourcePath(sourcePath: string): string {
  const workspacePath = sourcePath.replace(/^\/agent\/?/, "");
  return normalizeWorkspacePath(workspacePath, false);
}

const inputSchema = z.object({
  source_path: z.string().min(1).describe("Path to an existing workspace file, usually like '/agent/home/report.pdf'."),
  record_type: recordTypeSchema.describe("CRM record type."),
  record_id: z.string().uuid().describe("UUID of the target CRM record."),
  filename: z.string().min(1).optional().describe("Optional display filename. Defaults to the source file name."),
});

type AttachFileInput = z.infer<typeof inputSchema>;

export const attachFileToRecordTool: ManagedAgentTool<AttachFileInput> = {
  name: "attach_file_to_record",
  description:
    "Attach a file from the agent workspace to a CRM record. " +
    "This COPIES the file into the record attachments area, so the original workspace file remains unchanged. " +
    "Use this after generating a file the user should see in the record Files tab.",
  inputSchema,
  execute: async ({ source_path, record_type, record_id, filename }, context) => {
    let workspacePath: string;

    try {
      workspacePath = resolveAttachmentSourcePath(source_path);
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Invalid source path.",
      };
    }

    const sourceStoragePath = `${context.clientId}/${workspacePath}`;
    const displayFilename = filename ?? workspacePath.split("/").pop() ?? "file";

    const { data: sourceFile, error: downloadError } = await context.supabase.storage
      .from(AGENT_FILES_BUCKET)
      .download(sourceStoragePath);

    if (downloadError || !sourceFile) {
      return {
        success: false as const,
        error: `Failed to read source file "${source_path}": ${downloadError?.message ?? "unknown error"}`,
      };
    }

    const attachmentStoragePath = `attachments/${record_type}/${record_id}/${crypto.randomUUID()}`;
    const attachmentObjectPath = `${context.clientId}/${attachmentStoragePath}`;
    const contentType = sourceFile.type || "application/octet-stream";

    const { error: uploadError } = await context.supabase.storage
      .from(AGENT_FILES_BUCKET)
      .upload(attachmentObjectPath, await sourceFile.arrayBuffer(), {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return {
        success: false as const,
        error: `Failed to copy file to attachments: ${uploadError.message}`,
      };
    }

    const { data, error } = await context.supabase
      .from("record_attachments")
      .insert({
        client_id: context.clientId,
        record_type,
        record_id,
        filename: displayFilename,
        storage_path: attachmentStoragePath,
        content_type: contentType,
        file_size: sourceFile.size,
        file_category: getFileCategory(displayFilename),
      })
      .select()
      .single();

    if (error) {
      await context.supabase.storage.from(AGENT_FILES_BUCKET).remove([attachmentObjectPath]);

      return {
        success: false as const,
        error: error.message,
      };
    }

    return {
      success: true as const,
      attachment: data,
    };
  },
};
