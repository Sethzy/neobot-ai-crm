/**
 * Tests for the OAuth auth callback route.
 * @module app/auth/callback/__tests__/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExchangeCodeForSession = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mockExchangeCodeForSession,
      },
    });
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("exchanges the auth code and redirects to the requested next path", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/auth/callback?code=test-code&next=/chat"),
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("test-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/chat");
  });

  it("falls back to chat when the next path is not relative", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/auth/callback?code=test-code&next=https://evil.example"),
    );

    expect(response.headers.get("location")).toBe("http://localhost/chat");
  });

  it("returns the user to login when the code exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      error: { message: "bad oauth code" },
    });
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/auth/callback?code=test-code&next=/chat"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=oauth_callback");
  });
});
