/** Tests for Redis connection fail-open configuration. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockConnect,
  mockCreateClient,
  mockDestroy,
  mockGetServerEnv,
  mockOn,
} = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockCreateClient: vi.fn(),
  mockDestroy: vi.fn(),
  mockGetServerEnv: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock("redis", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: mockGetServerEnv,
}));

describe("getRedisClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetServerEnv.mockReturnValue({
      REDIS_URL: "redis://localhost:6379",
    });
    mockOn.mockReturnValue(undefined);
    mockDestroy.mockReturnValue(undefined);
    mockConnect.mockRejectedValue(new Error("connect failed"));
    mockCreateClient.mockReturnValue({
      isOpen: false,
      on: mockOn,
      connect: mockConnect,
      destroy: mockDestroy,
    });
  });

  it("uses a 750ms connect timeout for degraded-mode fail-open", async () => {
    const { getRedisClient } = await import("../redis");

    await expect(getRedisClient()).resolves.toBeNull();

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        socket: expect.objectContaining({
          connectTimeout: 750,
          reconnectStrategy: false,
        }),
      }),
    );
  });
});
