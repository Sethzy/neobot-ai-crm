/**
 * search_triggers tool and shared trigger catalog definitions.
 * @module lib/runner/tools/triggers/search-triggers
 */
import { tool } from "ai";
import { z } from "zod";

interface TriggerSchemaField {
  type: "string" | "number";
  required?: boolean;
  description: string;
}

export interface TriggerCatalogEntry {
  trigger_id: "schedule" | "webhook" | "rss";
  name: string;
  description: string;
  keywords: readonly string[];
  setupSchema: Record<string, TriggerSchemaField>;
  editSchema: Record<string, TriggerSchemaField>;
}

/**
 * Canonical trigger catalog shared across trigger discovery and mutation tools.
 */
export const TRIGGER_CATALOG: readonly TriggerCatalogEntry[] = [
  {
    trigger_id: "schedule",
    name: "Schedule",
    description:
      "Run work on a recurring cron schedule. Use this for daily, weekly, or custom timed automations.",
    keywords: [
      "trigger",
      "schedule",
      "cron",
      "recurring",
      "daily",
      "weekly",
      "monthly",
      "timer",
      "morning",
      "evening",
    ],
    setupSchema: {
      cron: {
        type: "string",
        required: true,
        description: "Five-field cron expression such as '0 9 * * *'.",
      },
      timezone: {
        type: "string",
        description: "Optional IANA timezone such as 'Asia/Singapore'. Defaults to Asia/Singapore.",
      },
    },
    editSchema: {
      cron: {
        type: "string",
        description: "Updated five-field cron expression.",
      },
      timezone: {
        type: "string",
        description: "Updated IANA timezone.",
      },
    },
  },
  {
    trigger_id: "webhook",
    name: "Webhook",
    description:
      "Run work when an external service POSTs to a dedicated URL for this trigger.",
    keywords: [
      "trigger",
      "webhook",
      "post",
      "http",
      "api",
      "callback",
      "event",
      "integration",
    ],
    setupSchema: {
      webhook_secret: {
        type: "string",
        description: "Optional shared secret used to verify the inbound webhook signature.",
      },
    },
    editSchema: {
      webhook_secret: {
        type: "string",
        description: "Updated webhook verification secret.",
      },
    },
  },
  {
    trigger_id: "rss",
    name: "RSS Feed",
    description:
      "Run work when new items appear in an RSS or Atom feed, with built-in deduplication by item GUID.",
    keywords: [
      "trigger",
      "rss",
      "feed",
      "atom",
      "monitor",
      "blog",
      "news",
      "listings",
      "subscribe",
    ],
    setupSchema: {
      feed_url: {
        type: "string",
        required: true,
        description: "Full RSS or Atom feed URL to poll.",
      },
      polling_interval_minutes: {
        type: "number",
        description: "Polling interval in minutes. Defaults to 60.",
      },
    },
    editSchema: {
      feed_url: {
        type: "string",
        description: "Updated feed URL.",
      },
      polling_interval_minutes: {
        type: "number",
        description: "Updated polling interval in minutes.",
      },
    },
  },
] as const;

function matchesTrigger(entry: TriggerCatalogEntry, keywords: string[]): boolean {
  const haystack = [
    entry.trigger_id,
    entry.name,
    entry.description,
    ...entry.keywords,
  ].join(" ").toLowerCase();

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

/**
 * Creates the Tasklet-style trigger discovery tool.
 */
export function createSearchTriggersTool() {
  const search_triggers = tool({
    description:
      "Search available trigger types by keyword and return the setup schema and edit schema for each match.",
    inputSchema: z.object({
      keywords: z.array(z.string().min(1)).min(1),
    }),
    execute: async ({ keywords }) => {
      const triggers = TRIGGER_CATALOG.filter((entry) => matchesTrigger(entry, keywords)).map(
        ({ keywords: _keywords, ...entry }) => entry,
      );

      return {
        success: true as const,
        triggers,
      };
    },
  });

  return { search_triggers };
}
