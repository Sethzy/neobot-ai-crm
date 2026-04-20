import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRawComposioToolBySlugMock,
  getVersionedRawComposioToolsMock,
  resolveToolkitVersionMock,
} = vi.hoisted(() => ({
  getRawComposioToolBySlugMock: vi.fn(),
  getVersionedRawComposioToolsMock: vi.fn(),
  resolveToolkitVersionMock: vi.fn(),
}));

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(() => ({
    tools: {
      getRawComposioToolBySlug: getRawComposioToolBySlugMock,
    },
    connectedAccounts: {},
  })),
  getVersionedRawComposioTools: getVersionedRawComposioToolsMock,
  resolveToolkitVersion: resolveToolkitVersionMock,
  COMPOSIO_TOOL_FETCH_LIMIT: 200,
}));

import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { listComposioToolsTool } from "../list-composio-tools";

function makeContext(client: ReturnType<typeof createMockSupabase>["client"]): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: "client-1",
    threadId: "t-1",
    isChatContext: true,
  };
}

describe("listComposioToolsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tools for an app when an active connection exists", async () => {
    getVersionedRawComposioToolsMock.mockResolvedValueOnce([
      { slug: "GMAIL_SEND_EMAIL", name: "Send Gmail", description: "Send an email" },
    ]);

    const { client, builders } = createMockSupabase({
      connections: {
        data: [{ id: "conn-1", toolkit_slug: "gmail", display_name: "Gmail", status: "active" }],
        error: null,
      },
    });

    const result = await listComposioToolsTool.execute({ app: "gmail" }, makeContext(client));

    expect(builders.connections.eq).toHaveBeenCalledWith("client_id", "client-1");
    expect(getVersionedRawComposioToolsMock).toHaveBeenCalledWith({
      toolkits: ["gmail"],
      limit: 200,
    });
    expect(result).toEqual({
      success: true,
      app: "gmail",
      toolkitSlug: "gmail",
      displayName: "Gmail",
      tools: [
        { slug: "GMAIL_SEND_EMAIL", name: "Send Gmail", description: "Send an email" },
      ],
    });
  });

  it("returns a clear error when no active connection exists", async () => {
    const { client } = createMockSupabase({
      connections: {
        data: null,
        error: null,
      },
    });

    const result = await listComposioToolsTool.execute({ app: "gmail" }, makeContext(client));

    expect(getVersionedRawComposioToolsMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: "No active gmail connection found. Create or re-authorize the connection first.",
    });
  });

  it("propagates Composio SDK errors", async () => {
    getVersionedRawComposioToolsMock.mockRejectedValueOnce(new Error("tool lookup failed"));

    const { client } = createMockSupabase({
      connections: {
        data: [{ id: "conn-1", toolkit_slug: "gmail", display_name: "Gmail", status: "active" }],
        error: null,
      },
    });

    const result = await listComposioToolsTool.execute({ app: "gmail" }, makeContext(client));

    expect(result).toEqual({
      success: false,
      error: "tool lookup failed",
    });
  });

  it("returns the input schema for a selected action", async () => {
    getVersionedRawComposioToolsMock.mockResolvedValueOnce([
      { slug: "GMAIL_SEND_EMAIL", name: "Send Gmail", description: "Send an email" },
    ]);
    resolveToolkitVersionMock.mockResolvedValueOnce("13042026_00");
    getRawComposioToolBySlugMock.mockResolvedValueOnce({
      slug: "GMAIL_SEND_EMAIL",
      name: "Send Gmail",
      description: "Send an email",
      version: "13042026_00",
      inputParameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
        },
        required: ["to", "subject"],
      },
      outputParameters: {
        type: "object",
      },
      toolkit: { slug: "gmail" },
    });

    const { client } = createMockSupabase({
      connections: {
        data: [{ id: "conn-1", toolkit_slug: "gmail", display_name: "Gmail", status: "active" }],
        error: null,
      },
    });

    const result = await listComposioToolsTool.execute(
      { app: "gmail", action: "GMAIL_SEND_EMAIL" },
      makeContext(client),
    );

    expect(resolveToolkitVersionMock).toHaveBeenCalledWith("gmail");
    expect(getRawComposioToolBySlugMock).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      version: "13042026_00",
    });
    expect(result).toEqual({
      success: true,
      app: "gmail",
      toolkitSlug: "gmail",
      displayName: "Gmail",
      tools: [
        { slug: "GMAIL_SEND_EMAIL", name: "Send Gmail", description: "Send an email" },
      ],
      selectedTool: {
        slug: "GMAIL_SEND_EMAIL",
        name: "Send Gmail",
        description: "Send an email",
        version: "13042026_00",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
          },
          required: ["to", "subject"],
        },
        outputSchema: {
          type: "object",
        },
        requiredInputFields: ["to", "subject"],
      },
    });
  });
});
