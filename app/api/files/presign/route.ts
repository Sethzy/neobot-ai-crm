/**
 * Generates a presigned upload URL for direct browser-to-Supabase file uploads.
 * @module app/api/files/presign/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";

const BUCKET_ID = "agent-files";

function sanitizeUploadFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "upload";
}

const presignSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  contentType: z.string().min(1, "Content type is required"),
  size: z.number().int().positive(),
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

    const { filename, contentType, size } = parsed.data;

    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
      return jsonError("File type is not supported for chat uploads", 400);
    }

    if (size > MAX_UPLOAD_SIZE_BYTES) {
      return jsonError("File size should be less than 10MB", 400);
    }

    const clientId = await resolveClientId(supabase, userId);
    const sanitizedFilename = sanitizeUploadFilename(filename);
    const storageFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitizedFilename}`;
    const relativeStoragePath = `uploads/${storageFilename}`;
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
