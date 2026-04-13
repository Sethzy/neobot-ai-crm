/**
 * Generates fresh signed URLs for client-scoped files in agent-files.
 * @module app/api/files/download/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  AGENT_FILES_BUCKET,
  normalizeWorkspacePath,
} from "@/lib/storage/agent-files";

const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;

export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;
  const requestUrl = new URL(request.url);
  const rawPath = requestUrl.searchParams.get("path");
  const downloadFilename = requestUrl.searchParams.get("filename")?.trim();

  if (!rawPath || rawPath.trim().length === 0) {
    return jsonError("Missing path.", 400);
  }

  let normalizedPath: string;
  try {
    normalizedPath = normalizeWorkspacePath(rawPath, false);
  } catch {
    return jsonError("Invalid path.", 400);
  }

  // Only allow downloads from user-facing directories
  const firstSegment = normalizedPath.split("/")[0];
  if (
    firstSegment !== "uploads"
    && firstSegment !== "home"
    && firstSegment !== "attachments"
    && firstSegment !== "sessions"
  ) {
    return jsonError("Downloads are restricted to uploads/, home/, attachments/, and sessions/.", 403);
  }

  const clientId = await resolveClientId(supabase, userId);
  const signedUrlResponse = downloadFilename
    ? await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUrl(`${clientId}/${normalizedPath}`, DOWNLOAD_URL_EXPIRY_SECONDS, {
        download: downloadFilename,
      })
    : await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUrl(`${clientId}/${normalizedPath}`, DOWNLOAD_URL_EXPIRY_SECONDS);

  if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
    return jsonError("Failed to download file.", 500);
  }

  return Response.redirect(signedUrlResponse.data.signedUrl, 307);
}
