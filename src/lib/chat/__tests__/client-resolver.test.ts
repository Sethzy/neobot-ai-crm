/**
 * Tests server-side client_id resolution helper.
 * @module lib/chat/__tests__/client-resolver.test
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getClientId } from "../client-resolver";

const mockRpc = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();

  mockEq.mockImplementation(() => ({ single: () => mockSingle() }));
  mockSelect.mockImplementation(() => ({ eq: (...args: unknown[]) => mockEq(...args) }));
  mockFrom.mockImplementation(() => ({ select: (...args: unknown[]) => mockSelect(...args) }));
});

describe("getClientId", () => {
  test("returns client id from RPC when available", async () => {
    mockRpc.mockResolvedValue({ data: "client-123", error: null });

    await expect(getClientId()).resolves.toBe("client-123");
    expect(mockRpc).toHaveBeenCalledWith("get_my_client_id");
  });

  test("falls back to clients query when RPC is unavailable", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { client_id: "client-456" },
      error: null,
    });

    await expect(getClientId()).resolves.toBe("client-456");
    expect(mockFrom).toHaveBeenCalledWith("clients");
    expect(mockSelect).toHaveBeenCalledWith("client_id");
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-123");
  });

  test("throws if no authenticated user is available", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(getClientId()).rejects.toThrow("Could not resolve client_id: user not authenticated");
  });

  test("throws if fallback query cannot find a client row", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "no rows" },
    });

    await expect(getClientId()).rejects.toThrow("Could not resolve client_id");
  });
});
