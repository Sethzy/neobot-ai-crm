/**
 * create_connection tool for managed agents.
 *
 * @module lib/managed-agents/tools/browser-side/create-connection
 */
import { z } from "zod";

import { getCachedToolkitDisplayInfo } from "@/lib/composio/catalog";
import { getCallbackUrl, initiateOAuthFlow } from "@/lib/composio/connection-flow";
import { hasLiveAuthRedirect } from "@/lib/connections/auth-link";

import {
  getSupportedProviderDescription,
  getSupportedProviderDisplayName,
  normalizeSupportedProviderSlug,
  SUPPORTED_PROVIDER_NAMES_FOR_PROMPT,
} from "../supported-providers";
import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  integrations: z.array(z.string().trim().min(1)),
});

type CreateConnectionInput = z.infer<typeof inputSchema>;

function buildCreateConnectionError(
  integrationId: string,
  displayName: string,
  error: string,
  logoUrl: string | null = null,
): {
  integrationId: string;
  displayName: string;
  error: string;
  logoUrl: string | null;
} {
  return {
    integrationId,
    displayName,
    error,
    logoUrl,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown error.";
}

export const createConnectionTool: ManagedAgentTool<CreateConnectionInput> = {
  name: "create_connection",
  description: [
    "Start a sign-in flow for a supported provider and show an inline connect card in chat.",
    "Call format: {\"integrations\":[\"notion\"]}. Use provider strings inside the integrations array.",
    `Supported providers (v1): ${SUPPORTED_PROVIDER_NAMES_FOR_PROMPT}. Common naming variants are accepted.`,
    "Legacy object variants may still work, but the preferred shape is a string array.",
    "If the provider is already connected, return the per-integration error and suggest reauthorize or disconnect.",
    "If the provider is unsupported, return the per-integration error. Do not search the catalog or inspect capabilities first.",
    "After calling this tool, end your turn. The provider is usable only on the user's next message after sign-in completes.",
    "In your reply, say 'connect' or 'sign in'. Never say 'auth card', 'OAuth', or 'authorize'. Keep the reply to one short sentence.",
  ].join("\n"),
  inputSchema,
  execute: async ({ integrations }, context) => {
    const results: Array<
      | {
          integrationId: string;
          displayName: string;
          description: string;
          logoUrl: string | null;
          connectionStatus: "pending_auth";
          redirectUrl: string;
          authRedirectExpiresAt: string | null;
          composioConnectedAccountId: string;
        }
      | {
          integrationId: string;
          displayName: string;
          error: string;
          logoUrl: string | null;
        }
    > = [];

    for (const integrationId of integrations) {
      const providerSlug = normalizeSupportedProviderSlug(integrationId);

      if (!providerSlug) {
        results.push(buildCreateConnectionError(
          integrationId,
          integrationId,
          `Provider '${integrationId}' is not supported in v1. ` +
            `Supported providers: ${SUPPORTED_PROVIDER_NAMES_FOR_PROMPT}.`,
        ));
        continue;
      }

      const callbackUrl = getCallbackUrl(
        providerSlug,
        context.threadId ? { threadId: context.threadId } : undefined,
      );
      const fallbackDisplayName = getSupportedProviderDisplayName(providerSlug);
      const fallbackDescription = getSupportedProviderDescription(providerSlug);
      const toolkitDisplayInfo = await getCachedToolkitDisplayInfo(providerSlug).catch(
        () => ({
          integrationId: providerSlug,
          displayName: fallbackDisplayName,
          description: fallbackDescription,
          logoUrl: null,
        }),
      );
      const displayName = toolkitDisplayInfo.displayName || fallbackDisplayName;
      const description = toolkitDisplayInfo.description || fallbackDescription;
      const logoUrl = toolkitDisplayInfo.logoUrl ?? null;

      const { data: existingConnection, error } = await context.supabase
        .from("connections")
        .select("*")
        .eq("client_id", context.clientId)
        .eq("toolkit_slug", providerSlug)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        results.push(buildCreateConnectionError(
          providerSlug,
          displayName,
          `Could not start ${displayName}: ${error.message}`,
          logoUrl,
        ));
        continue;
      }

      if (existingConnection) {
        if (existingConnection.status === "pending") {
          if (hasLiveAuthRedirect(
            existingConnection.auth_redirect_url,
            existingConnection.auth_redirect_expires_at,
          )) {
            results.push({
              integrationId: providerSlug,
              displayName,
              description,
              logoUrl,
              connectionStatus: "pending_auth",
              redirectUrl: existingConnection.auth_redirect_url!,
              authRedirectExpiresAt: existingConnection.auth_redirect_expires_at,
              composioConnectedAccountId: existingConnection.composio_connected_account_id,
            });
            continue;
          }

          const { error: deletePendingError } = await context.supabase
            .from("connections")
            .delete()
            .eq("client_id", context.clientId)
            .eq("id", existingConnection.id);

          if (deletePendingError) {
            results.push(buildCreateConnectionError(
              providerSlug,
              displayName,
              `Could not restart ${displayName}: ${deletePendingError.message}`,
              logoUrl,
            ));
            continue;
          }
        } else {
          results.push(buildCreateConnectionError(
            providerSlug,
            displayName,
            "Already connected. Ask the user to reauthorize this provider if credentials are stale, or disconnect it first to connect a different account.",
            logoUrl,
          ));
          continue;
        }
      }

      let redirectUrl: string;
      let connectedAccountId: string;
      let authRedirectExpiresAt: string | null;

      try {
        const oauthFlow = await initiateOAuthFlow({
          composioUserId: context.clientId,
          toolkitSlug: providerSlug,
          callbackUrl,
        });
        redirectUrl = oauthFlow.redirectUrl;
        connectedAccountId = oauthFlow.connectedAccountId;
        authRedirectExpiresAt = oauthFlow.authRedirectExpiresAt;
      } catch (error) {
        results.push(buildCreateConnectionError(
          providerSlug,
          displayName,
          `Could not start ${displayName}: ${getErrorMessage(error)}`,
          logoUrl,
        ));
        continue;
      }

      const { error: insertError } = await context.supabase
        .from("connections")
        .insert({
          client_id: context.clientId,
          composio_connected_account_id: connectedAccountId,
          toolkit_slug: providerSlug,
          display_name: null,
          account_identifier: null,
          auth_redirect_url: redirectUrl,
          auth_redirect_expires_at: authRedirectExpiresAt,
          status: "pending",
          activated_tools: [],
          tool_count: 0,
        });

      if (insertError) {
        results.push(buildCreateConnectionError(
          providerSlug,
          displayName,
          `Could not start ${displayName}: ${insertError.message}`,
          logoUrl,
        ));
        continue;
      }

      results.push({
        integrationId: providerSlug,
        displayName,
        description,
        logoUrl,
        connectionStatus: "pending_auth",
        redirectUrl,
        authRedirectExpiresAt,
        composioConnectedAccountId: connectedAccountId,
      });
    }

    const hasPendingCard = results.some((result) => "connectionStatus" in result);

    return {
      success: true as const,
      message: hasPendingCard
        ? "A connect card was shown to the user above. In your reply: tell them briefly to click Connect and sign in, and say you'll pick it up on their next message. Do not use the words 'auth card', 'OAuth', or 'authorize' in your reply — say 'connect' or 'sign in' instead. End your turn after that reply."
        : "No connection was started. Tell the user what went wrong using the per-integration errors, and ask what they'd like to do next.",
      results,
    };
  },
};
