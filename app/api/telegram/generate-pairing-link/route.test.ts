/**
 * Tests for Telegram pairing link generation.
 * @module app/api/telegram/generate-pairing-link/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockGetBotUsername,
  mockGetDefaultMessagingThreadForUser,
  mockClearTelegramPairingSessionsForUser,
  mockCreateTelegramPairingSession,
  mockFindTelegramClientConnectionConflict,
  mockGeneratePairingDisplayCode,
  mockGeneratePairingToken,
  mockGetTelegramReadiness,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockGetBotUsername: vi.fn(),
  mockGetDefaultMessagingThreadForUser: vi.fn(),
  mockClearTelegramPairingSessionsForUser: vi.fn(),
  mockCreateTelegramPairingSession: vi.fn(),
  mockFindTelegramClientConnectionConflict: vi.fn(),
  mockGeneratePairingDisplayCode: vi.fn(),
  mockGeneratePairingToken: vi.fn(),
  mockGetTelegramReadiness: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/channels/telegram/pairing", () => ({
  generatePairingDisplayCode: (...args: unknown[]) => mockGeneratePairingDisplayCode(...args),
  generatePairingToken: (...args: unknown[]) => mockGeneratePairingToken(...args),
  PAIRING_TOKEN_TTL_MS: 10 * 60 * 1000,
}));

vi.mock("@/lib/channels/telegram", () => ({
  getBotUsername: (...args: unknown[]) => mockGetBotUsername(...args),
}));

vi.mock("@/lib/settings/profile/messaging-preferences", () => ({
  getDefaultMessagingThreadForUser: (...args: unknown[]) =>
    mockGetDefaultMessagingThreadForUser(...args),
}));

vi.mock("@/lib/channels/telegram/user-connections", () => ({
  clearTelegramPairingSessionsForUser: (...args: unknown[]) =>
    mockClearTelegramPairingSessionsForUser(...args),
  createTelegramPairingSession: (...args: unknown[]) =>
    mockCreateTelegramPairingSession(...args),
  findTelegramClientConnectionConflict: (...args: unknown[]) =>
    mockFindTelegramClientConnectionConflict(...args),
  getTelegramReadiness: (...args: unknown[]) => mockGetTelegramReadiness(...args),
}));

import { POST } from "./route";

describe("POST /api/telegram/generate-pairing-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTelegramReadiness.mockReturnValue({
      isConfigured: true,
      missingVariables: [],
    });
    mockGeneratePairingDisplayCode.mockReturnValue("GW-22E14A");
    mockGeneratePairingToken.mockReturnValue("pair-token-123");
    mockGetBotUsername.mockResolvedValue("SunderBot");
    mockGetDefaultMessagingThreadForUser.mockResolvedValue("thread-1");
    mockClearTelegramPairingSessionsForUser.mockResolvedValue(undefined);
    mockFindTelegramClientConnectionConflict.mockResolvedValue(null);
    mockCreateTelegramPairingSession.mockResolvedValue({
      clientId: "client-1",
      consumedAt: null,
      createdAt: "2026-03-20T10:00:00.000Z",
      deepLinkToken: "pair-token-123",
      displayCode: "GW-22E14A",
      expiresAt: "2026-03-20T10:10:00.000Z",
      id: "session-1",
      targetThreadId: "thread-1",
      userId: "user-1",
    });
  });

  it("returns the auth error response when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(
      new Request("http://localhost/api/telegram/generate-pairing-link", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns the bot username, manual code, and deep link for the user's default thread", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");

    const response = await POST(
      new Request("http://localhost/api/telegram/generate-pairing-link", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      botUsername: "SunderBot",
      displayCode: "GW-22E14A",
      expiresInSeconds: 600,
      openUrl: "https://t.me/SunderBot?start=pair-token-123",
    });
    expect(mockGetDefaultMessagingThreadForUser).toHaveBeenCalledWith(supabase, {
      clientId: "client-1",
      userId: "user-1",
    });
    expect(mockClearTelegramPairingSessionsForUser).toHaveBeenCalledWith(
      supabase,
      "user-1",
    );
    expect(mockCreateTelegramPairingSession).toHaveBeenCalledWith(supabase, {
      clientId: "client-1",
      deepLinkToken: "pair-token-123",
      displayCode: "GW-22E14A",
      expiresAt: "2026-03-20T10:10:00.000Z",
      targetThreadId: "thread-1",
      userId: "user-1",
    });

    vi.useRealTimers();
  });

  it("returns 500 when client resolution fails", async () => {
    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockResolveClientId.mockRejectedValue(new Error("missing client"));

    const response = await POST(
      new Request("http://localhost/api/telegram/generate-pairing-link", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
  });

  it("returns 503 without mutating sessions when Telegram is not configured", async () => {
    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockGetTelegramReadiness.mockReturnValue({
      isConfigured: false,
      missingVariables: ["TELEGRAM_BOT_TOKEN"],
    });

    const response = await POST(
      new Request("http://localhost/api/telegram/generate-pairing-link", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Telegram pairing is unavailable because the bot is not configured.",
    });
    expect(mockClearTelegramPairingSessionsForUser).not.toHaveBeenCalled();
    expect(mockCreateTelegramPairingSession).not.toHaveBeenCalled();
  });

  it("retries when session creation hits a duplicate token/code collision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateTelegramPairingSession
      .mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"))
      .mockResolvedValueOnce({
        clientId: "client-1",
        consumedAt: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        deepLinkToken: "pair-token-123",
        displayCode: "GW-22E14A",
        expiresAt: "2026-03-20T10:10:00.000Z",
        id: "session-1",
        targetThreadId: "thread-1",
        userId: "user-1",
      });

    const response = await POST(
      new Request("http://localhost/api/telegram/generate-pairing-link", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCreateTelegramPairingSession).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("returns 409 when another user already owns Telegram for the client", async () => {
    const supabase = { from: vi.fn() };
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockFindTelegramClientConnectionConflict.mockResolvedValue({
      clientId: "client-1",
      externalConversationId: "12345",
      targetThreadId: "thread-1",
      userId: "user-2",
    });

    const response = await POST(
      new Request("http://localhost/api/telegram/generate-pairing-link", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Telegram is already connected for another user on this workspace.",
    });
    expect(mockCreateTelegramPairingSession).not.toHaveBeenCalled();
  });
});
