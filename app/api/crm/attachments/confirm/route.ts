/**
 * Confirms a direct-to-Supabase CRM attachment upload.
 * @module app/api/crm/attachments/confirm/route
 */
import { z } from "zod";

import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getFileCategory } from "@/lib/crm/file-categories";
import { recordAttachmentTypeValues } from "@/lib/crm/schemas";
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

const confirmSchema = z.object({
  storagePath: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  record_type: z.enum(recordAttachmentTypeValues),
  record_id: z.string().uuid(),
});

function isValidAttachmentPath(storagePath: string): boolean {
  return storagePath.startsWith("attachments/") && !storagePath.includes("..");
}

export async function POST(request: Request) {
  const requestResult = await authenticateAndParseBody(request, confirmSchema, {
    invalidBodyMessage: (error) => error.issues.map((issue) => issue.message).join(", "),
  });
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  try {
    const {
      storagePath,
      filename,
      contentType,
      size,
      record_type,
      record_id,
    } = requestResult.body;

    if (!isValidAttachmentPath(storagePath)) {
      return jsonError("Invalid storage path", 400);
    }

    const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
    const fullStoragePath = `${clientId}/${storagePath}`;
    const signedUrlResponse = await requestResult.supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUrl(fullStoragePath, SIGNED_URL_EXPIRY_SECONDS, {
        download: filename,
      });

    if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
      return jsonError("Failed to confirm upload", 500);
    }

    const { data: attachment, error: insertError } = await requestResult.supabase
      .from("record_attachments")
      .insert({
        client_id: clientId,
        record_type,
        record_id,
        filename,
        storage_path: storagePath,
        content_type: contentType,
        file_size: size,
        file_category: getFileCategory(filename),
      })
      .select()
      .single();

    if (insertError || !attachment) {
      await requestResult.supabase.storage.from(AGENT_FILES_BUCKET).remove([fullStoragePath]);
      return jsonError("Failed to create attachment record", 500);
    }

    return Response.json({
      attachment,
      url: signedUrlResponse.data.signedUrl,
    });
  } catch {
    return jsonError("Failed to process upload", 500);
  }
}
