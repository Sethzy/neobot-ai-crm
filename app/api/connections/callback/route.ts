/**
 * Finalizes a Composio OAuth callback into Sunder's connection metadata table.
 * @module app/api/connections/callback/route
 */
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getComposio } from "@/lib/composio";
import { upsertConnection } from "@/lib/connections/queries";

function buildSettingsRedirect(
  request: Request,
  params: Record<string, string>,
): NextResponse {
  const redirectUrl = new URL("/settings", request.url);

  Object.entries(params).forEach(([key, value]) => {
    redirectUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(redirectUrl);
}

function getFirstSearchParam(
  searchParams: URLSearchParams,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = searchParams.get(key)?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function isSuccessfulCallbackStatus(status: string | null): boolean {
  if (!status) {
    return false;
  }

  return ["success", "active"].includes(status.toLowerCase());
}

/**
 * Verifies the callback result with Composio, persists the active connection row,
 * and redirects the browser back to Settings.
 */
export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return buildSettingsRedirect(request, {
      connection: "error",
      reason: "unauthorized",
    });
  }

  const requestUrl = new URL(request.url);
  const callbackStatus = getFirstSearchParam(requestUrl.searchParams, [
    "status",
    "connectionStatus",
  ]);
  const connectedAccountId = getFirstSearchParam(requestUrl.searchParams, [
    "connected_account_id",
    "connectedAccountId",
  ]);

  if (!callbackStatus || !connectedAccountId) {
    return buildSettingsRedirect(request, {
      connection: "error",
      reason: "invalid_callback",
    });
  }

  if (!isSuccessfulCallbackStatus(callbackStatus)) {
    return buildSettingsRedirect(request, {
      connection: "error",
      reason: "failed",
    });
  }

  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const composio = getComposio();
    const connectedAccount = await composio.connectedAccounts.get(connectedAccountId);

    if (connectedAccount.status !== "ACTIVE") {
      return buildSettingsRedirect(request, {
        connection: "error",
        reason: "inactive",
      });
    }

    const ownedActiveConnections = await composio.connectedAccounts.list({
      userIds: [clientId],
      statuses: ["ACTIVE"],
      toolkitSlugs: [connectedAccount.toolkit.slug],
      limit: 100,
    });
    const isOwnedByClient = ownedActiveConnections.items.some(
      (ownedConnection) => ownedConnection.id === connectedAccount.id,
    );

    if (!isOwnedByClient) {
      return buildSettingsRedirect(request, {
        connection: "error",
        reason: "ownership",
      });
    }

    await upsertConnection(supabase, {
      client_id: clientId,
      composio_connected_account_id: connectedAccount.id,
      toolkit_slug: connectedAccount.toolkit.slug,
      display_name: null,
      status: "active",
    });

    return buildSettingsRedirect(request, {
      connection: "success",
      toolkit: connectedAccount.toolkit.slug,
    });
  } catch (error) {
    console.error("Failed to finalize Composio connection callback.", error);
    return buildSettingsRedirect(request, {
      connection: "error",
      reason: "callback_failed",
    });
  }
}
