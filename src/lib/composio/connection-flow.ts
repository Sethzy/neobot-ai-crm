/**
 * Shared OAuth initiation flow for Composio connections.
 * @module lib/composio/connection-flow
 */
import { getComposio } from "./client";

/**
 * Builds the OAuth callback URL for a given toolkit, with an optional reason param.
 */
export function getCallbackUrl(
  toolkitSlug: string,
  options?: { reason?: string; threadId?: string },
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for connection OAuth flows.");
  }

  const callbackUrl = new URL("/api/connections/callback", appUrl);
  callbackUrl.searchParams.set("toolkit", toolkitSlug);

  if (options?.reason) {
    callbackUrl.searchParams.set("reason", options.reason);
  }

  if (options?.threadId) {
    callbackUrl.searchParams.set("thread", options.threadId);
  }

  return callbackUrl.toString();
}

export interface InitiateOAuthFlowParams {
  composioUserId: string;
  toolkitSlug: string;
  callbackUrl: string;
}

export interface InitiateOAuthFlowResult {
  redirectUrl: string;
  connectedAccountId: string;
  authRedirectExpiresAt: string | null;
}

function normalizeAuthRedirectExpiresAt(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsedTimestamp = Date.parse(value);

  if (!Number.isFinite(parsedTimestamp)) {
    return null;
  }

  return new Date(parsedTimestamp).toISOString();
}

/**
 * Initiates an OAuth flow via Composio and returns the hosted redirect URL.
 * Reuses an existing ENABLED managed auth config when available.
 */
export async function initiateOAuthFlow(
  params: InitiateOAuthFlowParams,
): Promise<InitiateOAuthFlowResult> {
  const composio = getComposio();
  const authConfigs = await composio.authConfigs.list({
    toolkit: params.toolkitSlug,
    isComposioManaged: true,
  });
  const reusableAuthConfig = authConfigs.items.find(
    (authConfig) => authConfig.status === "ENABLED",
  );
  const authConfigId = reusableAuthConfig?.id
    ?? (
      await composio.authConfigs.create(params.toolkitSlug, {
        type: "use_composio_managed_auth",
        name: `${params.toolkitSlug} Auth Config`,
      })
    ).id;
  const connectionRequest = await composio.connectedAccounts.link(
    params.composioUserId,
    authConfigId,
    { callbackUrl: params.callbackUrl },
  );

  if (!connectionRequest.redirectUrl) {
    throw new Error("Composio did not return a redirect URL.");
  }

  if (!connectionRequest.id) {
    throw new Error("Composio did not return a connected account ID.");
  }

  return {
    redirectUrl: connectionRequest.redirectUrl,
    connectedAccountId: connectionRequest.id,
    authRedirectExpiresAt: normalizeAuthRedirectExpiresAt(
      (connectionRequest as { expiresAt?: unknown; expires_at?: unknown }).expiresAt
        ?? (connectionRequest as { expiresAt?: unknown; expires_at?: unknown }).expires_at,
    ),
  };
}
