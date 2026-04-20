import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/connection-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/composio/connection-flow")>()),
  initiateOAuthFlow: vi.fn(),
}));

vi.mock("@/lib/composio/catalog", () => ({
  getToolkitDisplayInfo: vi.fn(),
}));

import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
import { getToolkitDisplayInfo } from "@/lib/composio/catalog";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { createConnectionTool } from "../create-connection";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeContext(client: ReturnType<typeof createMockSupabase>["client"]): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("createConnectionTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.sunder.local");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a pending integration connection and returns the redirect URL", async () => {
    vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
      integrationId: "gmail",
      displayName: "Gmail",
      description: "Send and read Gmail messages",
    });
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-123",
    });

    const { client, builderHistory } = createMockSupabase({
      connections: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await createConnectionTool.execute(
      {
        integrations: [
          {
            integrationId: "gmail",
            toolsToActivate: ["GMAIL_SEND_EMAIL"],
          },
        ],
      },
      makeContext(client),
    );

    expect(builderHistory.connections[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(initiateOAuthFlow).toHaveBeenCalledWith({
      composioUserId: CLIENT_ID,
      toolkitSlug: "gmail",
      callbackUrl:
        "https://app.sunder.local/api/connections/callback?toolkit=gmail&thread=thread-1",
    });
    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "gmail",
          displayName: "Gmail",
          description: "Send and read Gmail messages",
          connectionStatus: "pending_auth",
          redirectUrl: "https://composio.dev/oauth/redirect",
        },
      ],
    });
  });

  it("rejects an unsupported provider slug without calling Composio", async () => {
    const { client } = createMockSupabase({
      connections: [],
    });

    const result = await createConnectionTool.execute(
      { integrations: [{ integrationId: "slack" }] },
      makeContext(client),
    );

    expect(initiateOAuthFlow).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "slack",
          error: expect.stringMatching(/not supported/i),
        },
      ],
    });
  });

  it("normalizes natural provider names to the canonical Composio slug", async () => {
    vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
      integrationId: "googledrive",
      displayName: "Google Drive",
      description: "Access files in Google Drive",
    });
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-drive",
    });

    const { client, builderHistory } = createMockSupabase({
      connections: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await createConnectionTool.execute(
      { integrations: [{ integrationId: "Google Drive" }] },
      makeContext(client),
    );

    expect(builderHistory.connections[0]?.eq).toHaveBeenCalledWith(
      "toolkit_slug",
      "googledrive",
    );
    expect(initiateOAuthFlow).toHaveBeenCalledWith({
      composioUserId: CLIENT_ID,
      toolkitSlug: "googledrive",
      callbackUrl:
        "https://app.sunder.local/api/connections/callback?toolkit=googledrive&thread=thread-1",
    });
    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "googledrive",
          displayName: "Google Drive",
        },
      ],
    });
  });

  it("rejects a duplicate provider with a user-facing provider name", async () => {
    vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
      integrationId: "googledrive",
      displayName: "Google Drive",
      description: "",
    });

    const { client } = createMockSupabase({
      connections: [
        {
          data: {
            id: "conn-existing",
            client_id: CLIENT_ID,
            composio_connected_account_id: "composio-1",
            toolkit_slug: "googledrive",
            display_name: "Google Drive",
            account_identifier: "owner@example.com",
            status: "active",
            activated_tools: [],
            tool_count: 3,
          },
          error: null,
        },
      ],
    });

    const result = await createConnectionTool.execute(
      { integrations: [{ integrationId: "Google Drive" }] },
      makeContext(client),
    );

    expect(initiateOAuthFlow).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "googledrive",
          displayName: "Google Drive",
          error: expect.stringMatching(/already connected.*disconnect/i),
        },
      ],
    });
  });

  it("tells the agent to end the turn after rendering auth cards", async () => {
    vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
      integrationId: "notion",
      displayName: "Notion",
      description: "",
    });
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-notion",
    });

    const { client } = createMockSupabase({
      connections: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await createConnectionTool.execute(
      { integrations: [{ integrationId: "notion", toolsToActivate: ["NOTION_CREATE_PAGE"] }] },
      makeContext(client),
    );

    expect(result).toMatchObject({ success: true });
    if (result.success) {
      expect(result.message).toMatch(/end this turn/i);
      expect(result.message).toMatch(/next message/i);
    }
  });

  it("keeps earlier pending auth cards when a later provider fails", async () => {
    vi.mocked(getToolkitDisplayInfo)
      .mockResolvedValueOnce({
        integrationId: "gmail",
        displayName: "Gmail",
        description: "Send and read Gmail messages",
      })
      .mockResolvedValueOnce({
        integrationId: "notion",
        displayName: "Notion",
        description: "Read and write your Notion workspace",
      });
    vi.mocked(initiateOAuthFlow)
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/gmail",
        connectedAccountId: "composio-acct-gmail",
      })
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/notion",
        connectedAccountId: "composio-acct-notion",
      });

    const { client } = createMockSupabase({
      connections: [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: { message: "write failed" } },
      ],
    });

    const result = await createConnectionTool.execute(
      {
        integrations: [
          { integrationId: "gmail" },
          { integrationId: "notion" },
        ],
      },
      makeContext(client),
    );

    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "gmail",
          displayName: "Gmail",
          connectionStatus: "pending_auth",
          redirectUrl: "https://composio.dev/oauth/gmail",
        },
        {
          integrationId: "notion",
          displayName: "Notion",
          error: expect.stringMatching(/could not start notion: write failed/i),
        },
      ],
    });
  });
});
