/**
 * Shared OAuth initiation flow for Composio connections.
 * @module lib/composio/connection-flow
 */
import { getComposio } from "./client";

export interface InitiateOAuthFlowParams {
  composioUserId: string;
  toolkitSlug: string;
  callbackUrl: string;
}

export interface InitiateOAuthFlowResult {
  redirectUrl: string;
  connectedAccountId: string;
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
  };
}
