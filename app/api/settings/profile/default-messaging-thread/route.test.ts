/**
 * Tests for the default messaging thread settings route.
 * @module app/api/settings/profile/default-messaging-thread/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockCreateAdminClient,
  mockGetDefaultMessagingThreadForUser,
  mockListAvailableMessagingThreads,
  mockSaveDefaultMessagingThreadForUser,
  mockGetTelegramConnectionForUser,
  mockUpdateTelegramConnectionTargetThread,
  mockUpsertTelegramChannelMapping,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockGetDefaultMessagingThreadForUser: vi.fn(),
  mockListAvailableMessagingThreads: vi.fn(),
  mockSaveDefaultMessagingThreadForUser: vi.fn(),
  mockGetTelegramConnectionForUser: vi.fn(),
  mockUpdateTelegramConnectionTargetThread: vi.fn(),
  mockUpsertTelegramChannelMapping: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

vi.mock("@/lib/settings/profile/messaging-preferences", () => ({
  getDefaultMessagingThreadForUser: (...args: unknown[]) =>
    mockGetDefaultMessagingThreadForUser(...args),
  listAvailableMessagingThreads: (...args: unknown[]) =>
    mockListAvailableMessagingThreads(...args),
  saveDefaultMessagingThreadForUser: (...args: unknown[]) =>
    mockSaveDefaultMessagingThreadForUser(...args),
}));

vi.mock("@/lib/channels/telegram/user-connections", () => ({
  getTelegramConnectionForUser: (...args: unknown[]) =>
    mockGetTelegramConnectionForUser(...args),
  updateTelegramConnectionTargetThread: (...args: unknown[]) =>
    mockUpdateTelegramConnectionTargetThread(...args),
  upsertTelegramChannelMapping: (...args: unknown[]) =>
    mockUpsertTelegramChannelMapping(...args),
}));

import { GET, PUT } from "./route";

describe("default messaging thread route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateAdminClient.mockResolvedValue({ admin: true });
    mockListAvailableMessagingThreads.mockResolvedValue([
      { isPrimary: true, threadId: "11111111-1111-4111-8111-111111111111", title: null },
      { isPrimary: false, threadId: "22222222-2222-4222-8222-222222222222", title: "Buyers" },
    ]);
    mockGetDefaultMessagingThreadForUser.mockResolvedValue(
      "11111111-1111-4111-8111-111111111111",
    );
    mockSaveDefaultMessagingThreadForUser.mockResolvedValue(undefined);
    mockGetTelegramConnectionForUser.mockResolvedValue(null);
    mockUpdateTelegramConnectionTargetThread.mockResolvedValue(undefined);
    mockUpsertTelegramChannelMapping.mockResolvedValue(undefined);
  });

  it("returns auth errors unchanged on GET", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("loads the default thread and available thread list", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { user: true },
      userId: "user-1",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      defaultThreadId: "11111111-1111-4111-8111-111111111111",
      threads: [
        { isPrimary: true, threadId: "11111111-1111-4111-8111-111111111111", title: null },
        { isPrimary: false, threadId: "22222222-2222-4222-8222-222222222222", title: "Buyers" },
      ],
    });
  });

  it("rejects invalid PUT bodies", async () => {
    const response = await PUT(
      new Request("http://localhost/api/settings/profile/default-messaging-thread", {
        method: "PUT",
        body: JSON.stringify({ threadId: "not-a-uuid" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the selected thread is not available to the client", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { user: true },
      userId: "user-1",
    });

    const response = await PUT(
      new Request("http://localhost/api/settings/profile/default-messaging-thread", {
        method: "PUT",
        body: JSON.stringify({
          threadId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Messaging thread not found.",
    });
  });

  it("saves the preference and syncs Telegram routing when connected", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { user: true },
      userId: "user-1",
    });
    mockGetTelegramConnectionForUser.mockResolvedValue({
      clientId: "client-1",
      externalConversationId: "12345",
      targetThreadId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
    });

    const response = await PUT(
      new Request("http://localhost/api/settings/profile/default-messaging-thread", {
        method: "PUT",
        body: JSON.stringify({
          threadId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSaveDefaultMessagingThreadForUser).toHaveBeenCalledWith({ user: true }, {
      threadId: "22222222-2222-4222-8222-222222222222",
      userId: "user-1",
    });
    expect(mockUpdateTelegramConnectionTargetThread).toHaveBeenCalledWith({ user: true }, {
      targetThreadId: "22222222-2222-4222-8222-222222222222",
      userId: "user-1",
    });
    expect(mockUpsertTelegramChannelMapping).toHaveBeenCalledWith({ admin: true }, {
      chatId: "12345",
      clientId: "client-1",
      threadId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("saves the preference without Telegram sync when not connected", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { user: true },
      userId: "user-1",
    });

    const response = await PUT(
      new Request("http://localhost/api/settings/profile/default-messaging-thread", {
        method: "PUT",
        body: JSON.stringify({
          threadId: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateTelegramConnectionTargetThread).not.toHaveBeenCalled();
    expect(mockUpsertTelegramChannelMapping).not.toHaveBeenCalled();
  });
});
