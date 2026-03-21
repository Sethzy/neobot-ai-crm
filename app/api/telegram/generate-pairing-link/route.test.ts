/**
 * Tests for Telegram pairing link generation.
 * @module app/api/telegram/generate-pairing-link/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockGeneratePairingToken,
  mockGetBotUsername,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockGeneratePairingToken: vi.fn(),
  mockGetBotUsername: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/channels/telegram/pairing", () => ({
  generatePairingToken: (...args: unknown[]) => mockGeneratePairingToken(...args),
  PAIRING_TOKEN_TTL_MS: 10 * 60 * 1000,
}));

vi.mock("@/lib/channels/telegram", () => ({
  getBotUsername: (...args: unknown[]) => mockGetBotUsername(...args),
}));

import { POST } from "./route";

function createSupabase() {
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const deleteRow = vi.fn(() => ({ eq: deleteEq }));
  const insert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table !== "telegram_pairing_tokens") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      delete: deleteRow,
      insert,
    };
  });

  return { from, deleteRow, deleteEq, insert };
}

describe("POST /api/telegram/generate-pairing-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePairingToken.mockReturnValue("pair-token-123");
    mockGetBotUsername.mockResolvedValue("SunderBot");
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

  it("deletes existing tokens, inserts a new one, and returns a Telegram deep link", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    const supabase = createSupabase();
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
      url: "https://t.me/SunderBot?start=pair-token-123",
      expiresInSeconds: 600,
    });
    expect(supabase.deleteEq).toHaveBeenCalledWith("client_id", "client-1");
    expect(supabase.insert).toHaveBeenCalledWith({
      token: "pair-token-123",
      client_id: "client-1",
      expires_at: "2026-03-20T10:10:00.000Z",
    });

    vi.useRealTimers();
  });

  it("returns 500 when client resolution fails", async () => {
    const supabase = createSupabase();
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
});
