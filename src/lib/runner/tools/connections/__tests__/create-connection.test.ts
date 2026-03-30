/**
 * Tests for the create_new_connections tool.
 * @module lib/runner/tools/connections/__tests__/create-connection
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/connection-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/composio/connection-flow")>()),
  initiateOAuthFlow: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  getActiveConnectionsByToolkit: vi.fn(),
  insertConnection: vi.fn(),
}));

vi.mock("@/lib/composio/catalog", () => ({
  getToolkitDisplayInfo: vi.fn(),
}));

import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
import { getToolkitDisplayInfo } from "@/lib/composio/catalog";
import { getActiveConnectionsByToolkit, insertConnection } from "@/lib/connections/queries";

import { createCreateConnectionTool } from "../create-connection";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createCreateConnectionTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.sunder.local";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  });

  it("references the canonical /agent/ skill path in the tool description", () => {
    const { create_new_connections } = createCreateConnectionTool({} as never, CLIENT_ID);

    expect(create_new_connections.description).toContain(
      "/agent/skills/system/creating-connections/SKILL.md",
    );
  });

  it("creates a pending integration connection and returns the redirect URL", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([]);
    vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
      integrationId: "gmail",
      displayName: "Gmail",
      description: "Send and read Gmail messages",
    });
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-123",
    });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const { create_new_connections } = createCreateConnectionTool({} as never, CLIENT_ID);
    const result = await create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [
            {
              integrationId: "gmail",
              toolsToActivate: ["GMAIL_SEND_EMAIL"],
            },
          ],
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(initiateOAuthFlow).toHaveBeenCalledWith({
      composioUserId: CLIENT_ID,
      toolkitSlug: "gmail",
      callbackUrl: "https://app.sunder.local/api/connections/callback?toolkit=gmail",
    });
    expect(insertConnection).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({
        client_id: CLIENT_ID,
        composio_connected_account_id: "composio-acct-123",
        toolkit_slug: "gmail",
        status: "pending",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_count: 0,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Connection cards");
    expect(result.results).toEqual([
      {
        integrationId: "gmail",
        displayName: "Gmail",
        description: "Send and read Gmail messages",
        connectionStatus: "pending_auth",
        redirectUrl: "https://composio.dev/oauth/redirect",
        composioConnectedAccountId: "composio-acct-123",
        existingConnections: undefined,
      },
    ]);
  });

  it("falls back to the integration slug when display metadata lookup fails", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([]);
    vi.mocked(getToolkitDisplayInfo).mockRejectedValue(new Error("catalog unavailable"));
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/drive",
      connectedAccountId: "composio-acct-789",
    });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const { create_new_connections } = createCreateConnectionTool({} as never, CLIENT_ID);
    const result = await create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [{ integrationId: "googledrive" }],
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.results).toEqual([
      expect.objectContaining({
        integrationId: "googledrive",
        displayName: "googledrive",
        description: "",
      }),
    ]);
  });

  it("defaults toolsToActivate to an empty array", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([]);
    vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
      integrationId: "slack",
      displayName: "Slack",
      description: "Post and read Slack messages",
    });
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/slack",
      connectedAccountId: "composio-acct-456",
    });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const { create_new_connections } = createCreateConnectionTool({} as never, CLIENT_ID);
    await create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [{ integrationId: "slack" }],
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(insertConnection).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({ activated_tools: [] }),
    );
  });

  it("supports multiple integrations in one call and includes existing connection summaries", async () => {
    vi.mocked(getActiveConnectionsByToolkit)
      .mockResolvedValueOnce([
        {
          id: "conn-existing",
          account_identifier: "personal@gmail.com",
        } as never,
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(getToolkitDisplayInfo)
      .mockResolvedValueOnce({
        integrationId: "gmail",
        displayName: "Gmail",
        description: "Send and read Gmail messages",
      })
      .mockResolvedValueOnce({
        integrationId: "slack",
        displayName: "Slack",
        description: "Send and receive Slack messages",
      });
    vi.mocked(initiateOAuthFlow)
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/gmail",
        connectedAccountId: "composio-gmail",
      })
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/slack",
        connectedAccountId: "composio-slack",
      });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const { create_new_connections } = createCreateConnectionTool({} as never, CLIENT_ID);
    const result = await create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [{ integrationId: "gmail" }, { integrationId: "slack" }],
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      integrationId: "gmail",
      displayName: "Gmail",
      description: "Send and read Gmail messages",
      composioConnectedAccountId: "composio-gmail",
      existingConnections: [
        {
          connectionId: "conn-existing",
          accountIdentifier: "personal@gmail.com",
        },
      ],
    });
    expect(result.results[1]).toMatchObject({
      integrationId: "slack",
      displayName: "Slack",
      description: "Send and receive Slack messages",
      composioConnectedAccountId: "composio-slack",
      existingConnections: undefined,
    });
    expect(initiateOAuthFlow).toHaveBeenNthCalledWith(2, {
      composioUserId: CLIENT_ID,
      toolkitSlug: "slack",
      callbackUrl: "https://app.sunder.local/api/connections/callback?toolkit=slack",
    });
    expect(insertConnection).toHaveBeenCalledTimes(2);
  });

  it("returns explicit stub messages for non-integration connection types", async () => {
    const { create_new_connections } = createCreateConnectionTool({} as never, CLIENT_ID);

    await expect(
      create_new_connections.execute({ connection: { type: "mcp" } }, EXECUTION_OPTIONS),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining("MCP"),
    });

    await expect(
      create_new_connections.execute(
        {
          connection: {
            type: "direct_api",
            serviceName: "Custom API",
            description: "Custom HTTP service",
            connectionName: "custom-api",
            baseUrl: "https://api.example.com",
            methods: ["GET"],
            authConfig: {},
            notes: "",
          },
        },
        EXECUTION_OPTIONS,
      ),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining("Direct API"),
    });

    await expect(
      create_new_connections.execute(
        { connection: { type: "computer_use", displayName: "Chrome session" } },
        EXECUTION_OPTIONS,
      ),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining("Computer Use"),
    });
  });
});
