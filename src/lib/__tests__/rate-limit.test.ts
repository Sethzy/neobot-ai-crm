/** Tests for Redis fixed-window rate limiter. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockMulti,
  mockIncr,
  mockExpire,
  mockExec,
  mockTtl,
  mockGetRedisClient,
} = vi.hoisted(() => {
  const hoistedMockMulti = vi.fn();
  const hoistedMockIncr = vi.fn();
  const hoistedMockExpire = vi.fn();
  const hoistedMockExec = vi.fn();
  const hoistedMockTtl = vi.fn();
  const hoistedMockGetRedisClient = vi.fn(() =>
    Promise.resolve({
      multi: hoistedMockMulti,
      ttl: hoistedMockTtl,
    }),
  );

  return {
    mockMulti: hoistedMockMulti,
    mockIncr: hoistedMockIncr,
    mockExpire: hoistedMockExpire,
    mockExec: hoistedMockExec,
    mockTtl: hoistedMockTtl,
    mockGetRedisClient: hoistedMockGetRedisClient,
  };
});

vi.mock("@/lib/redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

import { checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockImplementation(() =>
      Promise.resolve({
        multi: mockMulti,
        ttl: mockTtl,
      }),
    );
    // Default: MULTI returns a chainable object, EXEC returns [incrResult, expireResult]
    mockMulti.mockReturnValue({
      incr: mockIncr,
      expire: mockExpire,
      exec: mockExec,
    });
    mockIncr.mockReturnThis();
    mockExpire.mockReturnThis();
  });

  it("allows request when under limit", async () => {
    mockExec.mockResolvedValue([1, 1]);
    mockTtl.mockResolvedValue(60);

    const result = await checkRateLimit("user:123", 30, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
  });

  it("uses MULTI/EXEC for atomic INCR+EXPIRE", async () => {
    mockExec.mockResolvedValue([1, 1]);
    mockTtl.mockResolvedValue(60);

    await checkRateLimit("user:123", 30, 60);
    expect(mockMulti).toHaveBeenCalled();
    expect(mockIncr).toHaveBeenCalledWith("ratelimit:user:123");
    expect(mockExpire).toHaveBeenCalledWith("ratelimit:user:123", 60, "NX");
    expect(mockExec).toHaveBeenCalled();
  });

  it("rejects request when over limit", async () => {
    mockExec.mockResolvedValue([31, 0]);
    mockTtl.mockResolvedValue(30);

    const result = await checkRateLimit("user:123", 30, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(30);
  });

  it("allows request when Redis is unavailable (fail-open)", async () => {
    mockGetRedisClient.mockResolvedValueOnce(null);

    const result = await checkRateLimit("user:123", 30, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(30);
  });

  it("fails open within 1 second when Redis is unreachable", async () => {
    mockGetRedisClient.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(null), 800);
        }),
    );

    const startedAt = Date.now();
    const result = await checkRateLimit("user:123", 30, 60);

    expect(result).toEqual({ allowed: true, remaining: 30 });
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("fails open when Redis throws", async () => {
    mockIncr.mockRejectedValue(new Error("ECONNRESET"));

    const result = await checkRateLimit("user:123", 30, 60);
    expect(result.allowed).toBe(true);
  });
});
