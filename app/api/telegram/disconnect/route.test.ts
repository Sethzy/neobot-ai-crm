/**
 * Tests for Telegram disconnect endpoint.
 * @module app/api/telegram/disconnect/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockCreateAdminClient,
  mockClearPendingQuestionsForChat,
  mockGetTelegramConnectionForUser,
  mockDeleteTelegramConnectionForUser,
  mockDeleteTelegramChannelMapping,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockClearPendingQuestionsForChat: vi.fn(),
  mockGetTelegramConnectionForUser: vi.fn(),
  mockDeleteTelegramConnectionForUser: vi.fn(),
  mockDeleteTelegramChannelMapping: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

vi.mock("@/lib/channels/telegram/pending-questions", () => ({
  clearPendingQuestionsForChat: (...args: unknown[]) => mockClearPendingQuestionsForChat(...args),
}));

vi.mock("@/lib/channels/telegram/user-connections", () => ({
  deleteTelegramChannelMapping: (...args: unknown[]) => mockDeleteTelegramChannelMapping(...args),
  deleteTelegramConnectionForUser: (...args: unknown[]) => mockDeleteTelegramConnectionForUser(...args),
  getTelegramConnectionForUser: (...args: unknown[]) => mockGetTelegramConnectionForUser(...args),
}));

import { DELETE } from "./route";

describe("DELETE /api/telegram/disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockResolvedValue({ admin: true });
    mockClearPendingQuestionsForChat.mockResolvedValue(undefined);
    mockGetTelegramConnectionForUser.mockResolvedValue({
      clientId: "client-1",
      externalConversationId: "12345",
      targetThreadId: "thread-1",
      userId: "user-1",
    });
    mockDeleteTelegramConnectionForUser.mockResolvedValue(undefined);
    mockDeleteTelegramChannelMapping.mockResolvedValue(undefined);
  });

  it("returns the auth error response when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("deletes the current user's Telegram connection and routing row", async () => {
    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockGetTelegramConnectionForUser).toHaveBeenCalledWith(supabase, "user-1");
    expect(mockClearPendingQuestionsForChat).toHaveBeenCalledWith({ admin: true }, "12345");
    expect(mockDeleteTelegramChannelMapping).toHaveBeenCalledWith({ admin: true }, {
      chatId: "12345",
      clientId: "client-1",
    });
    expect(mockDeleteTelegramConnectionForUser).toHaveBeenCalledWith(supabase, "user-1");
  });

  it("returns 500 when deleting the user-owned connection fails", async () => {
    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockDeleteTelegramConnectionForUser.mockRejectedValueOnce(new Error("db down"));

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 and leaves the connection intact when clearing pending questions fails", async () => {
    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockClearPendingQuestionsForChat.mockRejectedValueOnce(new Error("clear failed"));

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(500);
    expect(mockDeleteTelegramChannelMapping).not.toHaveBeenCalled();
    expect(mockDeleteTelegramConnectionForUser).not.toHaveBeenCalled();
  });

  it("returns success when the user has no Telegram connection", async () => {
    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockGetTelegramConnectionForUser.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockClearPendingQuestionsForChat).not.toHaveBeenCalled();
    expect(mockDeleteTelegramChannelMapping).not.toHaveBeenCalled();
    expect(mockDeleteTelegramConnectionForUser).toHaveBeenCalledWith(supabase, "user-1");
  });
});
