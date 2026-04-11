import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/catalog", () => ({
  searchIntegrations: vi.fn(),
}));

import { searchIntegrations } from "@/lib/composio/catalog";

import { searchIntegrationsTool } from "../search-integrations";

describe("searchIntegrationsTool", () => {
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

    const result = await searchIntegrationsTool.execute({ keywords: ["email", "mail"] });

    expect(result).toEqual({
      success: true,
      integrations: [
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
      ],
    });
  });
});
