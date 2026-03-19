/**
 * Browser automation tool powered by Browser-Use Cloud.
 * @module lib/runner/tools/browser/browse-website
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getBrowserUseClient } from "@/lib/browser-use/client";
import { getProfileForPlatform } from "@/lib/browser-use/profiles";
import type { Database } from "@/types/database";

const BROWSER_USE_MODEL = "browser-use-2.0";
const MAX_BROWSER_STEPS = 25;
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

      const session = await client.sessions.create(
        profileId ? { profileId } : {},
      );

      try {
        const taskPrompt = outputDescription
          ? `${goal}\n\nReturn the results in this format: ${outputDescription}`
          : goal;

        const task = await client.tasks.create({
          sessionId: session.id,
          task: taskPrompt,
          llm: BROWSER_USE_MODEL,
          maxSteps: MAX_BROWSER_STEPS,
          ...(startUrl ? { startUrl } : {}),
          ...(allowedDomains ? { allowedDomains } : {}),
        });
        const result = await client.tasks.wait(task.id);

        return {
          success: Boolean(result.isSuccess),
          output: result.output,
          cost: result.cost,
        };
      } finally {
        try {
          await client.sessions.stop(session.id);
        } catch {
          // Ignore cleanup failures so the user still receives the task result.
        }
      }
    },
  });

  return { browse_website };
}
