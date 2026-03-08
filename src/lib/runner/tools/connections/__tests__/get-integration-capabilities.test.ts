/**
 * Tests for the get_integrations_capabilities tool.
 * @module lib/runner/tools/connections/__tests__/get-integration-capabilities
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/catalog", () => ({
  getToolkitCapabilities: vi.fn(),
}));

import { getToolkitCapabilities } from "@/lib/composio/catalog";

import { createGetIntegrationCapabilitiesTool } from "../get-integration-capabilities";

const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createGetIntegrationCapabilitiesTool", () => {
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
          {
            slug: "GMAIL_READ_EMAIL",
            name: "Read Email",
            description: "Read email threads",
            tags: ["email"],
          },
        ],
      },
    ]);

    const { get_integrations_capabilities } = createGetIntegrationCapabilitiesTool();
    const result = await get_integrations_capabilities.execute(
      { integrationIds: ["gmail"] },
      EXECUTION_OPTIONS,
    );

    expect(getToolkitCapabilities).toHaveBeenCalledWith(["gmail"]);
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
            {
              slug: "GMAIL_READ_EMAIL",
              name: "Read Email",
              description: "Read email threads",
              tags: ["email"],
            },
          ],
        },
      ],
    });
  });

  it("returns an empty integration list when none are requested", async () => {
    vi.mocked(getToolkitCapabilities).mockResolvedValue([]);

    const { get_integrations_capabilities } = createGetIntegrationCapabilitiesTool();
    const result = await get_integrations_capabilities.execute(
      { integrationIds: [] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, integrations: [] });
  });
});
