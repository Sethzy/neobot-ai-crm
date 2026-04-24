/**
 * Confirms a direct-to-Supabase chat file upload and returns the signed GET URL.
 * @module app/api/files/confirm/route
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { runAfter } from "@/lib/server/run-after";

const BUCKET_ID = "agent-files";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

const confirmSchema = z.object({
  storagePath: z.string().min(1, "Storage path is required"),
  filename: z.string().min(1, "Filename is required"),
  contentType: z.string().min(1, "Content type is required"),
  size: z.number().int().positive(),
});

function isValidUploadPath(storagePath: string): boolean {
  return storagePath.startsWith("uploads/") && !storagePath.includes("..");
}

export async function POST(request: Request) {
  const requestResult = await authenticateAndParseBody(request, confirmSchema, {
    invalidBodyMessage: (error) => error.issues.map((issue) => issue.message).join(", "),
  });
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  try {
    const { storagePath, filename, contentType, size } = requestResult.body;

    if (!isValidUploadPath(storagePath)) {
      return jsonError("Invalid storage path", 400);
    }

    const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
    const fullStoragePath = `${clientId}/${storagePath}`;
    const { data, error } = await requestResult.supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(fullStoragePath, SIGNED_URL_EXPIRY_SECONDS);

    if (error || !data?.signedUrl) {
      return jsonError("Upload confirmation failed", 500);
    }

    runAfter(() =>
      Promise.resolve(captureServerEvent({
        distinctId: clientId,
        event: "file_uploaded",
        properties: {
          file_type: contentType,
          size_bytes: size,
        },
      })).catch((error) => {
        console.error("[files/confirm] Failed to capture upload telemetry.", error);
      }),
    );

    return Response.json({
      url: data.signedUrl,
      storagePath,
      pathname: filename,
      contentType,
    });
  } catch {
    return jsonError("Failed to process request", 500);
  }
}
