/**
 * Tests for the search_for_integrations tool.
 * @module lib/runner/tools/connections/__tests__/search-integrations
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/catalog", () => ({
  searchIntegrations: vi.fn(),
}));

import { searchIntegrations } from "@/lib/composio/catalog";

import { createSearchIntegrationsTool } from "../search-integrations";

const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createSearchIntegrationsTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates integrations across multiple keywords", async () => {
    vi.mocked(searchIntegrations)
      .mockResolvedValueOnce([
        {
          integrationId: "gmail",
          name: "Gmail",
          description: "Email service",
          quality: "UNKNOWN",
          builder: "Composio",
          context: "",
        },
      ])
      .mockResolvedValueOnce([
        {
          integrationId: "gmail",
          name: "Gmail",
          description: "Email service",
          quality: "UNKNOWN",
          builder: "Composio",
          context: "",
        },
        {
          integrationId: "outlook",
          name: "Outlook",
          description: "Microsoft email",
          quality: "UNKNOWN",
          builder: "Composio",
          context: "",
        },
      ]);

    const { search_for_integrations } = createSearchIntegrationsTool();
    const result = await search_for_integrations.execute(
      { keywords: ["email", "mail"] },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(searchIntegrations).toHaveBeenCalledTimes(2);
    expect(result.integrations).toEqual([
      {
        integrationId: "gmail",
        name: "Gmail",
        description: "Email service",
        quality: "UNKNOWN",
        builder: "Composio",
        context: "",
      },
      {
        integrationId: "outlook",
        name: "Outlook",
        description: "Microsoft email",
        quality: "UNKNOWN",
        builder: "Composio",
        context: "",
      },
    ]);
  });

  it("returns an empty integration list when no keywords are provided", async () => {
    const { search_for_integrations } = createSearchIntegrationsTool();
    const result = await search_for_integrations.execute(
      { keywords: [] },
      EXECUTION_OPTIONS,
    );

    expect(searchIntegrations).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, integrations: [] });
  });
});
