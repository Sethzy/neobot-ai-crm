/**
 * Tests for Composio catalog search and capabilities helpers.
 * @module lib/composio/__tests__/catalog
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "../client";

import { getToolkitCapabilities, searchIntegrations } from "../catalog";

function createMockTool(
  slug: string,
  toolkitSlug: string,
  toolkitName: string,
) {
  return {
    slug,
    name: slug.replace(/_/g, " "),
    description: `Description for ${slug}`,
    tags: ["test"],
    toolkit: { slug: toolkitSlug, name: toolkitName },
  };
}

function createMockComposio(toolsByCall: Array<Array<ReturnType<typeof createMockTool>>>) {
  let callIndex = 0;
  const mockComposio = {
    tools: {
      getRawComposioTools: vi.fn().mockImplementation(() => {
        const result = toolsByCall[callIndex] ?? [];
        callIndex++;
        return Promise.resolve(result);
      }),
    },
  };

  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("searchIntegrations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns deduped integrations with the expected shape", async () => {
    createMockComposio([
      [
        createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail"),
        createMockTool("GMAIL_READ_EMAIL", "gmail", "Gmail"),
        createMockTool("SLACK_SEND_MESSAGE", "slack", "Slack"),
      ],
    ]);

    const result = await searchIntegrations("email");

    expect(result).toEqual([
      {
        integrationId: "gmail",
        name: "Gmail",
        description: "Description for GMAIL_SEND_EMAIL",
        quality: "UNKNOWN",
        builder: "Composio",
        context: "",
      },
      {
        integrationId: "slack",
        name: "Slack",
        description: "Description for SLACK_SEND_MESSAGE",
        quality: "UNKNOWN",
        builder: "Composio",
        context: "",
      },
    ]);
  });

  it("passes only the search keyword to the SDK", async () => {
    const mock = createMockComposio([[]]);

    await searchIntegrations("calendar");

    expect(mock.tools.getRawComposioTools).toHaveBeenCalledWith({
      search: "calendar",
    });
  });

  it("returns an empty array when no matching tools exist", async () => {
    createMockComposio([[]]);

    await expect(searchIntegrations("nonexistent")).resolves.toEqual([]);
  });

  it("skips tools that have no toolkit metadata", async () => {
    createMockComposio([
      [
        {
          slug: "ORPHAN_TOOL",
          name: "Orphan",
          description: "No toolkit",
          tags: [],
          toolkit: undefined,
        } as never,
      ],
    ]);

    await expect(searchIntegrations("orphan")).resolves.toEqual([]);
  });
});

describe("getToolkitCapabilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the tool list for each toolkit slug", async () => {
    createMockComposio([
      [
        createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail"),
        createMockTool("GMAIL_READ_EMAIL", "gmail", "Gmail"),
      ],
    ]);

    const result = await getToolkitCapabilities(["gmail"]);

    expect(result).toEqual([
      {
        integrationId: "gmail",
        name: "Gmail",
        description: "",
        quality: "UNKNOWN",
        notes: "",
        tools: [
          {
            slug: "GMAIL_SEND_EMAIL",
            name: "GMAIL SEND EMAIL",
            description: "Description for GMAIL_SEND_EMAIL",
            tags: ["test"],
          },
          {
            slug: "GMAIL_READ_EMAIL",
            name: "GMAIL READ EMAIL",
            description: "Description for GMAIL_READ_EMAIL",
            tags: ["test"],
          },
        ],
      },
    ]);
  });

  it("passes toolkit-only params to the SDK", async () => {
    const mock = createMockComposio([[]]);

    await getToolkitCapabilities(["gmail"]);

    expect(mock.tools.getRawComposioTools).toHaveBeenCalledWith({
      toolkits: ["gmail"],
    });
  });

  it("returns UNKNOWN quality and empty notes in v1", async () => {
    createMockComposio([
      [createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail")],
    ]);

    const result = await getToolkitCapabilities(["gmail"]);

    expect(result[0]?.quality).toBe("UNKNOWN");
    expect(result[0]?.notes).toBe("");
  });

  it("handles multiple toolkit slugs", async () => {
    createMockComposio([
      [createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail")],
      [createMockTool("SLACK_SEND_MESSAGE", "slack", "Slack")],
    ]);

    const result = await getToolkitCapabilities(["gmail", "slack"]);

    expect(result).toHaveLength(2);
    expect(result[0]?.integrationId).toBe("gmail");
    expect(result[1]?.integrationId).toBe("slack");
  });

  it("returns an empty array when called with no toolkits", async () => {
    createMockComposio([]);

    await expect(getToolkitCapabilities([])).resolves.toEqual([]);
  });
});
