/**
 * Starts a Composio OAuth flow for one toolkit.
 * @module app/api/connections/initiate/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getComposio } from "@/lib/composio";
import { getActiveConnectionByToolkit } from "@/lib/connections/queries";

const initiateConnectionBodySchema = z.object({
  toolkit: z.string().trim().min(1).transform((toolkit) => toolkit.toLowerCase()),
});

/**
 * Returns a hosted Composio OAuth redirect URL for the requested toolkit.
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return authResult.response;
  }

  let parsedJson: unknown;

  try {
    parsedJson = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const bodyResult = initiateConnectionBodySchema.safeParse(parsedJson);

  if (!bodyResult.success) {
    return jsonError("Invalid request body.", 400);
  }

  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const { toolkit } = bodyResult.data;
    const existingConnection = await getActiveConnectionByToolkit(
      supabase,
      clientId,
      toolkit,
    );

    if (existingConnection) {
      return jsonError("Service already connected.", 409);
    }

    const composio = getComposio();
    const authConfigs = await composio.authConfigs.list({
      toolkit,
      isComposioManaged: true,
    });
    const reusableAuthConfig = authConfigs.items.find((authConfig) => authConfig.status === "ENABLED");
    const authConfigId = reusableAuthConfig?.id
      ?? (
        await composio.authConfigs.create(toolkit, {
          type: "use_composio_managed_auth",
          name: `${toolkit} Auth Config`,
        })
      ).id;
    const callbackUrl = new URL("/api/connections/callback", request.url).toString();
    const connectionRequest = await composio.connectedAccounts.link(clientId, authConfigId, {
      callbackUrl,
    });

    if (!connectionRequest.redirectUrl) {
      throw new Error("Composio did not return a redirect URL.");
    }

    return Response.json({ redirectUrl: connectionRequest.redirectUrl });
  } catch (error) {
    console.error("Failed to initiate Composio connection.", error);
    return jsonError("Failed to initiate connection.", 500);
  }
}
