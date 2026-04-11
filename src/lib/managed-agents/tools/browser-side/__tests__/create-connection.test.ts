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
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";
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
});
