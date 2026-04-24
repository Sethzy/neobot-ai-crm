/**
 * Generates signed upload URLs for browser-recorded meeting audio files.
 * @module app/api/meetings/upload-url/route
 */
import { z } from "zod";

import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

const AGENT_FILES_BUCKET = "agent-files";

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
]);

/**
 * Strips codec parameters from MIME types (e.g. "audio/webm;codecs=opus" → "audio/webm")
 * before validating against the allowlist. Browsers commonly include codec suffixes
 * that don't affect our storage or transcription pipeline.
 */
const requestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string()
    .transform((ct) => ct.split(";")[0].trim())
    .refine((ct) => ALLOWED_AUDIO_TYPES.has(ct), {
      message: "Unsupported audio format",
    }),
  durationSeconds: z.number().int().positive().optional(),
});

function resolveAudioExtension(filename: string, contentType: string): string {
  const explicitExtension = filename.split(".").pop()?.trim().toLowerCase();

  if (explicitExtension && explicitExtension !== filename.toLowerCase()) {
    return explicitExtension;
  }

  const typeExtension = contentType.split("/").pop()?.trim().toLowerCase();

  return typeExtension === "x-m4a" ? "m4a" : (typeExtension || "webm");
}

export async function POST(request: Request) {
  const requestResult = await authenticateAndParseBody(request, requestSchema, {
    invalidBodyMessage: (error) => error.issues.map((issue) => issue.message).join(", "),
  });
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  try {
    const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
    const extension = resolveAudioExtension(
      requestResult.body.filename,
      requestResult.body.contentType,
    );
    const storagePath = `${clientId}/meetings/raw/${crypto.randomUUID()}.${extension}`;

    const { data, error } = await requestResult.supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl || !data.token || !data.path) {
      return jsonError("Failed to generate upload URL", 500);
    }

    return Response.json({
      signedUrl: data.signedUrl,
      path: data.path,
      storagePath,
      token: data.token,
    });
  } catch {
    return jsonError("Invalid request body", 400);
  }
}
