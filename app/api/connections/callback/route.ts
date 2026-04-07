/**
 * Finalizes a Composio OAuth callback into Sunder's connection metadata table.
 * @module app/api/connections/callback/route
 */
import { NextResponse } from "next/server";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { COMPOSIO_TOOL_FETCH_LIMIT, getComposio } from "@/lib/composio";
import {
  deleteConnection,
  getConnectionByConnectedAccountId,
  getPendingConnectionByToolkit,
  insertConnection,
  updateConnection,
} from "@/lib/connections/queries";

function buildRedirect(
  request: Request,
  params: Record<string, string>,
): NextResponse {
  const requestUrl = new URL(request.url);
  const threadId = requestUrl.searchParams.get("thread");
  const basePath = threadId ? `/chat/${threadId}` : "/settings";
  const redirectUrl = new URL(basePath, request.url);

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

function getAccountIdentifier(connectedAccount: {
  data?: Record<string, unknown> | null;
  params?: Record<string, unknown> | null;
}): string | null {
  const dataEmail = connectedAccount.data?.email;

  if (typeof dataEmail === "string" && dataEmail.length > 0) {
    return dataEmail;
  }

  const paramsEmail = connectedAccount.params?.email;
  return typeof paramsEmail === "string" && paramsEmail.length > 0 ? paramsEmail : null;
}

/**
 * Verifies the callback result with Composio, persists the active connection row,
 * and redirects the browser back to Settings.
 */
export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return buildRedirect(request, {
      connection: "error",
      reason: "unauthorized",
    });
  }

  const requestUrl = new URL(request.url);
  const callbackToolkit = getFirstSearchParam(requestUrl.searchParams, ["toolkit"]);
  const callbackStatus = getFirstSearchParam(requestUrl.searchParams, [
    "status",
    "connectionStatus",
  ]);
  const callbackReason = getFirstSearchParam(requestUrl.searchParams, ["reason"]);
  const connectedAccountId = getFirstSearchParam(requestUrl.searchParams, [
    "connected_account_id",
    "connectedAccountId",
  ]);
  const { supabase, userId } = authResult;
  let cachedClientId: string | null = null;

  async function getClientId(): Promise<string> {
    if (!cachedClientId) {
      cachedClientId = await resolveClientId(supabase, userId);
    }

    return cachedClientId;
  }

  async function handlePendingFailure(toolkitSlug: string | null): Promise<void> {
    if (!toolkitSlug) {
      return;
    }

    const clientId = await getClientId();
    const pendingConnection = await getPendingConnectionByToolkit(supabase, clientId, toolkitSlug);

    if (!pendingConnection) {
      return;
    }

    if (callbackReason?.toLowerCase() === "reauth") {
      await updateConnection(supabase, clientId, {
        id: pendingConnection.id,
        status: "error",
      });
      return;
    }

    await deleteConnection(supabase, clientId, pendingConnection.id);
  }

  if (!callbackStatus || !connectedAccountId) {
    try {
      await handlePendingFailure(callbackToolkit);
    } catch (error) {
      console.error("Failed to clear pending connection after invalid callback.", error);
    }

    return buildRedirect(request, {
      connection: "error",
      reason: "invalid_callback",
    });
  }

  if (!isSuccessfulCallbackStatus(callbackStatus)) {
    try {
      await handlePendingFailure(callbackToolkit);
    } catch (error) {
      console.error("Failed to clear pending connection after failed callback.", error);
    }

    return buildRedirect(request, {
      connection: "error",
      reason: "failed",
    });
  }
  let verifiedToolkitSlug: string | null = callbackToolkit;

  try {
    const clientId = await getClientId();
    const composio = getComposio();
    const connectedAccount = await composio.connectedAccounts.get(connectedAccountId);
    verifiedToolkitSlug = connectedAccount.toolkit.slug;

    if (connectedAccount.status !== "ACTIVE") {
      await handlePendingFailure(verifiedToolkitSlug);

      return buildRedirect(request, {
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
      await handlePendingFailure(verifiedToolkitSlug);

      return buildRedirect(request, {
        connection: "error",
        reason: "ownership",
      });
    }
    const rawTools = await composio.tools.getRawComposioTools({
      toolkits: [connectedAccount.toolkit.slug],
      limit: COMPOSIO_TOOL_FETCH_LIMIT,
    });
    const nextConnectionState = {
      composio_connected_account_id: connectedAccount.id,
      toolkit_slug: connectedAccount.toolkit.slug,
      display_name: null,
      account_identifier: getAccountIdentifier(connectedAccount),
      status: "active" as const,
      tool_count: rawTools.length,
    };
    const pendingConnection = await getPendingConnectionByToolkit(
      supabase,
      clientId,
      connectedAccount.toolkit.slug,
    );
    const existingConnection = await getConnectionByConnectedAccountId(
      supabase,
      clientId,
      connectedAccount.id,
    );

    if (existingConnection) {
      await updateConnection(supabase, clientId, {
        id: existingConnection.id,
        ...nextConnectionState,
      });

      if (pendingConnection && pendingConnection.id !== existingConnection.id) {
        await deleteConnection(supabase, clientId, pendingConnection.id);
      }
    } else {
      if (pendingConnection) {
        await updateConnection(supabase, clientId, {
          id: pendingConnection.id,
          ...nextConnectionState,
        });
      } else {
        await insertConnection(supabase, {
          client_id: clientId,
          ...nextConnectionState,
          activated_tools: [],
        });
      }
    }

    await captureServerEvent({
      distinctId: clientId,
      event: "connection_completed",
      properties: {
        toolkit_slug: connectedAccount.toolkit.slug,
      },
    });

    return buildRedirect(request, {
      connection: "success",
      toolkit: connectedAccount.toolkit.slug,
    });
  } catch (error) {
    try {
      await handlePendingFailure(verifiedToolkitSlug);
    } catch (cleanupError) {
      console.error("Failed to clear pending connection after callback error.", cleanupError);
    }

    console.error("Failed to finalize Composio connection callback.", error);
    return buildRedirect(request, {
      connection: "error",
      reason: "callback_failed",
    });
  }
}
