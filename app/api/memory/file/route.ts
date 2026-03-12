/**
 * Reads and writes a single memory file for the authenticated user.
 * @module app/api/memory/file/route
 */
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { MEMORY_BUCKET_ID, MEMORY_TEXT_CONTENT_TYPE } from "@/lib/memory/constants";
import {
  memoryFileQuerySchema,
  memoryFileWriteBodySchema,
} from "@/lib/memory/schemas";
import { downloadMemoryFile, getStorageErrorMessage, getStoragePath } from "@/lib/memory/storage";

export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;

  const { supabase, userId } = authResult;
  const pathResult = memoryFileQuerySchema.safeParse({
    path: new URL(request.url).searchParams.get("path"),
  });

  if (!pathResult.success) return jsonError("Invalid request.", 400);

  try {
    const clientId = await resolveClientId(supabase, userId);
    const result = await downloadMemoryFile(supabase, clientId, pathResult.data.path);

    if (result.kind === "missing") return jsonError("File not found.", 404);

    return Response.json({ path: pathResult.data.path, content: result.content });
  } catch (error) {
    console.error("Failed to load memory file.", error);
    return jsonError("Failed to load memory file.", 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;

  const { supabase, userId } = authResult;
  let parsedJson: unknown;

  try {
    parsedJson = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const bodyResult = memoryFileWriteBodySchema.safeParse(parsedJson);
  if (!bodyResult.success) return jsonError("Invalid request body.", 400);

  try {
    const clientId = await resolveClientId(supabase, userId);
    const storagePath = getStoragePath(clientId, bodyResult.data.path);
    const { error } = await supabase.storage
      .from(MEMORY_BUCKET_ID)
      .upload(storagePath, bodyResult.data.content, {
        upsert: true,
        contentType: MEMORY_TEXT_CONTENT_TYPE,
      });

    if (error) {
      throw new Error(`Failed to save file: ${getStorageErrorMessage(error)}`);
    }

    await captureServerEvent({
      distinctId: clientId,
      event: "memory_file_saved",
      properties: {
        filename: bodyResult.data.path,
        operation: "write",
        size_bytes: new TextEncoder().encode(bodyResult.data.content).byteLength,
        source: "dashboard",
      },
    });

    return Response.json({ success: true, path: bodyResult.data.path });
  } catch (error) {
    console.error("Failed to save memory file.", error);
    return jsonError("Failed to save memory file.", 500);
  }
}
