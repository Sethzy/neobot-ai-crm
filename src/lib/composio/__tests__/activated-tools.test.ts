/**
 * Tests for user-scoped activated Composio tool loading.
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

describe("loadActivatedConnectionTools", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty tool set when no active connections have activated tools", async () => {
    const result = await loadActivatedConnectionTools(
      [
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
      ],
      "client-123",
    );

    expect(result).toEqual({});
    expect(getComposio).not.toHaveBeenCalled();
  });

  it("loads plain-slug tools for the provided Composio user id", async () => {
    const mockTools = {
      GMAIL_SEND_EMAIL: { description: "send" },
      GMAIL_READ_EMAIL: { description: "read" },
    };
    const mockGetTools = vi.fn().mockResolvedValue(mockTools);
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        get: mockGetTools,
      },
    } as never);

    const result = await loadActivatedConnectionTools(
      [
        createMockConnection({
          id: "550e8400-e29b-41d4-a716-446655440003",
          toolkit_slug: "gmail",
          activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
        }),
      ],
      "client-123",
    );

    expect(result).toEqual(mockTools);
    expect(mockGetTools).toHaveBeenCalledWith("client-123", {
      tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
    });
  });

  it("flattens tools from active connections and skips pending or inactive rows", async () => {
    const mockGetTools = vi.fn().mockResolvedValue({
      GMAIL_SEND_EMAIL: { description: "send" },
      GOOGLECALENDAR_LIST_EVENTS: { description: "list" },
    });
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        get: mockGetTools,
      },
    } as never);

    await loadActivatedConnectionTools(
      [
        createMockConnection({
          id: "550e8400-e29b-41d4-a716-446655440004",
          toolkit_slug: "gmail",
          activated_tools: ["GMAIL_SEND_EMAIL"],
        }),
        createMockConnection({
          id: "550e8400-e29b-41d4-a716-446655440005",
          toolkit_slug: "googlecalendar",
          activated_tools: ["GOOGLECALENDAR_LIST_EVENTS"],
        }),
        createMockConnection({
          id: "550e8400-e29b-41d4-a716-446655440006",
          toolkit_slug: "slack",
          status: "pending",
          activated_tools: ["SLACK_SEND_MESSAGE"],
        }),
      ],
      "client-123",
    );

    expect(mockGetTools).toHaveBeenCalledWith("client-123", {
      tools: ["GMAIL_SEND_EMAIL", "GOOGLECALENDAR_LIST_EVENTS"],
    });
  });

  it("surfaces Composio loading errors to the caller", async () => {
    vi.mocked(getComposio).mockReturnValue({
      tools: {
        get: vi.fn().mockRejectedValue(new Error("boom")),
      },
    } as never);

    await expect(
      loadActivatedConnectionTools(
        [
          createMockConnection({
            id: "550e8400-e29b-41d4-a716-446655440007",
            toolkit_slug: "gmail",
            activated_tools: ["GMAIL_SEND_EMAIL"],
          }),
        ],
        "client-123",
      ),
    ).rejects.toThrow("boom");
  });
});
