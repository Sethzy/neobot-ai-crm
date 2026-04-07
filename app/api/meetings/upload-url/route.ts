/**
 * Generates signed upload URLs for browser-recorded meeting audio files.
 * @module app/api/meetings/upload-url/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
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
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;

  try {
    const requestBody = await request.json();
    const parsedBody = requestSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return jsonError(
        parsedBody.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const clientId = await resolveClientId(supabase, userId);
    const extension = resolveAudioExtension(
      parsedBody.data.filename,
      parsedBody.data.contentType,
    );
    const storagePath = `${clientId}/meetings/raw/${crypto.randomUUID()}.${extension}`;

    const { data, error } = await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl || !data.token) {
      return jsonError("Failed to generate upload URL", 500);
    }

    return Response.json({
      uploadUrl: data.signedUrl,
      storagePath,
      token: data.token,
    });
  } catch {
    return jsonError("Invalid request body", 400);
  }
}
