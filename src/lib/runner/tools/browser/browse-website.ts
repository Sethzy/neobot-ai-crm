/**
 * Browser automation tool powered by Browser-Use Cloud (v3 API).
 * @module lib/runner/tools/browser/browse-website
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getBrowserUseClient } from "@/lib/browser-use/client";
import { getProfileForPlatform } from "@/lib/browser-use/profiles";
import type { Database } from "@/types/database";

/** v3 model tier — bu-mini for cost efficiency, bu-max for complex tasks. */
const BROWSER_USE_MODEL = "bu-mini" as const;

/** Hard per-call cost ceiling in USD. Browser-Use will stop the session when reached. */
const MAX_COST_PER_BROWSE_USD = 0.50;

const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
type BrowserSupabaseClient = SupabaseClient<Database>;

/**
 * Creates the public-site browsing tool for Browser-Use Cloud.
 */
export function createBrowseWebsiteTool(
  supabase?: BrowserSupabaseClient,
  clientId?: string,
) {
  const browse_website = tool({
    description:
      "Browse public websites to search, filter, click, fill forms, and extract data. " +
      "Provide a specific goal that states the site, actions, filters, fields to extract, " +
      "and the desired output format.",
    inputSchema: z.object({
      goal: z
        .string()
        .min(1)
        .describe(
          "A maximally specific browsing instruction that explains the site, actions, " +
            "filters, extracted fields, and desired output format.",
        ),
      startUrl: z
        .string()
        .url()
        .optional()
        .describe("Optional URL to open before the browser task starts."),
      outputDescription: z
        .string()
        .optional()
        .describe("Optional description of the exact result shape to return."),
      allowedDomains: z
        .array(
          z.string().regex(
            DOMAIN_PATTERN,
            "Each allowed domain must be a hostname like example.com",
          ),
        )
        .optional()
        .describe("Optional domain allowlist that restricts browser navigation."),
      platform: z
        .string()
        .trim()
        .min(1)
        .transform((value) => value.toLowerCase())
        .optional()
        .describe(
          "Optional platform slug for login-gated browsing, for example propnex, propertyguru, ura, hdb, or srx.",
        ),
    }),
    execute: async ({ goal, startUrl, outputDescription, allowedDomains, platform }) => {
      let client;
      try {
        client = getBrowserUseClient();
      } catch (error) {
        return {
          success: false as const,
          error:
            error instanceof Error
              ? error.message
              : "BROWSER_USE_API_KEY is not configured.",
        };
      }

      let profileId: string | undefined;
      if (platform) {
        if (!supabase || !clientId) {
          return {
            success: false as const,
            error: `Authenticated browsing for ${platform} is not available in this runtime.`,
          };
        }

        const profile = await getProfileForPlatform(supabase, clientId, platform);
        if (!profile) {
          return {
            success: false as const,
            error: `No saved login for ${platform}. Ask the user to connect it first.`,
            needsAuth: true as const,
            platform,
          };
        }

        profileId = profile.browser_use_profile_id;
      }

      // Build task prompt — fold startUrl, outputDescription, and allowedDomains into the text
      // since v3 manages these through the prompt rather than separate API params.
      const parts = [goal];
      if (startUrl) {
        parts.unshift(`Navigate to ${startUrl} first.`);
      }
      if (allowedDomains?.length) {
        parts.push(
          `IMPORTANT: Only navigate within these domains: ${allowedDomains.join(", ")}`,
        );
      }
      if (outputDescription) {
        parts.push(`Return the results in this format: ${outputDescription}`);
      }
      const taskPrompt = parts.join("\n\n");

      const result = await client.run(taskPrompt, {
        model: BROWSER_USE_MODEL,
        maxCostUsd: MAX_COST_PER_BROWSE_USD,
        keepAlive: false,
        ...(profileId ? { profileId } : {}),
      });

      return {
        success: Boolean(result.isTaskSuccessful),
        output: result.output,
        cost: {
          total: result.totalCostUsd,
          llm: result.llmCostUsd,
          proxy: result.proxyCostUsd,
          browser: result.browserCostUsd,
        },
      };
    },
  });

  return { browse_website };
}
