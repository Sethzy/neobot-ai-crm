# Middleware Auth: `getSession()` → `getUser()` Implementation Plan

**PR:** Out-of-plan — production hardening (auth security)
**Decisions:** DATA-08 (Supabase Auth)
**Goal:** Replace unverified `getSession()` with server-verified `getUser()` in middleware to prevent auth bypass via spoofed JWT cookies.

**Architecture:** Supabase SSR docs explicitly state `getSession()` returns unverified cookie data that **must not be used for authorization decisions**. Our middleware makes redirect decisions (protected → `/login`, auth-only → `/chat`) based on the `user` object from `getSession()`. A malicious client could craft a cookie to bypass these redirects. `getUser()` contacts the Supabase Auth server and returns verified user data. The latency cost (~20-50ms) only applies to dashboard requests — public routes already skip middleware auth.

**Tech Stack:** `@supabase/ssr`, Next.js 15 middleware, Vitest

---

## Relevant Files

- Modify: `middleware.ts`
- Create: `middleware.test.ts`

---

## Task 1: Write middleware tests for current `getSession()` behavior (baseline)

We need tests that capture the current redirect logic so we can safely refactor `getSession()` → `getUser()` without breaking behavior.

**Files:**
- Create: `middleware.test.ts`

**Step 1: Write the test file with all test cases**

Create `middleware.test.ts` at the project root (next to `middleware.ts`). We need to mock `@supabase/ssr`'s `createServerClient` to control what `getUser()` returns without hitting a real Supabase server.

```typescript
/**
 * Tests for Next.js middleware auth redirect logic.
 * @module middleware.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

function buildRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();

    // Stub env vars the middleware reads
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  async function runMiddleware(path: string) {
    const { middleware } = await import("./middleware");
    return middleware(buildRequest(path));
  }

  // --- Public routes (no auth check) ---

  it("passes through static infrastructure paths without auth check", async () => {
    const response = await runMiddleware("/_next/static/chunk.js");
    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("passes through /api/ routes without auth check", async () => {
    const response = await runMiddleware("/api/chat");
    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("passes through /market/ routes without auth check", async () => {
    const response = await runMiddleware("/market/agents");
    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("passes through /use-cases routes without auth check", async () => {
    const response = await runMiddleware("/use-cases/real-estate");
    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  // --- Protected routes (unauthenticated) ---

  it("redirects unauthenticated users on protected routes to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await runMiddleware("/chat");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("includes redirect param when redirecting to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await runMiddleware("/customers/deals");
    const redirectUrl = new URL(response.headers.get("location")!);
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("redirect")).toBe("/customers/deals");
  });

  // --- Auth-only routes (authenticated) ---

  it("redirects authenticated users from /login to /chat", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "a@b.com" } },
      error: null,
    });

    const response = await runMiddleware("/login");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/chat");
  });

  it("redirects authenticated users from / to /chat", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "a@b.com" } },
      error: null,
    });

    const response = await runMiddleware("/");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/chat");
  });

  it("redirects authenticated users from /register to /chat", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "a@b.com" } },
      error: null,
    });

    const response = await runMiddleware("/register");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/chat");
  });

  // --- Protected routes (authenticated) ---

  it("allows authenticated users through to protected routes", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "a@b.com" } },
      error: null,
    });

    const response = await runMiddleware("/chat");
    expect(response.status).toBe(200);
  });

  it("sets Server-Timing header on authenticated requests", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "a@b.com" } },
      error: null,
    });

    const response = await runMiddleware("/chat");
    expect(response.headers.get("Server-Timing")).toMatch(/middleware;dur=\d+/);
  });

  // --- Unauthenticated on AUTH_CHECK_ROUTES ---

  it("allows unauthenticated users to view / (landing page)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await runMiddleware("/");
    expect(response.status).toBe(200);
  });

  it("allows unauthenticated users to view /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await runMiddleware("/login");
    expect(response.status).toBe(200);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm vitest run middleware.test.ts
```

Expected: FAIL — tests import `middleware` which currently calls `supabase.auth.getSession()`, but our mock only provides `getUser`. The call to `getSession()` will throw or return undefined, causing test failures.

---

## Task 2: Refactor middleware from `getSession()` to `getUser()`

**Files:**
- Modify: `middleware.ts:96-109`

**Step 3: Replace `getSession()` with `getUser()` in middleware**

In `middleware.ts`, replace the `getSession()` call and surrounding code (lines 96-109) with the `getUser()` equivalent. Also remove the `console.log` that fires on every request (not appropriate for production).

Replace this block (lines 96-109):

```typescript
  // getSession() validates the JWT locally — no network round-trip.
  // Use getUser() in Server Components / API routes where you need
  // a verified identity from Supabase, not in the hot middleware path.
  const getSessionStart = performance.now();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const getSessionMs = (performance.now() - getSessionStart).toFixed(0);
  const supabaseMs = (performance.now() - supabaseStart).toFixed(0);

  console.log(
    `[middleware] ${pathname} | getSession: ${getSessionMs}ms | supabase total: ${supabaseMs}ms`
  );
```

With:

```typescript
  // getUser() contacts the Supabase Auth server — returns verified user data.
  // ~20-50ms per request. Public routes skip this entirely (early return above).
  // See: https://supabase.com/docs/guides/auth/server-side/creating-a-client
  const getUserStart = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const getUserMs = (performance.now() - getUserStart).toFixed(0);
  const supabaseMs = (performance.now() - supabaseStart).toFixed(0);
```

Also update the `Server-Timing` header (line 127):

Replace:
```typescript
    `middleware;dur=${totalMs}, supabase-session;dur=${getSessionMs}`
```

With:
```typescript
    `middleware;dur=${totalMs}, supabase-getUser;dur=${getUserMs}`
```

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm vitest run middleware.test.ts
```

Expected: ALL PASS — every test case should now work against the `getUser()` mock.

**Step 5: Commit**

```bash
git add middleware.ts middleware.test.ts
git commit -m "fix(auth): replace getSession() with getUser() in middleware for verified auth

getSession() only parses the JWT cookie locally without server verification.
A malicious client could craft a spoofed cookie to bypass middleware redirects.
getUser() contacts the Supabase Auth server on each request, ensuring the
user identity is verified. The latency cost only applies to authenticated
dashboard routes — public routes already skip middleware auth.

Also removes the per-request console.log that was firing in production.

Refs: https://supabase.com/docs/guides/auth/server-side/creating-a-client"
```

---

## Verification Checklist

- [ ] Every new test has been watched to fail before implementation
- [ ] Each test failed for expected reason (missing `getUser` method, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real middleware logic (mocks only for Supabase network layer)
- [ ] Edge cases covered: public routes, auth-only routes, protected routes, unauthenticated, authenticated
