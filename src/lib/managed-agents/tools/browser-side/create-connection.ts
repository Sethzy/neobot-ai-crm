/**
 * create_connection tool for managed agents.
 *
 * @module lib/managed-agents/tools/browser-side/create-connection
 */
import { z } from "zod";

import { getToolkitDisplayInfo } from "@/lib/composio/catalog";
import { getCallbackUrl, initiateOAuthFlow } from "@/lib/composio/connection-flow";

import {
  getSupportedProviderDisplayName,
  normalizeSupportedProviderSlug,
  SUPPORTED_PROVIDER_NAMES_FOR_PROMPT,
} from "../supported-providers";
import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  integrations: z.array(
    z.object({
      integrationId: z.string().trim().min(1),
      toolsToActivate: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
});

type CreateConnectionInput = z.infer<typeof inputSchema>;

function buildCreateConnectionError(
  integrationId: string,
  displayName: string,
  error: string,
): {
  integrationId: string;
  displayName: string;
  error: string;
} {
  return {
    integrationId,
    displayName,
    error,
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
    "Start the OAuth flow for a supported provider. The user completes authorization in an inline auth card in chat.",
    "",
    `Supported providers (v1): ${SUPPORTED_PROVIDER_NAMES_FOR_PROMPT}. Common naming variants are accepted.`,
    "",
    "Behavior:",
    "- If the provider is already connected, this returns an 'already connected' error per integration. Direct the user to reauthorize if credentials are stale, or disconnect first if they want a different account.",
    "- If the provider is not in the supported list, this returns a 'not supported' error. Do not attempt discovery or capability inspection.",
    "- After calling this tool, END YOUR TURN. The provider is not usable in the current run. It becomes usable on the user's next message after OAuth completes.",
    "",
    "For each integration you include, the response reports either a pending_auth card with a redirectUrl, or an error.",
  ].join("\n"),
  inputSchema,
  execute: async ({ integrations }, context) => {
    const results: Array<
      | {
          integrationId: string;
          displayName: string;
          description: string;
          connectionStatus: "pending_auth";
          redirectUrl: string;
          composioConnectedAccountId: string;
        }
      | {
          integrationId: string;
          displayName: string;
          error: string;
        }
    > = [];

    for (const integration of integrations) {
      const providerSlug = normalizeSupportedProviderSlug(integration.integrationId);

      if (!providerSlug) {
        results.push(buildCreateConnectionError(
          integration.integrationId,
          integration.integrationId,
          `Provider '${integration.integrationId}' is not supported in v1. ` +
            `Supported providers: ${SUPPORTED_PROVIDER_NAMES_FOR_PROMPT}.`,
        ));
        continue;
      }

      const callbackUrl = getCallbackUrl(
        providerSlug,
        context.threadId ? { threadId: context.threadId } : undefined,
      );
      const toolkitDisplayInfo = await getToolkitDisplayInfo(providerSlug).catch(() => ({
        integrationId: providerSlug,
        displayName: getSupportedProviderDisplayName(providerSlug),
        description: "",
      }));
      const displayName = toolkitDisplayInfo.displayName;

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
        ));
        continue;
      }

      if (existingConnection) {
        results.push(buildCreateConnectionError(
          providerSlug,
          displayName,
          "Already connected. Ask the user to reauthorize this provider if credentials are stale, or disconnect it first to connect a different account.",
        ));
        continue;
      }

      let redirectUrl: string;
      let connectedAccountId: string;

      try {
        const oauthFlow = await initiateOAuthFlow({
          composioUserId: context.clientId,
          toolkitSlug: providerSlug,
          callbackUrl,
        });
        redirectUrl = oauthFlow.redirectUrl;
        connectedAccountId = oauthFlow.connectedAccountId;
      } catch (error) {
        results.push(buildCreateConnectionError(
          providerSlug,
          displayName,
          `Could not start ${displayName}: ${getErrorMessage(error)}`,
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
          status: "pending",
          activated_tools: [],
          tool_count: 0,
        });

      if (insertError) {
        results.push(buildCreateConnectionError(
          providerSlug,
          displayName,
          `Could not start ${displayName}: ${insertError.message}`,
        ));
        continue;
      }

      results.push({
        integrationId: providerSlug,
        displayName,
        description: toolkitDisplayInfo.description,
        connectionStatus: "pending_auth",
        redirectUrl,
        composioConnectedAccountId: connectedAccountId,
      });
    }

    const hasPendingAuthCard = results.some((result) => "connectionStatus" in result);

    return {
      success: true as const,
      message: hasPendingAuthCard
        ? "Auth card(s) are now visible in chat. End this turn. The provider becomes usable on the user's next message after they complete OAuth."
        : "No new connection cards were created. Review per-integration errors below and stop; do not retry.",
      results,
    };
  },
};
