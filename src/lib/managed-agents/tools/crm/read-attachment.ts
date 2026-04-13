/**
 * CRM attachment content reader for managed agents.
 *
 * Looks up the attachment row, downloads the file from Supabase Storage,
 * copies it into the agent workspace at `/agent/downloads/{filename}`,
 * and returns the workspace path. For text-based files the content is
 * also returned inline so the agent can use it without a second tool call.
 *
 * @module lib/managed-agents/tools/crm/read-attachment
 */
import { z } from "zod";

import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
import { toModelPath } from "@/lib/storage/agent-paths";

import type { ManagedAgentTool } from "../types";

const DOWNLOAD_URL_EXPIRY_NOTE = "Use download_url when the user needs the raw file in their browser.";

const inputSchema = z.object({
  attachment_id: z
    .string()
    .uuid()
    .describe("UUID of the attachment. Use search_crm with include: attachments to find this."),
});

type ReadAttachmentInput = z.infer<typeof inputSchema>;

const TEXT_CONTENT_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  "application/json",
  "application/xml",
  "text/xml",
]);

function isTextContent(contentType: string): boolean {
  return TEXT_CONTENT_TYPES.has(contentType) || contentType.startsWith("text/");
}

function buildAttachmentDownloadUrl(input: {
  storagePath: string;
  filename: string;
}): string {
  const searchParams = new URLSearchParams({
    path: input.storagePath,
    filename: input.filename,
  });

  return `/api/files/download?${searchParams.toString()}`;
}

export const readRecordAttachmentTool: ManagedAgentTool<ReadAttachmentInput> = {
  name: "read_record_attachment",
  description:
    "Read the contents of a CRM attachment. Returns the file content for text-based files " +
    "(CSV, JSON, text, markdown) and always returns the original storage_path, derived agent_path, and browser download_url. " +
    `${DOWNLOAD_URL_EXPIRY_NOTE} Use search_crm with include: ['attachments'] to find attachment IDs first.`,
  inputSchema,
  execute: async ({ attachment_id }, context) => {
    const { data: attachment, error: lookupError } = await context.supabase
      .from("record_attachments")
      .select("attachment_id, filename, storage_path, content_type, file_size")
      .eq("client_id", context.clientId)
      .eq("attachment_id", attachment_id)
      .maybeSingle();

    if (lookupError) {
      return { success: false as const, error: lookupError.message };
    }

    if (!attachment) {
      return { success: false as const, error: "Attachment not found." };
    }

    const contentType = attachment.content_type || "application/octet-stream";
    const storagePath = attachment.storage_path;
    const agentPath = toModelPath(storagePath);
    const downloadUrl = buildAttachmentDownloadUrl({
      storagePath,
      filename: attachment.filename,
    });

    // For text files, also return inline content
    if (isTextContent(contentType)) {
      const objectPath = `${context.clientId}/${storagePath}`;
      const { data: fileBlob, error: downloadError } = await context.supabase.storage
        .from(AGENT_FILES_BUCKET)
        .download(objectPath);

      if (downloadError || !fileBlob) {
        return {
          success: false as const,
          error: `Failed to download attachment: ${downloadError?.message ?? "unknown error"}`,
        };
      }

      const text = await fileBlob.text();
      return {
        success: true as const,
        attachment_id: attachment.attachment_id,
        filename: attachment.filename,
        content_type: contentType,
        file_size: attachment.file_size,
        storage_path: storagePath,
        agent_path: agentPath,
        download_url: downloadUrl,
        content: text,
      };
    }

    return {
      success: true as const,
      attachment_id: attachment.attachment_id,
      filename: attachment.filename,
      content_type: contentType,
      file_size: attachment.file_size,
      storage_path: storagePath,
      agent_path: agentPath,
      download_url: downloadUrl,
      message: `Use storage_read on ${agentPath} to inspect the file. ${DOWNLOAD_URL_EXPIRY_NOTE}`,
    };
  },
};
