import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/catalog", () => ({
  getToolkitCapabilities: vi.fn(),
}));

import { getToolkitCapabilities } from "@/lib/composio/catalog";

import { getIntegrationCapabilitiesTool } from "../get-integration-capabilities";

describe("getIntegrationCapabilitiesTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns capabilities for each requested integration", async () => {
    vi.mocked(getToolkitCapabilities).mockResolvedValue([
      {
        integrationId: "gmail",
        name: "Gmail",
        description: "Email integration",
        quality: "UNKNOWN",
        notes: "",
        tools: [
          {
            slug: "GMAIL_SEND_EMAIL",
            name: "Send Email",
            description: "Send an email",
            tags: ["email"],
          },
        ],
      },
    ]);

    const result = await getIntegrationCapabilitiesTool.execute({ integrationIds: ["gmail"] });

    expect(result).toEqual({
      success: true,
      integrations: [
        {
          integrationId: "gmail",
          name: "Gmail",
          description: "Email integration",
          quality: "UNKNOWN",
          notes: "",
          tools: [
            {
              slug: "GMAIL_SEND_EMAIL",
              name: "Send Email",
              description: "Send an email",
              tags: ["email"],
            },
          ],
        },
      ],
    });
  });
});
