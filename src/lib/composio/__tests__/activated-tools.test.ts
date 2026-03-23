/**
 * Tests for connection-ID-prefixed activated tool loading from cached DB schemas.
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
    tool_schemas: {},
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
    ...overrides,
  };
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

  it("reads schemas from DB row, not Composio API", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: mockExecute,
      },
    } as never);

    const connections = [
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440003",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send an email via Gmail",
            inputParameters: {
              type: "object",
              properties: { to: { type: "string" }, subject: { type: "string" } },
              required: ["to", "subject"],
            },
          },
        },
      }),
    ];

    const tools = await loadActivatedConnectionTools(connections);

    expect(Object.keys(tools)).toEqual(["550e8400-e29b-41d4-a716-446655440003__GMAIL_SEND_EMAIL"]);

    // Verify NO Composio API calls for schema loading
    const composio = vi.mocked(getComposio)();
    expect(composio.tools.getRawComposioTools).not.toHaveBeenCalled();
  });

  it("prefixes tool names with the connection id", async () => {
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440003",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: {
              type: "object",
              properties: { to: { type: "string" } },
            },
          },
          GMAIL_READ_EMAIL: {
            description: "Read email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(Object.keys(result).sort()).toEqual([
      "550e8400-e29b-41d4-a716-446655440003__GMAIL_READ_EMAIL",
      "550e8400-e29b-41d4-a716-446655440003__GMAIL_SEND_EMAIL",
    ]);
  });

  it("loads tools for multiple active connections independently", async () => {
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440004",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440005",
        toolkit_slug: "slack",
        activated_tools: ["SLACK_SEND_MESSAGE"],
        tool_schemas: {
          SLACK_SEND_MESSAGE: {
            description: "Send Slack message",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(Object.keys(result).sort()).toEqual([
      "550e8400-e29b-41d4-a716-446655440004__GMAIL_SEND_EMAIL",
      "550e8400-e29b-41d4-a716-446655440005__SLACK_SEND_MESSAGE",
    ]);
  });

  it("skips tools with no cached schema and warns", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440006",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_MISSING_TOOL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(Object.keys(result)).toEqual([
      "550e8400-e29b-41d4-a716-446655440006__GMAIL_SEND_EMAIL",
    ]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No cached schema for GMAIL_MISSING_TOOL"),
    );
    consoleSpy.mockRestore();
  });

  it("executes wrapped tools with the bound connected account id", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn(),
        execute: mockExecute,
      },
    } as never);

    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440007",
        toolkit_slug: "gmail",
        composio_connected_account_id: "ca_personal_gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
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
        },
      }),
    ]);

    const wrappedTool = result["550e8400-e29b-41d4-a716-446655440007__GMAIL_SEND_EMAIL"];
    expect(wrappedTool).toBeDefined();

    await (wrappedTool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute({
      to: "user@example.com",
      body: "Hello",
    });

    expect(mockExecute).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      connectedAccountId: "ca_personal_gmail",
      arguments: {
        to: "user@example.com",
        body: "Hello",
      },
      dangerouslySkipVersionCheck: true,
    });
  });

  it("skips pending connections", async () => {
    const result = await loadActivatedConnectionTools([
      createMockConnection({
        id: "550e8400-e29b-41d4-a716-446655440010",
        toolkit_slug: "gmail",
        status: "pending",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);

    expect(result).toEqual({});
  });
});
