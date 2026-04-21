/**
 * GET /api/connections/providers
 * Returns lightweight display metadata for one or more connection providers.
 * @module app/api/connections/providers/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { getCachedToolkitDisplayInfo } from "@/lib/composio/catalog";

const maxProviderBatchSize = 12;

function parseProviderSlugs(request: Request): string[] {
  const { searchParams } = new URL(request.url);
  const slugsParam = searchParams.get("slugs") ?? "";

  return [...new Set(
    slugsParam
      .split(",")
      .map((slug) => slug.trim().toLowerCase())
      .filter(Boolean),
  )];
}

export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  const slugs = parseProviderSlugs(request);

  if (slugs.length === 0) {
    return jsonError("At least one provider slug is required.", 400);
  }

  if (slugs.length > maxProviderBatchSize) {
    return jsonError(`Too many provider slugs. Maximum is ${maxProviderBatchSize}.`, 400);
  }

  try {
    const providers = await Promise.all(
      slugs.map((slug) => getCachedToolkitDisplayInfo(slug)),
    );

    return Response.json({ providers });
  } catch (error) {
    console.error("[connections/providers] Failed to load provider metadata batch:", error);
    return jsonError("Failed to load provider display metadata.", 500);
  }
}
