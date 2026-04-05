/**
 * Tests for Supabase server-side client factories.
 * @module lib/supabase/__tests__/server
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateServerClient,
  mockCreateAdminSupabaseClient,
  mockCookies,
} = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockCreateAdminSupabaseClient: vi.fn(),
  mockCookies: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateAdminSupabaseClient,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

describe("createAdminClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      AI_GATEWAY_API_KEY: "gateway-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };
    mockCookies.mockResolvedValue({
      getAll: vi.fn(() => []),
      set: vi.fn(),
    });
    mockCreateAdminSupabaseClient.mockReturnValue({ kind: "admin-client" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates a service-role client with session persistence disabled", async () => {
    const { createAdminClient } = await import("../server");

    const client = await createAdminClient();

    expect(mockCreateAdminSupabaseClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      }),
    );
    expect(client).toEqual({ kind: "admin-client" });
  });

  it("throws when the service-role key is missing", async () => {
    process.env = {
      ...originalEnv,
      AI_GATEWAY_API_KEY: "gateway-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "   ",
    };

    const { createAdminClient } = await import("../server");

    await expect(createAdminClient()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
