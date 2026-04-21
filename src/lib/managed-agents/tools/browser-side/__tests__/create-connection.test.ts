import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/catalog", () => ({
  getCachedToolkitDisplayInfo: vi.fn(),
}));

vi.mock("@/lib/composio/connection-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/composio/connection-flow")>()),
  initiateOAuthFlow: vi.fn(),
}));

import { getCachedToolkitDisplayInfo } from "@/lib/composio/catalog";
import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
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
    vi.mocked(getCachedToolkitDisplayInfo).mockImplementation(async (toolkitSlug) => ({
      integrationId: toolkitSlug,
      displayName: toolkitSlug === "googledrive" ? "Google Drive" : toolkitSlug === "gmail" ? "Gmail" : toolkitSlug === "notion" ? "Notion" : toolkitSlug,
      description:
        toolkitSlug === "googledrive"
          ? "Access files in Google Drive."
          : toolkitSlug === "gmail"
            ? "Read and send Gmail messages."
            : toolkitSlug === "notion"
              ? "Read and update pages and databases in your Notion workspace."
              : `${toolkitSlug} connection`,
      logoUrl: `https://cdn.composio.dev/${toolkitSlug}.png`,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a pending connection with Composio display metadata when available", async () => {
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-123",
      authRedirectExpiresAt: "2026-04-21T09:45:00.000Z",
    });

    const { client, builderHistory } = createMockSupabase({
      connections: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await createConnectionTool.execute(
      {
        integrations: ["gmail"],
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
          description: expect.stringMatching(/gmail/i),
          logoUrl: "https://cdn.composio.dev/gmail.png",
          connectionStatus: "pending_auth",
          redirectUrl: "https://composio.dev/oauth/redirect",
          authRedirectExpiresAt: "2026-04-21T09:45:00.000Z",
        },
      ],
    });
  });

  it("rejects an unsupported provider slug without calling Composio", async () => {
    const { client } = createMockSupabase({
      connections: [],
    });

    const result = await createConnectionTool.execute(
      { integrations: ["slack"] },
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
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-drive",
      authRedirectExpiresAt: "2026-04-21T09:45:00.000Z",
    });

    const { client, builderHistory } = createMockSupabase({
      connections: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await createConnectionTool.execute(
      { integrations: ["Google Drive"] },
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
          logoUrl: "https://cdn.composio.dev/googledrive.png",
        },
      ],
    });
  });

  it("rejects a duplicate provider with a user-facing provider name", async () => {
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
      { integrations: ["Google Drive"] },
      makeContext(client),
    );

    expect(initiateOAuthFlow).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "googledrive",
          displayName: "Google Drive",
          logoUrl: "https://cdn.composio.dev/googledrive.png",
          error: expect.stringMatching(/already connected.*disconnect/i),
        },
      ],
    });
  });

  it("instructs the agent to end the turn and to avoid 'auth card' / 'OAuth' jargon", async () => {
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-notion",
      authRedirectExpiresAt: "2026-04-21T09:45:00.000Z",
    });

    const { client } = createMockSupabase({
      connections: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await createConnectionTool.execute(
      { integrations: ["notion"] },
      makeContext(client),
    );

    expect(result).toMatchObject({ success: true });
    if (result.success) {
      expect(result.message).toMatch(/end (?:your|this) turn/i);
      expect(result.message).toMatch(/next message/i);
      expect(result.message).toMatch(/sign in|connect/i);
      expect(result.message).toMatch(/do not.*auth card|not.*OAuth|not.*authorize/i);
    }
  });

  it("keeps earlier pending connect cards when a later provider fails", async () => {
    vi.mocked(initiateOAuthFlow)
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/gmail",
        connectedAccountId: "composio-acct-gmail",
        authRedirectExpiresAt: "2026-04-21T09:45:00.000Z",
      })
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/notion",
        connectedAccountId: "composio-acct-notion",
        authRedirectExpiresAt: "2026-04-21T09:50:00.000Z",
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
        integrations: ["gmail", "notion"],
      },
      makeContext(client),
    );

    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "gmail",
          displayName: "Gmail",
          logoUrl: "https://cdn.composio.dev/gmail.png",
          connectionStatus: "pending_auth",
          redirectUrl: "https://composio.dev/oauth/gmail",
          authRedirectExpiresAt: "2026-04-21T09:45:00.000Z",
        },
        {
          integrationId: "notion",
          displayName: "Notion",
          logoUrl: "https://cdn.composio.dev/notion.png",
          error: expect.stringMatching(/could not start notion: write failed/i),
        },
      ],
    });
  });

  it("reuses a still-valid pending auth link instead of creating a duplicate flow", async () => {
    const { client } = createMockSupabase({
      connections: [
        {
          data: {
            id: "conn-pending",
            client_id: CLIENT_ID,
            composio_connected_account_id: "composio-pending-1",
            toolkit_slug: "notion",
            display_name: null,
            account_identifier: null,
            auth_redirect_url: "https://composio.dev/oauth/notion",
            auth_redirect_expires_at: "2099-04-21T09:45:00.000Z",
            status: "pending",
            activated_tools: [],
            tool_count: 0,
          },
          error: null,
        },
      ],
    });

    const result = await createConnectionTool.execute(
      { integrations: ["notion"] },
      makeContext(client),
    );

    expect(initiateOAuthFlow).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "notion",
          redirectUrl: "https://composio.dev/oauth/notion",
          authRedirectExpiresAt: "2099-04-21T09:45:00.000Z",
          composioConnectedAccountId: "composio-pending-1",
        },
      ],
    });
  });

  it("restarts the flow when the previous pending auth link has expired", async () => {
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/notion-fresh",
      connectedAccountId: "composio-acct-notion-fresh",
      authRedirectExpiresAt: "2026-04-21T10:00:00.000Z",
    });

    const { client, builderHistory } = createMockSupabase({
      connections: [
        {
          data: {
            id: "conn-pending",
            client_id: CLIENT_ID,
            composio_connected_account_id: "composio-pending-1",
            toolkit_slug: "notion",
            display_name: null,
            account_identifier: null,
            auth_redirect_url: "https://composio.dev/oauth/notion-stale",
            auth_redirect_expires_at: "2026-04-21T08:00:00.000Z",
            status: "pending",
            activated_tools: [],
            tool_count: 0,
          },
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await createConnectionTool.execute(
      { integrations: ["notion"] },
      makeContext(client),
    );

    expect(builderHistory.connections[1]?.delete).toHaveBeenCalled();
    expect(builderHistory.connections[1]?.eq).toHaveBeenCalledWith("id", "conn-pending");
    expect(initiateOAuthFlow).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      results: [
        {
          integrationId: "notion",
          redirectUrl: "https://composio.dev/oauth/notion-fresh",
          authRedirectExpiresAt: "2026-04-21T10:00:00.000Z",
          composioConnectedAccountId: "composio-acct-notion-fresh",
        },
      ],
    });
  });
});
