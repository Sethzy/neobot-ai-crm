/**
 * browse_website tool for managed agents.
 *
 * @module lib/managed-agents/tools/browser/browse-website
 */
import { z } from "zod";

import { getBrowserUseClient } from "@/lib/browser-use/client";
import { getProfileForPlatform } from "@/lib/browser-use/profiles";

import type { ManagedAgentTool } from "../types";

const BROWSER_USE_MODEL = "browser-use-2.0" as const;
const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

const inputSchema = z.object({
  goal: z.string().min(1).describe(
    "A maximally specific browsing instruction that explains the site, actions, filters, extracted fields, and desired output format.",
  ),
  startUrl: z.string().url().optional().describe("Optional URL to open before the browser task starts."),
  outputDescription: z.string().optional().describe("Optional description of the exact result shape to return."),
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
    .optional()
    .describe(
      "Optional platform slug for login-gated browsing, for example propnex, propertyguru, ura, hdb, or srx.",
    ),
});

type BrowseWebsiteInput = z.infer<typeof inputSchema>;
type BrowseWebsiteResult =
  | { success: false; error: string }
  | { success: false; error: string; needsAuth: true; platform: string }
  | {
      success: boolean;
      output: string;
      cost: {
        total: number;
        llm: number;
        proxy: number;
        browser: number;
      };
    };

export const browseWebsiteTool: ManagedAgentTool<BrowseWebsiteInput, BrowseWebsiteResult> = {
  name: "browse_website",
  description:
    "Browse public websites to search, filter, click, fill forms, and extract data. Provide a specific goal that states the site, actions, filters, fields to extract, and the desired output format.",
  inputSchema,
  execute: async ({ goal, startUrl, outputDescription, allowedDomains, platform }, context) => {
    const normalizedPlatform = platform?.toLowerCase();
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
    if (normalizedPlatform) {
      const profile = await getProfileForPlatform(
        context.supabase,
        context.clientId,
        normalizedPlatform,
      );

      if (!profile) {
        return {
          success: false as const,
          error: `No saved login for ${normalizedPlatform}. Ask the user to connect it first.`,
          needsAuth: true as const,
          platform: normalizedPlatform,
        };
      }

      profileId = profile.browser_use_profile_id;
    }

    const parts = [goal];
    if (allowedDomains?.length) {
      parts.push(`IMPORTANT: Only navigate within these domains: ${allowedDomains.join(", ")}`);
    }
    if (outputDescription) {
      parts.push(`Return the results in this format: ${outputDescription}`);
    }
    const taskPrompt = parts.join("\n\n");

    const result = await client.run(taskPrompt, {
      llm: BROWSER_USE_MODEL,
      ...(startUrl ? { startUrl } : {}),
      ...(allowedDomains?.length ? { allowedDomains } : {}),
      ...(profileId
        ? {
            sessionSettings: {
              profileId,
              proxyCountryCode: null,
              enableRecording: false,
            },
          }
        : {}),
    });

    return {
      success: result.isSuccess === true,
      output: result.output,
      cost: {
        total: Number(result.cost ?? 0),
        llm: 0,
        proxy: 0,
        browser: 0,
      },
    };
  },
};
