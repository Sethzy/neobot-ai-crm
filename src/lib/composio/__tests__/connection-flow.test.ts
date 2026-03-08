/**
 * Tests for shared OAuth initiation flow helper.
 * @module lib/composio/__tests__/connection-flow
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "../client";

import { initiateOAuthFlow } from "../connection-flow";

const MOCK_COMPOSIO_USER_ID = "client-123";
const MOCK_TOOLKIT_SLUG = "gmail";
const MOCK_CALLBACK_URL = "https://example.com/api/connections/callback?toolkit=gmail";

function createMockComposio(overrides?: {
  authConfigItems?: Array<{ id: string; status: string }>;
  createAuthConfigId?: string;
  linkResult?: { redirectUrl?: string | null; id?: string };
}) {
  const mockComposio = {
    authConfigs: {
      list: vi.fn().mockResolvedValue({
        items: overrides?.authConfigItems ?? [
          { id: "auth-config-existing", status: "ENABLED" },
        ],
      }),
      create: vi.fn().mockResolvedValue({
        id: overrides?.createAuthConfigId ?? "auth-config-new",
      }),
    },
    connectedAccounts: {
      link: vi.fn().mockResolvedValue(
        overrides?.linkResult ?? {
          redirectUrl: "https://composio.dev/oauth/redirect",
          id: "connected-account-456",
        },
      ),
    },
  };

  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("initiateOAuthFlow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the redirect URL and connected account id on success", async () => {
    createMockComposio();

    const result = await initiateOAuthFlow({
      composioUserId: MOCK_COMPOSIO_USER_ID,
      toolkitSlug: MOCK_TOOLKIT_SLUG,
      callbackUrl: MOCK_CALLBACK_URL,
    });

    expect(result).toEqual({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "connected-account-456",
    });
  });

  it("reuses the first ENABLED auth config", async () => {
    const mock = createMockComposio({
      authConfigItems: [
        { id: "disabled-config", status: "DISABLED" },
        { id: "reusable-config", status: "ENABLED" },
      ],
    });

    await initiateOAuthFlow({
      composioUserId: MOCK_COMPOSIO_USER_ID,
      toolkitSlug: MOCK_TOOLKIT_SLUG,
      callbackUrl: MOCK_CALLBACK_URL,
    });

    expect(mock.authConfigs.list).toHaveBeenCalledWith({
      toolkit: MOCK_TOOLKIT_SLUG,
      isComposioManaged: true,
    });
    expect(mock.authConfigs.create).not.toHaveBeenCalled();
    expect(mock.connectedAccounts.link).toHaveBeenCalledWith(
      MOCK_COMPOSIO_USER_ID,
      "reusable-config",
      { callbackUrl: MOCK_CALLBACK_URL },
    );
  });

  it("creates a managed auth config when none exists", async () => {
    const mock = createMockComposio({
      authConfigItems: [],
      createAuthConfigId: "brand-new-config",
    });

    await initiateOAuthFlow({
      composioUserId: MOCK_COMPOSIO_USER_ID,
      toolkitSlug: MOCK_TOOLKIT_SLUG,
      callbackUrl: MOCK_CALLBACK_URL,
    });

    expect(mock.authConfigs.create).toHaveBeenCalledWith(MOCK_TOOLKIT_SLUG, {
      type: "use_composio_managed_auth",
      name: `${MOCK_TOOLKIT_SLUG} Auth Config`,
    });
    expect(mock.connectedAccounts.link).toHaveBeenCalledWith(
      MOCK_COMPOSIO_USER_ID,
      "brand-new-config",
      { callbackUrl: MOCK_CALLBACK_URL },
    );
  });

  it("throws when Composio returns no redirect URL", async () => {
    createMockComposio({
      linkResult: { redirectUrl: undefined, id: "connected-account-789" },
    });

    await expect(
      initiateOAuthFlow({
        composioUserId: MOCK_COMPOSIO_USER_ID,
        toolkitSlug: MOCK_TOOLKIT_SLUG,
        callbackUrl: MOCK_CALLBACK_URL,
      }),
    ).rejects.toThrow("Composio did not return a redirect URL.");
  });

  it("throws when Composio returns no connected account id", async () => {
    createMockComposio({
      linkResult: {
        redirectUrl: "https://composio.dev/oauth/redirect",
        id: undefined,
      },
    });

    await expect(
      initiateOAuthFlow({
        composioUserId: MOCK_COMPOSIO_USER_ID,
        toolkitSlug: MOCK_TOOLKIT_SLUG,
        callbackUrl: MOCK_CALLBACK_URL,
      }),
    ).rejects.toThrow("Composio did not return a connected account ID.");
  });
});
