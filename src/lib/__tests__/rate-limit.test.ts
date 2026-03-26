/** Tests for Redis fixed-window rate limiter. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMulti = vi.fn();
const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockExec = vi.fn();
const mockTtl = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() =>
    Promise.resolve({
      multi: mockMulti,
      ttl: mockTtl,
    }),
  ),
}));

import { checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const { getRedisClient } = await import("@/lib/redis");
    vi.mocked(getRedisClient).mockResolvedValueOnce(null);

    const result = await checkRateLimit("user:123", 30, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(30);
  });

  it("fails open when Redis throws", async () => {
    mockIncr.mockRejectedValue(new Error("ECONNRESET"));

    const result = await checkRateLimit("user:123", 30, 60);
    expect(result.allowed).toBe(true);
  });
});
