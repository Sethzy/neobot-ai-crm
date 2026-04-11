/**
 * Web scrape tool for managed agents.
 *
 * @module lib/managed-agents/tools/web/scrape
 */
import { z } from "zod";

import { fetchWithTimeout, isAbortError } from "@/lib/runner/tools/web/fetch-with-timeout";

import type { ManagedAgentTool } from "../types";

const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
const MAX_TEXT_CHARACTERS = 10_000;
const LIVECRAWL_TIMEOUT_MS = 30_000;

const inputSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
      message: "URL must use http:// or https:// protocol",
    })
    .describe("The URL of the webpage to read. Must be http:// or https://."),
});

type WebScrapeInput = z.infer<typeof inputSchema>;

export const webScrapeTool: ManagedAgentTool<WebScrapeInput> = {
  name: "web_scrape",
  description: "Reads a single webpage and extracts its content as markdown",
  inputSchema,
  execute: async ({ url }) => {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      return { success: false as const, error: "EXA_API_KEY is not configured." };
    }

    try {
      const response = await fetchWithTimeout(EXA_CONTENTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          urls: [url],
          text: { maxCharacters: MAX_TEXT_CHARACTERS },
          livecrawl: "preferred",
          livecrawlTimeout: LIVECRAWL_TIMEOUT_MS,
        }),
      });

      if (!response.ok) {
        return { success: false as const, error: `Exa API error: ${response.status} ${response.statusText}` };
      }

      const data = (await response.json()) as {
        results?: Array<{ url?: string; title?: string; text?: string }>;
        content?: Array<{ url?: string; title?: string; text?: string }>;
        statuses?: Array<{ id?: string; status?: string; error?: { tag?: string } }>;
      };
      const items = data.results ?? data.content ?? [];
      const firstResult = items[0];

      if (!firstResult || !firstResult.text) {
        const statuses = data.statuses ?? [];
        const matchedStatus =
          statuses.find((status) => status.id === url && status.status === "error")
          ?? statuses.find((status) => status.status === "error");
        if (matchedStatus?.status === "error") {
          return { success: false as const, error: `Scrape failed: ${matchedStatus.error?.tag ?? "UNKNOWN"}` };
        }
        return { success: false as const, error: "No content could be extracted from the URL." };
      }

      return {
        success: true as const,
        url: firstResult.url ?? url,
        title: firstResult.title ?? "",
        content: firstResult.text,
      };
    } catch (error) {
      return {
        success: false as const,
        error: isAbortError(error)
          ? "Exa scrape request timed out."
          : error instanceof Error
            ? error.message
            : "Unknown scrape error",
      };
    }
  },
};
