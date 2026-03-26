/** Tests for the health check endpoint. */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin client
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => Promise.resolve({ from: mockFrom }),
}));

// Mock Redis
const mockPing = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => Promise.resolve({ ping: mockPing }),
}));

import { GET } from "../route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with ok status when all checks pass", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        limit: () => ({
          maybeSingle: () => Promise.resolve({ error: null }),
        }),
      }),
    });
    mockPing.mockResolvedValue("PONG");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.supabase).toBe("ok");
    expect(body.checks.redis).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
  });

  it("returns 503 when Supabase is unreachable", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        limit: () => ({
          maybeSingle: () => Promise.resolve({ error: new Error("timeout") }),
        }),
      }),
    });
    mockPing.mockResolvedValue("PONG");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.supabase).toBe("error");
  });

  it("returns 200 with redis degraded when Redis is down", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        limit: () => ({
          maybeSingle: () => Promise.resolve({ error: null }),
        }),
      }),
    });
    mockPing.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.redis).toBe("degraded");
  });
});
