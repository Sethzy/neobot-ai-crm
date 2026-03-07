/**
 * Tests for RSS and Atom feed parsing plus seen-item deduplication state.
 * @module lib/triggers/__tests__/rss
 */
import { describe, expect, it, vi } from "vitest";

import { collectNewRssItems, fetchRssFeed } from "../rss";

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PropertyGuru Listings</title>
    <description>Latest homes</description>
    <item>
      <guid>listing-1</guid>
      <title>1 Bedroom Condo</title>
      <link>https://example.com/listing-1</link>
      <description>Near MRT</description>
      <pubDate>Fri, 06 Mar 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <guid>listing-2</guid>
      <title>2 Bedroom Condo</title>
      <link>https://example.com/listing-2</link>
      <description>High floor</description>
      <pubDate>Fri, 06 Mar 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>New Homes</title>
  <entry>
    <id>tag:example.com,2026:listings/1</id>
    <title>Terrace house</title>
    <updated>2026-03-06T09:30:00Z</updated>
    <summary>Fresh listing</summary>
    <link rel="alternate" href="https://example.com/terrace-house" />
  </entry>
</feed>`;

function createMockFileClient() {
  return {
    downloadFile: vi.fn(),
    uploadFile: vi.fn().mockResolvedValue(undefined),
    listDirectory: vi.fn(),
    editFile: vi.fn(),
    deleteFile: vi.fn(),
  };
}

describe("fetchRssFeed", () => {
  it("parses RSS item metadata", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(RSS_XML, {
        status: 200,
        headers: {
          "Content-Type": "application/rss+xml",
        },
      }),
    );

    const feed = await fetchRssFeed("https://example.com/feed.xml", mockFetch);

    expect(feed.title).toBe("PropertyGuru Listings");
    expect(feed.description).toBe("Latest homes");
    expect(feed.items).toEqual([
      expect.objectContaining({
        id: "listing-1",
        title: "1 Bedroom Condo",
        link: "https://example.com/listing-1",
      }),
      expect.objectContaining({
        id: "listing-2",
        title: "2 Bedroom Condo",
        link: "https://example.com/listing-2",
      }),
    ]);
  });

  it("parses Atom entry metadata", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(ATOM_XML, {
        status: 200,
        headers: {
          "Content-Type": "application/atom+xml",
        },
      }),
    );

    const feed = await fetchRssFeed("https://example.com/atom.xml", mockFetch);

    expect(feed.title).toBe("New Homes");
    expect(feed.items).toEqual([
      expect.objectContaining({
        id: "tag:example.com,2026:listings/1",
        title: "Terrace house",
        link: "https://example.com/terrace-house",
      }),
    ]);
  });
});

describe("collectNewRssItems", () => {
  it("seeds seen state on first sync without backfilling historical items", async () => {
    const fileClient = createMockFileClient();
    fileClient.downloadFile.mockRejectedValue(
      new Error('Failed to read file "state/trigger-1/seen.json": Object not found'),
    );
    const mockFetch = vi.fn().mockResolvedValue(new Response(RSS_XML, { status: 200 }));

    const result = await collectNewRssItems({
      fileClient,
      triggerId: "trigger-1",
      feedUrl: "https://example.com/feed.xml",
      fetchImpl: mockFetch,
    });

    expect(result.isFirstSync).toBe(true);
    expect(result.newItems).toEqual([]);
    expect(fileClient.uploadFile).toHaveBeenCalledWith(
      "state/trigger-1/seen.json",
      expect.stringContaining('"listing-1"'),
    );
  });

  it("returns only unseen items on later syncs", async () => {
    const fileClient = createMockFileClient();
    fileClient.downloadFile.mockResolvedValue(
      JSON.stringify({
        seenGuids: ["listing-1"],
      }),
    );
    const mockFetch = vi.fn().mockResolvedValue(new Response(RSS_XML, { status: 200 }));

    const result = await collectNewRssItems({
      fileClient,
      triggerId: "trigger-2",
      feedUrl: "https://example.com/feed.xml",
      fetchImpl: mockFetch,
    });

    expect(result.isFirstSync).toBe(false);
    expect(result.newItems).toEqual([
      expect.objectContaining({
        id: "listing-2",
        title: "2 Bedroom Condo",
      }),
    ]);
    expect(fileClient.uploadFile).toHaveBeenCalledWith(
      "state/trigger-2/seen.json",
      expect.stringContaining('"listing-2"'),
    );
  });

  it("retains newly seen item IDs when the seen-state file is already at the cap", async () => {
    const fileClient = createMockFileClient();
    fileClient.downloadFile.mockResolvedValue(
      JSON.stringify({
        seenGuids: Array.from({ length: 500 }, (_, index) => `listing-${index}`),
      }),
    );
    const cappedRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PropertyGuru Listings</title>
    <item>
      <guid>listing-501</guid>
      <title>Fresh listing</title>
      <link>https://example.com/listing-501</link>
    </item>
  </channel>
</rss>`;
    const mockFetch = vi.fn().mockResolvedValue(new Response(cappedRssXml, { status: 200 }));

    const result = await collectNewRssItems({
      fileClient,
      triggerId: "trigger-3",
      feedUrl: "https://example.com/feed.xml",
      fetchImpl: mockFetch,
    });

    expect(result.seenGuids).toContain("listing-501");
    expect(fileClient.uploadFile).toHaveBeenCalledWith(
      "state/trigger-3/seen.json",
      expect.stringContaining('"listing-501"'),
    );
  });
});
