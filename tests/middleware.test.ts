/**
 * Tests for auth redirects and asset skipping in Next.js middleware.
 * @module tests/middleware
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

function buildRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

async function runMiddleware(pathname: string) {
  const { middleware } = await import("../middleware");
  return middleware(buildRequest(pathname));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    delete process.env.DEBUG_LATENCY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("skips auth checks for infrastructure routes", async () => {
    const response = await runMiddleware("/api/chat");

    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("skips auth checks for public market routes", async () => {
    const response = await runMiddleware("/market/agents/123");

    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated protected requests to login with redirect param", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await runMiddleware("/chat");
    const location = new URL(response.headers.get("location") ?? "", "http://localhost");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/chat");
  });

  it("redirects authenticated users away from auth-only routes", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "seth@example.com" } },
    });

    const response = await runMiddleware("/login");
    const location = new URL(response.headers.get("location") ?? "", "http://localhost");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/chat");
  });

  it("allows authenticated users through protected routes and sets Server-Timing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "seth@example.com" } },
    });

    const response = await runMiddleware("/chat");

    expect(response.status).toBe(200);
    expect(response.headers.get("Server-Timing")).toMatch(
      /middleware;dur=\d+, supabase-getUser;dur=\d+/
    );
  });

  it("does not emit latency logs unless DEBUG_LATENCY is enabled", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "seth@example.com" } },
    });
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMiddleware("/chat");

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("emits latency logs when DEBUG_LATENCY is enabled", async () => {
    process.env.DEBUG_LATENCY = "1";
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "seth@example.com" } },
    });
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMiddleware("/chat");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[middleware] \/chat \| getUser: \d+ms \| supabase total: \d+ms/)
    );
  });

  it("exports a matcher that skips known static assets and extensioned files", async () => {
    const { config } = await import("../middleware");

    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|.*\\..*).*)",
    ]);
  });
});
