/**
 * Tests for connection-ID-prefixed activated tool loading.
 * @module lib/composio/__tests__/activated-tools
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "../client";

import { loadActivatedConnectionTools } from "../activated-tools";

import type { ConnectionRow } from "@/lib/connections/schemas";

function createMockConnection(
  overrides: Partial<ConnectionRow> & { id: string; toolkit_slug: string },
): ConnectionRow {
  return {
    id: overrides.id,
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: `composio-${overrides.id}`,
    toolkit_slug: overrides.toolkit_slug,
    display_name: null,
    account_identifier: null,
    status: "active",
    activated_tools: [],
    tool_count: 0,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
    ...overrides,
  };
}

function createMockComposio(
  toolsByCall: Array<Array<{ slug: string; description?: string; inputParameters?: Record<string, unknown> }>>,
) {
  let callIndex = 0;
  const mockComposio = {
    tools: {
      getRawComposioTools: vi.fn().mockImplementation(() => {
        const result = toolsByCall[callIndex] ?? [];
        callIndex++;
        return Promise.resolve(result);
      }),
      execute: vi.fn().mockResolvedValue({ success: true }),
    },
  };

  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("loadActivatedConnectionTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty ToolSet when no active connections have activated tools", async () => {
    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440001",
        toolkit_slug: "gmail",
        activated_tools: [],
      }),
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440002",
        toolkit_slug: "slack",
        status: "inactive",
        activated_tools: ["SLACK_SEND_MESSAGE"],
      }),
    ]);

    expect(result).toEqual({});
  });

  it("prefixes tool names with the connection id", async () => {
    createMockComposio([
      [
        {
          slug: "GMAIL_SEND_EMAIL",
          description: "Send email",
          inputParameters: {
            type: "object",
            properties: { to: { type: "string" } },
          },
        },
        {
          slug: "GMAIL_READ_EMAIL",
          description: "Read email",
          inputParameters: { type: "object", properties: {} },
        },
      ],
    ]);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440003",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
      }),
    ]);

    expect(Object.keys(result).sort()).toEqual([
      "550e8400-e29b-41d4-a716-446655440003__GMAIL_READ_EMAIL",
      "550e8400-e29b-41d4-a716-446655440003__GMAIL_SEND_EMAIL",
    ]);
  });

  it("loads tools for multiple active connections independently", async () => {
    createMockComposio([
      [
        {
          slug: "GMAIL_SEND_EMAIL",
          description: "Send email",
          inputParameters: { type: "object", properties: {} },
        },
      ],
      [
        {
          slug: "SLACK_SEND_MESSAGE",
          description: "Send Slack message",
          inputParameters: { type: "object", properties: {} },
        },
      ],
    ]);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440004",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440005",
        toolkit_slug: "slack",
        activated_tools: ["SLACK_SEND_MESSAGE"],
      }),
    ]);

    expect(Object.keys(result).sort()).toEqual([
      "550e8400-e29b-41d4-a716-446655440004__GMAIL_SEND_EMAIL",
      "550e8400-e29b-41d4-a716-446655440005__SLACK_SEND_MESSAGE",
    ]);
  });

  it("requests raw tool definitions with a tools-only query", async () => {
    const mock = createMockComposio([
      [
        {
          slug: "GMAIL_SEND_EMAIL",
          description: "Send email",
          inputParameters: { type: "object", properties: {} },
        },
      ],
    ]);

    await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440006",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
    ]);

    expect(mock.tools.getRawComposioTools).toHaveBeenCalledWith({
      tools: ["GMAIL_SEND_EMAIL"],
    });
  });

  it("executes wrapped tools with the bound connected account id", async () => {
    const mock = createMockComposio([
      [
        {
          slug: "GMAIL_SEND_EMAIL",
          description: "Send email",
          inputParameters: {
            type: "object",
            properties: {
              to: { type: "string" },
              body: { type: "string" },
            },
            required: ["to"],
          },
        },
      ],
    ]);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440007",
        toolkit_slug: "gmail",
        composio_connected_account_id: "ca_personal_gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
    ]);

    const wrappedTool = result["550e8400-e29b-41d4-a716-446655440007__GMAIL_SEND_EMAIL"];
    expect(wrappedTool).toBeDefined();

    await (wrappedTool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute({
      to: "user@example.com",
      body: "Hello",
    });

    expect(mock.tools.execute).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      connectedAccountId: "ca_personal_gmail",
      arguments: {
        to: "user@example.com",
        body: "Hello",
      },
      dangerouslySkipVersionCheck: true,
    });
  });

  it("keeps partial results when one connection fails to load", async () => {
    let callIndex = 0;
    const mockComposio = {
      tools: {
        getRawComposioTools: vi.fn().mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) {
            return Promise.reject(new Error("Composio timeout"));
          }

          return Promise.resolve([
            {
              slug: "SLACK_SEND_MESSAGE",
              description: "Send Slack message",
              inputParameters: { type: "object", properties: {} },
            },
          ]);
        }),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440008",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440009",
        toolkit_slug: "slack",
        activated_tools: ["SLACK_SEND_MESSAGE"],
      }),
    ]);

    expect(Object.keys(result)).toEqual([
      "550e8400-e29b-41d4-a716-446655440009__SLACK_SEND_MESSAGE",
    ]);
  });

  it("skips pending connections", async () => {
    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440010",
        toolkit_slug: "gmail",
        status: "pending",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
    ]);

    expect(result).toEqual({});
  });
});
