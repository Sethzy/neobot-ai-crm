/**
 * Generates a presigned upload URL for direct browser-to-Supabase CRM attachment uploads.
 * @module app/api/crm/attachments/presign/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";
import { recordAttachmentTypeValues } from "@/lib/crm/schemas";

const BUCKET_ID = "agent-files";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  record_type: z.enum(recordAttachmentTypeValues),
  record_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = presignSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const { contentType, size, record_type, record_id } = parsed.data;

    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
      return jsonError("File type not supported", 400);
    }

    if (size > MAX_UPLOAD_SIZE_BYTES) {
      return jsonError("File size must be under 10 MB", 400);
    }

    const clientId = await resolveClientId(supabase, userId);
    const relativeStoragePath = `attachments/${record_type}/${record_id}/${crypto.randomUUID()}`;
    const fullStoragePath = `${clientId}/${relativeStoragePath}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUploadUrl(fullStoragePath);

    if (error || !data?.signedUrl || !data.token || !data.path) {
      return jsonError("Failed to create upload URL", 500);
    }

    return Response.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      storagePath: relativeStoragePath,
    });
  } catch {
    return jsonError("Failed to process request", 500);
  }
}
