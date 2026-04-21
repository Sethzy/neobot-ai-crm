/**
 * GET /api/connections/providers/[slug]
 * Returns lightweight display metadata for a connection provider.
 * @module app/api/connections/providers/[slug]/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { getCachedToolkitDisplayInfo } from "@/lib/composio/catalog";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();

  if (normalizedSlug.length === 0) {
    return jsonError("Provider slug is required.", 400);
  }

  try {
    const displayInfo = await getCachedToolkitDisplayInfo(normalizedSlug);
    return Response.json(displayInfo);
  } catch (error) {
    console.error("[connections/providers] Failed to load display metadata:", error);
    return jsonError("Failed to load provider display metadata.", 500);
  }
}
