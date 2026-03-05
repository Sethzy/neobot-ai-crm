/**
 * Reads and writes a single memory file for the authenticated user.
 * @module app/api/memory/file/route
 */
import { resolveClientId } from "@/lib/chat/client-id";
import { bootstrapMemoryFiles } from "@/lib/memory/bootstrap";
import { MEMORY_BUCKET_ID, MEMORY_TEXT_CONTENT_TYPE } from "@/lib/memory/constants";
import {
  memoryFileQuerySchema,
  memoryFileWriteBodySchema,
} from "@/lib/memory/schemas";
import {
  decodeStorageTextPayload,
  getStorageErrorMessage,
  isMissingStorageObjectError,
} from "@/lib/memory/storage";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AuthenticatedUser = { id: string };
type AuthResult =
  | { kind: "error"; errorResponse: Response }
  | { kind: "ok"; supabase: SupabaseServerClient; user: AuthenticatedUser };

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function logServerError(context: string, error: unknown): void {
  console.error(context, error);
}

async function authenticateRequest(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { kind: "error", errorResponse: jsonError("Unauthorized.", 401) };
  }

  return { kind: "ok", supabase, user };
}

export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.errorResponse;
  }

  const { supabase, user } = authResult;
  const pathResult = memoryFileQuerySchema.safeParse({
    path: new URL(request.url).searchParams.get("path"),
  });

  if (!pathResult.success) {
    return jsonError("Invalid request.", 400);
  }

  try {
    const clientId = await resolveClientId(supabase, user.id);
    await bootstrapMemoryFiles(supabase, clientId);
    const storagePath = `${clientId}/${pathResult.data.path}`;
    const { data, error } = await supabase.storage
      .from(MEMORY_BUCKET_ID)
      .download(storagePath);

    if (error || !data) {
      if (isMissingStorageObjectError(error)) {
        return jsonError("File not found.", 404);
      }

      throw new Error(`Failed to read file: ${getStorageErrorMessage(error)}`);
    }

    const content = await decodeStorageTextPayload(data, pathResult.data.path);
    return Response.json({
      path: pathResult.data.path,
      content,
    });
  } catch (unexpectedError) {
    logServerError("Failed to load memory file.", unexpectedError);
    return jsonError("Failed to load memory file.", 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.errorResponse;
  }

  const { supabase, user } = authResult;
  let parsedJson: unknown;

  try {
    parsedJson = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const bodyResult = memoryFileWriteBodySchema.safeParse(parsedJson);
  if (!bodyResult.success) {
    return jsonError("Invalid request body.", 400);
  }

  try {
    const clientId = await resolveClientId(supabase, user.id);
    const storagePath = `${clientId}/${bodyResult.data.path}`;
    const { error } = await supabase.storage
      .from(MEMORY_BUCKET_ID)
      .upload(storagePath, bodyResult.data.content, {
        upsert: true,
        contentType: MEMORY_TEXT_CONTENT_TYPE,
      });

    if (error) {
      throw new Error(`Failed to save file: ${getStorageErrorMessage(error)}`);
    }

    return Response.json({
      success: true,
      path: bodyResult.data.path,
    });
  } catch (unexpectedError) {
    logServerError("Failed to save memory file.", unexpectedError);
    return jsonError("Failed to save memory file.", 500);
  }
}
