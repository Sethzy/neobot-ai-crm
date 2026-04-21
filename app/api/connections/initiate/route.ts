/**
 * Starts a Composio OAuth flow for one toolkit.
 * @module app/api/connections/initiate/route
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
import { hasLiveAuthRedirect } from "@/lib/connections/auth-link";
import { insertConnection } from "@/lib/connections/queries";

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
    const { data: pendingConnection, error: pendingConnectionError } = await supabase
      .from("connections")
      .select("id, auth_redirect_url, auth_redirect_expires_at")
      .eq("client_id", clientId)
      .eq("toolkit_slug", toolkit)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingConnectionError) {
      throw new Error(
        `Failed to check pending connection state: ${pendingConnectionError.message}`,
      );
    }

    if (pendingConnection) {
      if (hasLiveAuthRedirect(
        pendingConnection.auth_redirect_url,
        pendingConnection.auth_redirect_expires_at,
      )) {
        return Response.json({
          redirectUrl: pendingConnection.auth_redirect_url,
          expiresAt: pendingConnection.auth_redirect_expires_at,
        });
      }

      const { error: stalePendingDeleteError } = await supabase
        .from("connections")
        .delete()
        .eq("client_id", clientId)
        .eq("id", pendingConnection.id);

      if (stalePendingDeleteError) {
        throw new Error(
          `Failed to clear stale pending connection: ${stalePendingDeleteError.message}`,
        );
      }
    }

    const callbackUrl = new URL("/api/connections/callback", request.url);
    callbackUrl.searchParams.set("toolkit", toolkit);
    const { redirectUrl, authRedirectExpiresAt } = await initiateOAuthFlow({
      composioUserId: clientId,
      toolkitSlug: toolkit,
      callbackUrl: callbackUrl.toString(),
    });

    await insertConnection(supabase, {
      client_id: clientId,
      composio_connected_account_id: `pending:${crypto.randomUUID()}`,
      toolkit_slug: toolkit,
      display_name: null,
      account_identifier: null,
      auth_redirect_url: redirectUrl,
      auth_redirect_expires_at: authRedirectExpiresAt,
      status: "pending",
      activated_tools: [],
      tool_count: 0,
    });

    await captureServerEvent({
      distinctId: clientId,
      event: "connection_initiated",
      properties: {
        toolkit_slug: toolkit,
      },
    });

    return Response.json({ redirectUrl, expiresAt: authRedirectExpiresAt });
  } catch (error) {
    console.error("Failed to initiate Composio connection.", error);
    return jsonError("Failed to initiate connection.", 500);
  }
}
