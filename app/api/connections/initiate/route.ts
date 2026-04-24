/**
 * Starts a Composio OAuth flow for one toolkit.
 * @module app/api/connections/initiate/route
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
import { hasLiveAuthRedirect } from "@/lib/connections/auth-link";
import { insertConnection } from "@/lib/connections/queries";
import { runAfter } from "@/lib/server/run-after";

const initiateConnectionBodySchema = z.object({
  toolkit: z.string().trim().min(1).transform((toolkit) => toolkit.toLowerCase()),
});

/**
 * Returns a hosted Composio OAuth redirect URL for the requested toolkit.
 */
export async function POST(request: Request): Promise<Response> {
  const requestResult = await authenticateAndParseBody(request, initiateConnectionBodySchema, {
    invalidJsonMessage: "Invalid JSON body.",
  });
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  try {
    const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
    const { toolkit } = requestResult.body;
    const { data: pendingConnection, error: pendingConnectionError } = await requestResult.supabase
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

      const { error: stalePendingDeleteError } = await requestResult.supabase
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

    await insertConnection(requestResult.supabase, {
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

    runAfter(() =>
      Promise.resolve(captureServerEvent({
        distinctId: clientId,
        event: "connection_initiated",
        properties: {
          toolkit_slug: toolkit,
        },
      })).catch((error) => {
        console.error("[connections/initiate] Failed to capture telemetry.", error);
      }),
    );

    return Response.json({ redirectUrl, expiresAt: authRedirectExpiresAt });
  } catch (error) {
    console.error("Failed to initiate Composio connection.", error);
    return jsonError("Failed to initiate connection.", 500);
  }
}
