/**
 * Uploads a file attachment to a CRM record and stores its metadata row.
 * @module app/api/crm/attachments/upload/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";
import { getFileCategory } from "@/lib/crm/file-categories";
import { recordAttachmentTypeValues } from "@/lib/crm/schemas";
import {
  AGENT_FILES_BUCKET,
  createAgentFileClient,
} from "@/lib/storage/agent-files";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    typeof value.size === "number" &&
    "type" in value &&
    typeof value.type === "string" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

const uploadSchema = z.object({
  file: z
    .custom<Blob>(isBlobLike, { message: "Invalid file" })
    .refine((file) => file.size <= MAX_UPLOAD_SIZE_BYTES, {
      message: "File size must be under 10 MB",
    })
    .refine((file) => ALLOWED_UPLOAD_TYPES.has(file.type), {
      message: "File type not supported",
    }),
  record_type: z.enum(recordAttachmentTypeValues),
  record_id: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const filenameField = formData.get("filename");
    const recordType = formData.get("record_type");
    const recordId = formData.get("record_id");

    if (fileEntry === null || typeof fileEntry === "string") {
      return jsonError("No file uploaded", 400);
    }

    const validatedUpload = uploadSchema.safeParse({
      file: fileEntry,
      record_type: recordType,
      record_id: recordId,
    });

    if (!validatedUpload.success) {
      return jsonError(
        validatedUpload.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const clientId = await resolveClientId(supabase, userId);
    const filename = typeof filenameField === "string" && filenameField.trim().length > 0
      ? filenameField.trim()
      : (fileEntry as File).name || "upload";
    const relativeStoragePath =
      `attachments/${validatedUpload.data.record_type}/${validatedUpload.data.record_id}/${crypto.randomUUID()}`;
    const agentFileClient = createAgentFileClient(supabase, clientId);

    console.info("[crm/attachments/upload] storing attachment", {
      clientId,
      filename,
      recordType: validatedUpload.data.record_type,
      recordId: validatedUpload.data.record_id,
      contentType: fileEntry.type,
      sizeBytes: fileEntry.size,
      storagePath: relativeStoragePath,
    });

    const uploadResult = await agentFileClient.uploadArtifact({
      path: relativeStoragePath,
      content: await fileEntry.arrayBuffer(),
      contentType: fileEntry.type,
      expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
      downloadFilename: filename,
    });

    const { data: attachment, error: insertError } = await supabase
      .from("record_attachments")
      .insert({
        client_id: clientId,
        record_type: validatedUpload.data.record_type,
        record_id: validatedUpload.data.record_id,
        filename,
        storage_path: relativeStoragePath,
        content_type: fileEntry.type,
        file_size: fileEntry.size,
        file_category: getFileCategory(filename),
      })
      .select()
      .single();

    if (insertError || !attachment) {
      await supabase.storage.from(AGENT_FILES_BUCKET).remove([uploadResult.storagePath]);
      return jsonError("Failed to create attachment record", 500);
    }

    console.info("[crm/attachments/upload] stored attachment", {
      clientId,
      attachmentId: attachment.attachment_id,
      filename,
      recordType: validatedUpload.data.record_type,
      recordId: validatedUpload.data.record_id,
      storagePath: relativeStoragePath,
    });

    return Response.json({
      attachment,
      url: uploadResult.downloadUrl,
    });
  } catch {
    return jsonError("Failed to process upload", 500);
  }
}
