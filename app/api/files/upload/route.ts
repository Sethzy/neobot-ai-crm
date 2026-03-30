/**
 * Uploads chat attachments to the unified agent-files bucket.
 * Returns the reference-compatible metadata payload used by the chat composer.
 * @module app/api/files/upload/route
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";

const BUCKET_ID = "agent-files";
const UPLOAD_URL_EXPIRY_SECONDS = 60 * 60;

function sanitizeUploadFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "upload";
}

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

const fileSchema = z.object({
  file: z
    .custom<Blob>(isBlobLike, { message: "Invalid input" })
    .refine((file) => file.size <= MAX_UPLOAD_SIZE_BYTES, {
      message: "File size should be less than 10MB",
    })
    .refine((file) => ALLOWED_UPLOAD_TYPES.has(file.type), {
      message: "File type is not supported for chat uploads",
    }),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const filenameField = formData.get("filename");

    if (fileEntry === null || typeof fileEntry === "string") {
      return jsonError("No file uploaded", 400);
    }

    const validatedFile = fileSchema.safeParse({ file: fileEntry });
    if (!validatedFile.success) {
      return jsonError(
        validatedFile.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const clientId = await resolveClientId(supabase, userId);
    const filename = typeof filenameField === "string" && filenameField.trim().length > 0
      ? filenameField.trim()
      : (fileEntry as File).name;
    const sanitizedFilename = sanitizeUploadFilename(filename);
    const storageFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitizedFilename}`;
    const relativeStoragePath = `uploads/${storageFilename}`;
    const storagePath = `${clientId}/${relativeStoragePath}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_ID)
      .upload(storagePath, await fileEntry.arrayBuffer(), {
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      return jsonError("Upload failed", 500);
    }

    const signedUrlResponse = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(storagePath, UPLOAD_URL_EXPIRY_SECONDS);

    if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
      return jsonError("Upload failed", 500);
    }

    await captureServerEvent({
      distinctId: clientId,
      event: "file_uploaded",
      properties: {
        file_type: fileEntry.type,
        size_bytes: fileEntry.size,
      },
    });

    return Response.json({
      url: signedUrlResponse.data.signedUrl,
      storagePath: relativeStoragePath,
      pathname: filename,
      contentType: fileEntry.type,
    });
  } catch {
    return jsonError("Failed to process request", 500);
  }
}
