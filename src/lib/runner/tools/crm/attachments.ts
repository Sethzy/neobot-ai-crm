/**
 * CRM attachment tools for the runner.
 * @module lib/runner/tools/crm/attachments
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";

import { getFileCategory } from "@/lib/crm/file-categories";
import { AGENT_FILES_BUCKET, normalizeWorkspacePath } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

const recordTypeSchema = z.enum(["contact", "company", "deal"]);

/**
 * Converts an agent-facing file path into the workspace-relative path stored in Supabase Storage.
 *
 * Accepts both `/agent/home/report.pdf` and `home/report.pdf` inputs so the tool remains
 * resilient if the model omits the `/agent/` prefix.
 */
function resolveAttachmentSourcePath(sourcePath: string): string {
  const workspacePath = sourcePath.replace(/^\/agent\/?/, "");
  return normalizeWorkspacePath(workspacePath, false);
}

/**
 * Creates attachment management tools for CRM record files.
 */
export function createAttachmentTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const attach_file_to_record = tool({
    description:
      "Attach a file from the agent workspace to a CRM record. " +
      "This COPIES the file into the record attachments area, so the original workspace file remains unchanged. " +
      "Use this after generating a file the user should see in the record Files tab.",
    inputSchema: z.object({
      source_path: z
        .string()
        .min(1)
        .describe("Path to an existing workspace file, usually like '/agent/home/report.pdf'."),
      record_type: recordTypeSchema.describe("CRM record type."),
      record_id: z.string().uuid().describe("UUID of the target CRM record."),
      filename: z
        .string()
        .min(1)
        .optional()
        .describe("Optional display filename. Defaults to the source file name."),
    }),
    execute: async ({ source_path, record_type, record_id, filename }) => {
      let workspacePath: string;

      try {
        workspacePath = resolveAttachmentSourcePath(source_path);
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Invalid source path.",
        };
      }

      const sourceStoragePath = `${clientId}/${workspacePath}`;
      const displayFilename = filename ?? workspacePath.split("/").pop() ?? "file";

      const { data: sourceFile, error: downloadError } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .download(sourceStoragePath);

      if (downloadError || !sourceFile) {
        return {
          success: false as const,
          error: `Failed to read source file "${source_path}": ${downloadError?.message ?? "unknown error"}`,
        };
      }

      const attachmentStoragePath = `attachments/${record_type}/${record_id}/${crypto.randomUUID()}`;
      const attachmentObjectPath = `${clientId}/${attachmentStoragePath}`;
      const contentType = sourceFile.type || "application/octet-stream";

      const { error: uploadError } = await supabase.storage
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

      const { data, error } = await supabase
        .from("record_attachments")
        .insert({
          client_id: clientId,
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
        await supabase.storage.from(AGENT_FILES_BUCKET).remove([attachmentObjectPath]);

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
  });

  const list_record_attachments = tool({
    description:
      "List all file attachments on a CRM record. " +
      "Use this before discussing what files are already attached or before deleting one.",
    inputSchema: z.object({
      record_type: recordTypeSchema.describe("CRM record type."),
      record_id: z.string().uuid().describe("UUID of the CRM record."),
    }),
    execute: async ({ record_type, record_id }) => {
      const { data, error } = await supabase
        .from("record_attachments")
        .select("attachment_id, filename, file_category, file_size, content_type, created_at")
        .eq("client_id", clientId)
        .eq("record_type", record_type)
        .eq("record_id", record_id)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          success: false as const,
          error: error.message,
        };
      }

      return {
        success: true as const,
        attachments: data ?? [],
        count: data?.length ?? 0,
      };
    },
  });

  const delete_record_attachment = tool({
    description:
      "Delete one CRM record attachment. " +
      "This removes both the database row and the stored file. " +
      "DESTRUCTIVE: ask the user for confirmation before calling this tool.",
    inputSchema: z.object({
      attachment_id: z.string().uuid().describe("UUID of the attachment row to delete."),
    }),
    execute: async ({ attachment_id }) => {
      const { data, error } = await supabase
        .from("record_attachments")
        .delete()
        .eq("attachment_id", attachment_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return {
          success: false as const,
          error: error.message,
        };
      }

      await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .remove([`${clientId}/${data.storage_path}`]);

      return {
        success: true as const,
        deleted_id: attachment_id,
      };
    },
  });

  return {
    attach_file_to_record,
    list_record_attachments,
    delete_record_attachment,
  };
}
