/**
 * RSS and Atom feed parsing plus seen-item state management for trigger runs.
 * @module lib/triggers/rss
 */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

import type { AgentFileClient } from "@/lib/storage/agent-files";

const RSS_SEEN_STATE_LIMIT = 500;

export interface FeedItem {
  id: string;
  title: string | null;
  link: string | null;
  summary: string | null;
  publishedAt: string | null;
}

export interface ParsedFeed {
  title: string | null;
  description: string | null;
  items: FeedItem[];
}

export interface CollectNewRssItemsInput {
  fileClient: AgentFileClient;
  triggerId: string;
  feedUrl: string;
  fetchImpl?: typeof fetch;
}

export interface CollectNewRssItemsResult {
  feed: ParsedFeed;
  newItems: FeedItem[];
  seenGuids: string[];
  statePath: string;
  isFirstSync: boolean;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  isArray: (_tagName, jPath) => jPath.endsWith(".item") || jPath.endsWith(".entry"),
});

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value && typeof value === "object") {
    const textValue = (value as Record<string, unknown>)["#text"]
      ?? (value as Record<string, unknown>)["_text"];
    return toText(textValue);
  }

  return null;
}

function buildFallbackItemId(parts: Array<string | null>, rawValue: unknown): string {
  const stableSource = [...parts.filter((part): part is string => Boolean(part)), JSON.stringify(rawValue)]
    .join("|");

  return createHash("sha256").update(stableSource).digest("hex");
}

function parseRssItem(item: Record<string, unknown>): FeedItem {
  const title = toText(item.title);
  const link = toText(item.link);
  const summary = toText(item["content:encoded"] ?? item.description ?? item.content);
  const publishedAt = toText(item.pubDate ?? item["dc:date"] ?? item.updated ?? item.published);
  const guid = toText(item.guid);
  const id = guid ?? link ?? buildFallbackItemId([title, publishedAt], item);

  return {
    id,
    title,
    link,
    summary,
    publishedAt,
  };
}

function parseAtomLink(value: unknown): string | null {
  for (const link of asArray(value)) {
    if (typeof link === "string") {
      return toText(link);
    }

    if (link && typeof link === "object") {
      const record = link as Record<string, unknown>;
      const rel = toText(record["@_rel"]);
      const href = toText(record["@_href"]);

      if (href && (!rel || rel === "alternate")) {
        return href;
      }
    }
  }

  return null;
}

function parseAtomEntry(entry: Record<string, unknown>): FeedItem {
  const title = toText(entry.title);
  const link = parseAtomLink(entry.link);
  const summary = toText(entry.summary ?? entry.content);
  const publishedAt = toText(entry.updated ?? entry.published);
  const atomId = toText(entry.id);
  const id = atomId ?? link ?? buildFallbackItemId([title, publishedAt], entry);

  return {
    id,
    title,
    link,
    summary,
    publishedAt,
  };
}

function parseFeedXml(xml: string): ParsedFeed {
  const parsedDocument = xmlParser.parse(xml) as Record<string, unknown>;

  if (parsedDocument.rss && typeof parsedDocument.rss === "object") {
    const channel = (parsedDocument.rss as Record<string, unknown>).channel;
    const channelRecord = Array.isArray(channel)
      ? (channel[0] as Record<string, unknown> | undefined)
      : (channel as Record<string, unknown> | undefined);

    if (!channelRecord) {
      throw new Error("RSS feed is missing a channel node.");
    }

    return {
      title: toText(channelRecord.title),
      description: toText(channelRecord.description),
      items: asArray(channelRecord.item).map((item) => parseRssItem(item as Record<string, unknown>)),
    };
  }

  if (parsedDocument.feed && typeof parsedDocument.feed === "object") {
    const feedRecord = parsedDocument.feed as Record<string, unknown>;

    return {
      title: toText(feedRecord.title),
      description: toText(feedRecord.subtitle),
      items: asArray(feedRecord.entry).map((entry) =>
        parseAtomEntry(entry as Record<string, unknown>)
      ),
    };
  }

  throw new Error("Unsupported feed format. Expected RSS or Atom.");
}

function getSeenStatePath(triggerId: string): string {
  return `state/${triggerId}/seen.json`;
}

function isMissingSeenStateError(error: unknown): boolean {
  return error instanceof Error && /not found/i.test(error.message);
}

async function loadSeenGuids(
  fileClient: AgentFileClient,
  triggerId: string,
): Promise<{ isFirstSync: boolean; seenGuids: string[] }> {
  const statePath = getSeenStatePath(triggerId);

  try {
    const fileContents = await fileClient.downloadFile(statePath);
    const parsedState = JSON.parse(fileContents) as { seenGuids?: unknown };

    if (!Array.isArray(parsedState.seenGuids)) {
      throw new Error(`RSS seen state at "${statePath}" is invalid.`);
    }

    return {
      isFirstSync: false,
      seenGuids: parsedState.seenGuids.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    };
  } catch (error) {
    if (isMissingSeenStateError(error)) {
      return {
        isFirstSync: true,
        seenGuids: [],
      };
    }

    throw error;
  }
}

function dedupeSeenGuids(guids: string[]): string[] {
  const uniqueGuids = new Set<string>();
  const deduped: string[] = [];

  for (const guid of guids) {
    if (uniqueGuids.has(guid)) {
      continue;
    }

    uniqueGuids.add(guid);
    deduped.push(guid);

    if (deduped.length >= RSS_SEEN_STATE_LIMIT) {
      break;
    }
  }

  return deduped;
}

async function persistSeenGuids(
  fileClient: AgentFileClient,
  triggerId: string,
  seenGuids: string[],
): Promise<void> {
  await fileClient.uploadFile(
    getSeenStatePath(triggerId),
    JSON.stringify({
      seenGuids,
      updatedAt: new Date().toISOString(),
    }),
  );
}

/**
 * Fetches and parses one RSS or Atom feed URL.
 */
export async function fetchRssFeed(
  feedUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedFeed> {
  const response = await fetchImpl(feedUrl, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`.trim());
  }

  const xml = await response.text();
  if (!xml.trim()) {
    throw new Error("RSS feed returned an empty body.");
  }

  return parseFeedXml(xml);
}

/**
 * Loads the feed, compares current item IDs with persisted state, and updates seen state.
 */
export async function collectNewRssItems({
  fileClient,
  triggerId,
  feedUrl,
  fetchImpl = fetch,
}: CollectNewRssItemsInput): Promise<CollectNewRssItemsResult> {
  const [feed, seenState] = await Promise.all([
    fetchRssFeed(feedUrl, fetchImpl),
    loadSeenGuids(fileClient, triggerId),
  ]);
  const currentIds = dedupeSeenGuids(feed.items.map((item) => item.id));
  const seenSet = new Set(seenState.seenGuids);
  const newItems = seenState.isFirstSync
    ? []
    : feed.items.filter((item) => !seenSet.has(item.id));
  const nextSeenGuids = dedupeSeenGuids([...currentIds, ...seenState.seenGuids]);

  await persistSeenGuids(fileClient, triggerId, nextSeenGuids);

  return {
    feed,
    newItems,
    seenGuids: nextSeenGuids,
    statePath: getSeenStatePath(triggerId),
    isFirstSync: seenState.isFirstSync,
  };
}
