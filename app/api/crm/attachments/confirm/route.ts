/**
 * Confirms a direct-to-Supabase CRM attachment upload.
 * @module app/api/crm/attachments/confirm/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
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
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const { storagePath, filename, contentType, size, record_type, record_id } = parsed.data;

    if (!isValidAttachmentPath(storagePath)) {
      return jsonError("Invalid storage path", 400);
    }

    const clientId = await resolveClientId(supabase, userId);
    const fullStoragePath = `${clientId}/${storagePath}`;
    const signedUrlResponse = await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUrl(fullStoragePath, SIGNED_URL_EXPIRY_SECONDS, {
        download: filename,
      });

    if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
      return jsonError("Failed to confirm upload", 500);
    }

    const { data: attachment, error: insertError } = await supabase
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
      await supabase.storage.from(AGENT_FILES_BUCKET).remove([fullStoragePath]);
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
