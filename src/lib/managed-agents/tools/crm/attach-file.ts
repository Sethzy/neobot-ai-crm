/**
 * CRM attachment creation tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/attach-file
 */
import { z } from "zod";

import { getFileCategory } from "@/lib/crm/file-categories";
import { AGENT_FILES_BUCKET, normalizeWorkspacePath } from "@/lib/storage/agent-files";

import type { ManagedAgentTool } from "../types";
import { findOwnedRecord } from "./record-ownership";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

const recordTypeSchema = z.enum(["contact", "company", "deal"]);

const RECORD_TABLE_MAP = {
  contact: "contacts",
  company: "companies",
  deal: "deals",
} as const;

const SUPPORTED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/json",
] as const;

const SUPPORTED_ATTACHMENT_MIME_TYPE_SET = new Set<string>(
  SUPPORTED_ATTACHMENT_MIME_TYPES,
);

const SUPPORTED_ATTACHMENT_MIME_TYPES_DESCRIPTION =
  SUPPORTED_ATTACHMENT_MIME_TYPES.join(", ");

function resolveAttachmentSourcePath(sourcePath: string): string {
  const workspacePath = sourcePath.replace(/^\/agent\/?/, "");
  return normalizeWorkspacePath(workspacePath, false);
}

function normalizeAttachmentMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

// Storage may return `text/plain` for an `.exe` whose contents happen
// to be ASCII, which slips past the MIME allowlist. Reject by extension.
const BLOCKED_ATTACHMENT_EXTENSIONS = new Set<string>(["exe"]);

function getFileExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0 || lastDot === filename.length - 1) return null;
  return filename.slice(lastDot + 1).toLowerCase();
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
    "Use this after generating a file the user should see in the record Files tab. " +
    `Supported MIME types: ${SUPPORTED_ATTACHMENT_MIME_TYPES_DESCRIPTION}.`,
  inputSchema,
  execute: async ({ source_path, record_type, record_id, filename }, context) => {
    if (source_path.startsWith("/mnt/session/") || source_path.startsWith("/workspace/")) {
      return {
        success: false as const,
        error:
          "Cannot attach session files directly to CRM records. " +
          "First read the file with built-in read/bash, then use storage_write to save it to /agent/home/*, " +
          "then attach the durable copy.",
      };
    }

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

    const blockedExt = getFileExtension(displayFilename);
    if (blockedExt && BLOCKED_ATTACHMENT_EXTENSIONS.has(blockedExt)) {
      return {
        success: false as const,
        error:
          `Attachment "${displayFilename}" has a blocked extension (.${blockedExt}). ` +
          `Executable file types are rejected regardless of content. ` +
          `Allowed MIME types: ${SUPPORTED_ATTACHMENT_MIME_TYPES_DESCRIPTION}.`,
      };
    }

    const ownershipCheck = await findOwnedRecord(
      context,
      RECORD_TABLE_MAP[record_type],
      record_id,
      "client_id",
    );

    if (ownershipCheck.error) {
      return {
        success: false as const,
        error: ownershipCheck.error,
      };
    }

    if (!ownershipCheck.data) {
      return {
        success: false as const,
        error: "Target record not found.",
      };
    }

    console.info("[attach_file_to_record] reading source file", {
      clientId: context.clientId,
      sourcePath: source_path,
      workspacePath,
      sourceStoragePath,
      recordType: record_type,
      recordId: record_id,
      filename: displayFilename,
    });

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
    const sourceContentType = sourceFile.type || "application/octet-stream";
    const contentType = normalizeAttachmentMimeType(sourceContentType);

    if (!SUPPORTED_ATTACHMENT_MIME_TYPE_SET.has(contentType)) {
      return {
        success: false as const,
        error:
          `Unsupported attachment MIME type "${sourceContentType}". ` +
          `Supported MIME types: ${SUPPORTED_ATTACHMENT_MIME_TYPES_DESCRIPTION}.`,
      };
    }

    console.info("[attach_file_to_record] copying file into CRM attachments", {
      clientId: context.clientId,
      sourceStoragePath,
      attachmentStoragePath,
      attachmentObjectPath,
      sourceContentType,
      contentType,
      sizeBytes: sourceFile.size,
    });

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

    console.info("[attach_file_to_record] attachment row created", {
      clientId: context.clientId,
      attachmentId: data.attachment_id,
      attachmentStoragePath,
      recordType: record_type,
      recordId: record_id,
      filename: displayFilename,
    });

    return {
      success: true as const,
      attachment: data,
    };
  },
};
