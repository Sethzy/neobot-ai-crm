/** Tests for Redis fixed-window rate limiter. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockTtl = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() =>
    Promise.resolve({
      incr: mockIncr,
      expire: mockExpire,
      ttl: mockTtl,
    }),
  ),
}));

import { checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when under limit", async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockTtl.mockResolvedValue(60);

    const result = await checkRateLimit("user:123", 30, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
  });

  it("sets expiry on first request in window (count === 1)", async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockTtl.mockResolvedValue(60);

    await checkRateLimit("user:123", 30, 60);
    expect(mockExpire).toHaveBeenCalledWith("ratelimit:user:123", 60);
  });

  it("does not set expiry on subsequent requests", async () => {
    mockIncr.mockResolvedValue(5);
    mockTtl.mockResolvedValue(45);

    await checkRateLimit("user:123", 30, 60);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("rejects request when over limit", async () => {
    mockIncr.mockResolvedValue(31);
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
