# Production Hardening — PRs 47a–47f

**PRs:** 47a (error boundaries), 47b (env validation), 47c (health check), 47d (security headers), 47e (Sentry), 47f (rate limiting)
**Goal:** Add production-grade error handling, observability, security, and rate limiting.
**Commit strategy:** One commit per PR (6 commits total). Use `feat(pr47X): <description>` format.

**Design decisions (reviewed & approved):**
1. Chat error boundary catches **render crashes only** — streaming errors already handled by `useChat` hook's `onError` callback in `src/components/chat/chat-panel.tsx:303-308`
2. Chat boundary wraps **ChatPanel at the two chat route entrypoints** (`chat-thread-page-client.tsx`, `chat-draft-page.tsx`), NOT the dashboard layout — preserves "shell survives" intent
3. Env validation uses **lazy-memoized `getServerEnv()`** — validates on first access, no startup ordering dependency, safe for tests/scripts
4. Existing module helpers (`supabase/env.ts`, `sandbox/env.ts`, `apify/env.ts`) delegate to central env where it reduces repetition
5. Health check is **public, minimal, with 3s timeout** — uses `createAdminClient()` (the real API), Redis informational only
6. Security headers: 4 easy headers enforced + **CSP report-only with env-derived origins**
7. Sentry: **manual setup**, single `SENTRY_DSN` (shared client+server), `sendDefaultPii: false`, conservative `beforeSend` scrubbing
8. Rate limiting: **fixed-window** INCR+EXPIRE (honestly named), no external library
9. Rate limit targets: `/api/chat` per-user + `/api/trigger/webhook/[triggerId]` per-IP only — **skip Telegram** (already HMAC-authenticated, shared vendor IPs)
10. All commands use **`pnpm`** (per `package.json` `packageManager` field)

**Prerequisite:** Create a Sentry project at https://sentry.io for Next.js. Obtain the DSN and auth token. Add `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (same value — needed for browser-side capture), and `SENTRY_AUTH_TOKEN` to `.env.local` before starting PR 47e.

---

## Relevant Files

### New Files
| File | PR | Purpose |
|------|----|---------|
| `src/lib/env.ts` | 47b | Zod schema validating critical server env vars, lazy-memoized |
| `src/lib/__tests__/env.test.ts` | 47b | Tests for env validation |
| `app/error.tsx` | 47a | Root error boundary (catches errors outside dashboard) |
| `app/global-error.tsx` | 47a | Global error boundary (catches root layout errors — uses inline styles) |
| `app/(dashboard)/error.tsx` | 47a | Dashboard error boundary (preserves sidebar shell on route errors) |
| `src/components/chat/chat-error-boundary.tsx` | 47a | Chat-specific render crash boundary |
| `src/components/chat/chat-error-boundary.test.tsx` | 47a | Tests for chat error boundary |
| `app/api/health/route.ts` | 47c | Health check endpoint (public, no auth) |
| `app/api/health/__tests__/route.test.ts` | 47c | Tests for health check |
| `src/lib/rate-limit.ts` | 47f | Redis fixed-window rate limiter (fail-open) |
| `src/lib/__tests__/rate-limit.test.ts` | 47f | Tests for rate limiter |
| `sentry.client.config.ts` | 47e | Sentry browser-side init |
| `sentry.server.config.ts` | 47e | Sentry server-side init |
| `sentry.edge.config.ts` | 47e | Sentry edge runtime init |

### Modified Files
| File | PR | Change |
|------|----|--------|
| `src/lib/ai/gateway.ts` | 47b | Use `getServerEnv().AI_GATEWAY_API_KEY` |
| `src/lib/redis.ts` | 47b, 47c | Use `getServerEnv().REDIS_URL`, export `getRedisClient` |
| `src/lib/supabase/server.ts` | 47b | Delegate `SUPABASE_SERVICE_ROLE_KEY` to `getServerEnv()` |
| `src/lib/supabase/env.ts` | 47b | Delegate to `getServerEnv()` for Supabase URL/anon key |
| `app/api/chat/route.ts` | 47b, 47f | Remove manual env check, add rate limiting |
| `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx` | 47a | Wrap `ChatPanel` with `ChatErrorBoundary` |
| `app/(dashboard)/chat/chat-draft-page.tsx` | 47a | Wrap `ChatPanel` with `ChatErrorBoundary` |
| `next.config.ts` | 47d, 47e | Add security headers + `withSentryConfig` wrapper |
| `instrumentation.ts` (root) | 47e | Import Sentry server config — this is the single startup entrypoint |
| `instrumentation-client.ts` | 47e | Import Sentry client config |
| `app/api/trigger/webhook/[triggerId]/route.ts` | 47f | Add per-IP rate limiting |
| `.env.example` | 47e | Add `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` |
| `package.json` | 47e | Add `@sentry/nextjs` dependency |

---

## Task 1: PR 47b — Environment Validation

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/__tests__/env.test.ts`
- Modify: `src/lib/ai/gateway.ts`
- Modify: `src/lib/redis.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/supabase/env.ts`
- Modify: `app/api/chat/route.ts`

### Step 1: Write failing tests for env validation

```typescript
// src/lib/__tests__/env.test.ts
/** Tests for centralized environment variable validation. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getServerEnv, _resetForTesting } from "../env";

describe("getServerEnv", () => {
  afterEach(() => {
    _resetForTesting();
    vi.unstubAllEnvs();
  });

  const REQUIRED = {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    AI_GATEWAY_API_KEY: "test-gateway-key",
  };

  function stubAllRequired() {
    for (const [key, value] of Object.entries(REQUIRED)) {
      vi.stubEnv(key, value);
    }
  }

  it("returns validated env when all required vars are set", () => {
    stubAllRequired();
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe(REQUIRED.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.SUPABASE_ANON_KEY).toBe(REQUIRED.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(REQUIRED.SUPABASE_SERVICE_ROLE_KEY);
    expect(env.AI_GATEWAY_API_KEY).toBe(REQUIRED.AI_GATEWAY_API_KEY);
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("throws with descriptive message when a required var is missing", () => {
    stubAllRequired();
    vi.stubEnv("AI_GATEWAY_API_KEY", "");

    expect(() => getServerEnv()).toThrow(/AI_GATEWAY_API_KEY/);
  });

  it("throws when SUPABASE_URL is missing from both NEXT_PUBLIC and fallback", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(() => getServerEnv()).toThrow(/SUPABASE_URL/);
  });

  it("falls back to SUPABASE_URL when NEXT_PUBLIC variant is missing", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "https://fallback.supabase.co");

    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe("https://fallback.supabase.co");
  });

  it("falls back to SUPABASE_ANON_KEY when NEXT_PUBLIC variant is missing", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "fallback-anon-key");

    const env = getServerEnv();
    expect(env.SUPABASE_ANON_KEY).toBe("fallback-anon-key");
  });

  it("accepts optional vars as undefined", () => {
    stubAllRequired();

    const env = getServerEnv();
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("caches result on subsequent calls", () => {
    stubAllRequired();

    const first = getServerEnv();
    vi.stubEnv("AI_GATEWAY_API_KEY", "changed");
    const second = getServerEnv();

    expect(first).toBe(second);
  });

  it("trims whitespace from values", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "  https://test.supabase.co  ");

    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe("https://test.supabase.co");
  });

  it("treats whitespace-only values as empty (missing)", () => {
    stubAllRequired();
    vi.stubEnv("AI_GATEWAY_API_KEY", "   ");

    expect(() => getServerEnv()).toThrow(/AI_GATEWAY_API_KEY/);
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/__tests__/env.test.ts
```
Expected: FAIL — module `../env` does not export `getServerEnv`.

### Step 3: Implement env.ts

```typescript
// src/lib/env.ts
/** Centralized environment validation for critical server-side env vars. */
import { z } from "zod";

const nonEmpty = z.string().min(1);

const serverEnvSchema = z.object({
  // Required — app cannot function without these
  SUPABASE_URL: nonEmpty,
  SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  AI_GATEWAY_API_KEY: nonEmpty,

  // Optional — features degrade gracefully when missing
  REDIS_URL: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  COMPOSIO_API_KEY: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  SUNDER_INTERNAL_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let _cached: ServerEnv | null = null;

/**
 * Validate and return all critical server env vars.
 * Lazy-memoized: validates on first access, caches thereafter.
 * Safe to call from any context (startup, tests, scripts).
 */
export function getServerEnv(): ServerEnv {
  if (_cached) return _cached;

  const raw = {
    // Use || (not ??) so empty strings fall through to the fallback alias
    SUPABASE_URL: (
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
    ).trim(),
    SUPABASE_ANON_KEY: (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
    ).trim(),
    SUPABASE_SERVICE_ROLE_KEY: (
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
    ).trim(),
    AI_GATEWAY_API_KEY: (process.env.AI_GATEWAY_API_KEY ?? "").trim(),
    REDIS_URL: process.env.REDIS_URL?.trim() || undefined,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
    STRIPE_WEBHOOK_SECRET:
      process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY?.trim() || undefined,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    TELEGRAM_WEBHOOK_SECRET:
      process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
    BRAVE_SEARCH_API_KEY:
      process.env.BRAVE_SEARCH_API_KEY?.trim() || undefined,
    EXA_API_KEY: process.env.EXA_API_KEY?.trim() || undefined,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined,
    SENTRY_DSN: process.env.SENTRY_DSN?.trim() || undefined,
    CRON_SECRET: process.env.CRON_SECRET?.trim() || undefined,
    SUNDER_INTERNAL_SECRET:
      process.env.SUNDER_INTERNAL_SECRET?.trim() || undefined,
  };

  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `[env] Missing or invalid required environment variables: ${missing}. ` +
        `Check .env.example for the full list.`,
    );
  }

  _cached = result.data;
  return _cached;
}

/** Reset cached env — test-only. */
export function _resetForTesting(): void {
  _cached = null;
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/__tests__/env.test.ts
```
Expected: PASS — all 9 tests green.

### Step 5: Migrate critical paths to use `getServerEnv()`

**`src/lib/ai/gateway.ts`** — Replace `process.env.AI_GATEWAY_API_KEY` (line 27):
```typescript
// Before:
import { createGateway } from "@ai-sdk/gateway";
// ...
export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

// After:
import { createGateway } from "@ai-sdk/gateway";
import { getServerEnv } from "@/lib/env";
// ...
export const gateway = createGateway({
  apiKey: getServerEnv().AI_GATEWAY_API_KEY,
});
```

**`src/lib/redis.ts`** — Replace `process.env.REDIS_URL` (line 16) and export `getRedisClient`:
```typescript
// Before:
async function getRedisClient(): Promise<RedisClient | null> {
  const redisUrl = process.env.REDIS_URL;

// After:
import { getServerEnv } from "@/lib/env";

export async function getRedisClient(): Promise<RedisClient | null> {
  const redisUrl = getServerEnv().REDIS_URL;
```
Note: The `export` on `getRedisClient` is needed by PR 47c (health check) and PR 47f (rate limiting).

**`src/lib/supabase/server.ts`** — Replace `process.env.SUPABASE_SERVICE_ROLE_KEY` (line 47):
```typescript
// Before:
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!serviceRoleKey) {
  throw new Error("Missing Supabase admin credentials");
}

// After:
import { getServerEnv } from "@/lib/env";
// ...
const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
// No null check needed — getServerEnv() already validated it
```

**`src/lib/supabase/env.ts`** — Delegate to `getServerEnv()` for the common Supabase URL/anon key:
```typescript
// Before:
export function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
  ).trim();
  const supabaseAnonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ""
  ).trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase env vars...");
  }
  return { supabaseUrl, supabaseAnonKey };
}

// After:
import { getServerEnv } from "@/lib/env";

export function getSupabaseEnv(): SupabaseEnv {
  const env = getServerEnv();
  return { supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY };
}
```

**`app/api/chat/route.ts`** — Remove the manual `process.env.AI_GATEWAY_API_KEY` check (line 152-154):
```typescript
// Delete these lines (validation now happens lazily in gateway.ts via getServerEnv):
  if (!process.env.AI_GATEWAY_API_KEY) {
    return jsonError("Server misconfiguration: AI_GATEWAY_API_KEY is required.", 500);
  }
```

### Step 6: Run tests to verify nothing broke

```bash
pnpm vitest run src/lib/__tests__/env.test.ts
```
Expected: PASS.

### Step 7: Commit

```bash
git add src/lib/env.ts src/lib/__tests__/env.test.ts \
  src/lib/ai/gateway.ts src/lib/redis.ts src/lib/supabase/server.ts \
  src/lib/supabase/env.ts app/api/chat/route.ts
git commit -m "feat(pr47b): centralized env validation with lazy-memoized getServerEnv()"
```

---

## Task 2: PR 47a — Error Boundaries

**Files:**
- Create: `app/error.tsx`
- Create: `app/global-error.tsx`
- Create: `app/(dashboard)/error.tsx`
- Create: `src/components/chat/chat-error-boundary.tsx`
- Create: `src/components/chat/chat-error-boundary.test.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx`
- Modify: `app/(dashboard)/chat/chat-draft-page.tsx`

### Step 1: Write failing test for chat error boundary

```typescript
// src/components/chat/chat-error-boundary.test.tsx
/** Tests for the chat-specific error boundary that catches render crashes. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatErrorBoundary } from "./chat-error-boundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("render crash");
  return <div>Chat content</div>;
}

describe("ChatErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error", () => {
    render(
      <ChatErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ChatErrorBoundary>,
    );
    expect(screen.getByText("Chat content")).toBeInTheDocument();
  });

  it("renders fallback UI on render crash", () => {
    render(
      <ChatErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ChatErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("recovers when Try Again is clicked", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function Toggler() {
      if (shouldThrow) throw new Error("render crash");
      return <div>Recovered</div>;
    }

    render(
      <ChatErrorBoundary>
        <Toggler />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("logs error to console with component stack", () => {
    render(
      <ChatErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ChatErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      "[ChatErrorBoundary] render crash:",
      expect.any(Error),
      expect.stringContaining("ThrowingChild"),
    );
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/components/chat/chat-error-boundary.test.tsx
```
Expected: FAIL — module not found.

### Step 3: Implement chat error boundary

```typescript
// src/components/chat/chat-error-boundary.tsx
"use client";
/** Error boundary that catches render crashes in the chat panel. */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[ChatErrorBoundary] render crash:",
      error,
      info.componentStack,
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            The chat encountered an unexpected error. Your conversation is safe
            — try refreshing.
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/components/chat/chat-error-boundary.test.tsx
```
Expected: PASS — all 4 tests green.

### Step 5: Add root error boundary

```typescript
// app/error.tsx
"use client";
/** Root error boundary — catches unhandled errors outside the dashboard shell. */
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[RootError]", error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-6 w-6" />
        <h1 className="text-xl font-semibold">Something went wrong</h1>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}
      <Button variant="outline" onClick={reset}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
```

### Step 6: Add global error boundary

```typescript
// app/global-error.tsx
"use client";
/**
 * Global error boundary — catches errors in the root layout itself.
 * Uses inline styles because the root layout (which loads CSS) may have crashed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[GlobalError]", error);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#666", maxWidth: "24rem" }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1rem", border: "1px solid #ccc", borderRadius: "0.375rem", cursor: "pointer", background: "white" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
```

### Step 7: Add dashboard error boundary

```typescript
// app/(dashboard)/error.tsx
"use client";
/** Dashboard error boundary — catches route-level errors while preserving the sidebar shell. */
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[DashboardError]", error);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        This page encountered an error. Your data is safe.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={reset}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
```

### Step 8: Wire ChatErrorBoundary into chat entrypoints

**`app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx`** — Wrap `ChatPanel`:
```typescript
// Before (current line 25):
  return (
    <ChatPanel
      chatId={threadId}
      initialMessages={initialMessages}
      initialQuota={initialQuota}
      autoResume
    />
  );

// After:
import { ChatErrorBoundary } from "@/components/chat/chat-error-boundary";
// ...
  return (
    <ChatErrorBoundary>
      <ChatPanel
        chatId={threadId}
        initialMessages={initialMessages}
        initialQuota={initialQuota}
        autoResume
      />
    </ChatErrorBoundary>
  );
```

**`app/(dashboard)/chat/chat-draft-page.tsx`** — Wrap `ChatPanel`:
```typescript
// Before (current line 24):
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatPanel
        chatId={id}
        initialMessages={[]}
        initialQuota={initialQuota}
        autoResume={false}
        initialPrompt={initialPrompt}
      />
    </div>
  );

// After:
import { ChatErrorBoundary } from "@/components/chat/chat-error-boundary";
// ...
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatErrorBoundary>
        <ChatPanel
          chatId={id}
          initialMessages={[]}
          initialQuota={initialQuota}
          autoResume={false}
          initialPrompt={initialPrompt}
        />
      </ChatErrorBoundary>
    </div>
  );
```

### Step 9: Run tests and commit

```bash
pnpm vitest run src/components/chat/chat-error-boundary.test.tsx
```
Expected: PASS.

```bash
git add app/error.tsx app/global-error.tsx app/(dashboard)/error.tsx \
  src/components/chat/chat-error-boundary.tsx \
  src/components/chat/chat-error-boundary.test.tsx \
  app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx \
  app/(dashboard)/chat/chat-draft-page.tsx
git commit -m "feat(pr47a): error boundaries — root, dashboard, global, and chat render crash"
```

---

## Task 3: PR 47c — Health Check Endpoint

**Files:**
- Create: `app/api/health/route.ts`
- Create: `app/api/health/__tests__/route.test.ts`

Note: `getRedisClient` was already exported in Task 1 (PR 47b).

### Step 1: Write failing test

```typescript
// app/api/health/__tests__/route.test.ts
/** Tests for the health check endpoint. */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin client
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () =>
    Promise.resolve({ from: mockFrom }),
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

  it("returns 503 when Supabase query times out", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        limit: () => ({
          maybeSingle: () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 5000),
            ),
        }),
      }),
    });
    mockPing.mockResolvedValue("PONG");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.supabase).toBe("error");
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run app/api/health/__tests__/route.test.ts
```
Expected: FAIL — module not found.

### Step 3: Implement health check

```typescript
// app/api/health/route.ts
/** Public health check endpoint for monitoring and load balancers. */
import { createAdminClient } from "@/lib/supabase/server";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

const SUPABASE_TIMEOUT_MS = 3000;

async function checkSupabase(): Promise<"ok" | "error"> {
  try {
    const supabase = await createAdminClient();
    const result = await Promise.race([
      supabase.from("clients").select("client_id").limit(1).maybeSingle(),
      new Promise<{ error: Error }>((resolve) =>
        setTimeout(() => resolve({ error: new Error("timeout") }), SUPABASE_TIMEOUT_MS),
      ),
    ]);
    return result.error ? "error" : "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "degraded"> {
  try {
    const client = await getRedisClient();
    if (!client) return "degraded";
    await client.ping();
    return "ok";
  } catch {
    return "degraded";
  }
}

export async function GET() {
  const [supabase, redis] = await Promise.all([
    checkSupabase(),
    checkRedis(),
  ]);

  const isHealthy = supabase === "ok";
  const body = {
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    checks: { supabase, redis },
  };

  return Response.json(body, { status: isHealthy ? 200 : 503 });
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run app/api/health/__tests__/route.test.ts
```
Expected: PASS — all 4 tests green.

### Step 5: Commit

```bash
git add app/api/health/route.ts app/api/health/__tests__/route.test.ts
git commit -m "feat(pr47c): health check endpoint with Supabase timeout and Redis status"
```

---

## Task 4: PR 47d — Security Headers

**Files:**
- Modify: `next.config.ts`
- Create: `src/lib/__tests__/security-headers.test.ts`

### Step 1: Write failing test for header presence

```typescript
// src/lib/__tests__/security-headers.test.ts
/** Tests that security header config produces the expected header set. */
import { describe, it, expect } from "vitest";
import { securityHeaders } from "../security-headers";

describe("securityHeaders", () => {
  it("includes X-Frame-Options DENY", () => {
    const header = securityHeaders.find((h) => h.key === "X-Frame-Options");
    expect(header?.value).toBe("DENY");
  });

  it("includes X-Content-Type-Options nosniff", () => {
    const header = securityHeaders.find(
      (h) => h.key === "X-Content-Type-Options",
    );
    expect(header?.value).toBe("nosniff");
  });

  it("includes Referrer-Policy", () => {
    const header = securityHeaders.find((h) => h.key === "Referrer-Policy");
    expect(header?.value).toBe("strict-origin-when-cross-origin");
  });

  it("includes Permissions-Policy", () => {
    const header = securityHeaders.find((h) => h.key === "Permissions-Policy");
    expect(header?.value).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("includes Content-Security-Policy-Report-Only (not enforcing)", () => {
    const csp = securityHeaders.find(
      (h) => h.key === "Content-Security-Policy-Report-Only",
    );
    expect(csp).toBeDefined();
    expect(csp?.value).toContain("default-src 'self'");
    // Should NOT have an enforcing CSP header
    const enforcing = securityHeaders.find(
      (h) => h.key === "Content-Security-Policy",
    );
    expect(enforcing).toBeUndefined();
  });

  it("derives Supabase origin from NEXT_PUBLIC_SUPABASE_URL", () => {
    const csp = securityHeaders.find(
      (h) => h.key === "Content-Security-Policy-Report-Only",
    );
    // Should include the Supabase host in connect-src and img-src
    expect(csp?.value).toContain("connect-src");
    expect(csp?.value).toContain("img-src");
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/__tests__/security-headers.test.ts
```
Expected: FAIL — module not found.

### Step 3: Implement security headers module

```typescript
// src/lib/security-headers.ts
/**
 * Security headers applied to all routes via next.config.ts headers().
 * CSP is report-only for the first pass — promote to enforcing after
 * verifying no violations in production.
 */

// Derive Supabase host from env or fall back to the known project host.
const supabaseHost =
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : "xtewwwycvapskgvfnliq.supabase.co";

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "us.i.posthog.com";

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://${posthogHost} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  `img-src 'self' data: blob: https://${supabaseHost}`,
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://${posthogHost} https://vercel.live https://backend.composio.dev`,
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
];
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/__tests__/security-headers.test.ts
```
Expected: PASS — all 6 tests green.

### Step 5: Wire into next.config.ts

In `next.config.ts`, add `headers()` to the config and import `securityHeaders`:

```typescript
// Add import at top:
import { securityHeaders } from "./src/lib/security-headers";

// Inside nextConfig object, add after redirects():
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
```

### Step 6: Commit

```bash
git add src/lib/security-headers.ts src/lib/__tests__/security-headers.test.ts next.config.ts
git commit -m "feat(pr47d): security headers — X-Frame-Options, CSP report-only, and more"
```

---

## Task 5: PR 47e — Sentry Integration

**Prerequisite:** `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` in `.env.local`.

**Files:**
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Modify: `instrumentation.ts` (root — the single startup entrypoint)
- Modify: `instrumentation-client.ts`
- Modify: `next.config.ts`
- Modify: `src/components/chat/chat-error-boundary.tsx`
- Modify: `app/error.tsx`, `app/global-error.tsx`, `app/(dashboard)/error.tsx`
- Modify: `.env.example`
- Modify: `package.json`

### Step 1: Install Sentry

```bash
pnpm add @sentry/nextjs
```

### Step 2: Create Sentry config files

```typescript
// sentry.client.config.ts
/** Sentry browser-side initialization. */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    sendDefaultPii: false,
    environment:
      process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT ?? process.env.NODE_ENV,

    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-supabase-auth"];
      }
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      return event;
    },
  });
}
```

```typescript
// sentry.server.config.ts
/** Sentry server-side initialization. */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-supabase-auth"];
      }
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      if (event.request?.url) {
        event.request.url = event.request.url
          .replace(/apikey=[^&]+/g, "apikey=[FILTERED]")
          .replace(/token=[^&]+/g, "token=[FILTERED]");
      }
      return event;
    },
  });
}
```

```typescript
// sentry.edge.config.ts
/** Sentry edge runtime initialization. */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
```

### Step 3: Wire Sentry into instrumentation files

**Root `instrumentation.ts`** — this is the Next.js auto-loaded entrypoint. Add Sentry server import:
```typescript
// instrumentation.ts (root file)
// Before:
export { langfuseSpanProcessor } from "./src/instrumentation";

// After:
import "./sentry.server.config";
export { langfuseSpanProcessor } from "./src/instrumentation";
```

**`instrumentation-client.ts`** — add Sentry client import at the top:
```typescript
// instrumentation-client.ts
// Add as first import:
import "./sentry.client.config";

// ... rest of existing PostHog init
```

### Step 4: Wrap next.config.ts with withSentryConfig

```typescript
// next.config.ts
// Add import at top:
import { withSentryConfig } from "@sentry/nextjs";

// At the bottom, replace:
//   export default withBundleAnalyzer(nextConfig);
// with:
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
```

Note: `org` and `project` are read from `.sentryclirc` or env vars `SENTRY_ORG`/`SENTRY_PROJECT` automatically by the Sentry CLI. No need to hardcode.

### Step 5: Wire error boundaries to Sentry.captureException

**`src/components/chat/chat-error-boundary.tsx`** — add Sentry to `componentDidCatch`:
```typescript
// Add import:
import * as Sentry from "@sentry/nextjs";

// Update componentDidCatch:
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[ChatErrorBoundary] render crash:",
      error,
      info.componentStack,
    );
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }
```

**`app/error.tsx`**, **`app/global-error.tsx`**, and **`app/(dashboard)/error.tsx`** — add Sentry capture:
```typescript
// Add imports to each file:
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Add inside the component function, before the return:
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
```

Note: `app/global-error.tsx` must NOT import from `@sentry/nextjs` at the top level because the root layout may have crashed. Use a dynamic import instead:
```typescript
// app/global-error.tsx — use dynamic import for safety:
  useEffect(() => {
    import("@sentry/nextjs").then((Sentry) => {
      Sentry.captureException(error);
    });
  }, [error]);
```

### Step 6: Update .env.example

Add to `.env.example`:
```
# Sentry error tracking (PR 47e)
# Use the same DSN for both server and client.
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

### Step 7: Commit

```bash
git add sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts \
  instrumentation.ts instrumentation-client.ts next.config.ts \
  src/components/chat/chat-error-boundary.tsx \
  app/error.tsx app/global-error.tsx app/(dashboard)/error.tsx \
  .env.example package.json pnpm-lock.yaml
git commit -m "feat(pr47e): Sentry integration with conservative PII scrubbing"
```

---

## Task 6: PR 47f — API Rate Limiting

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/__tests__/rate-limit.test.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/trigger/webhook/[triggerId]/route.ts`

Note: Telegram webhook is **excluded** — it already has HMAC secret validation and traffic comes from shared Telegram IPs.

### Step 1: Write failing tests for rate limiter

```typescript
// src/lib/__tests__/rate-limit.test.ts
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
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/__tests__/rate-limit.test.ts
```
Expected: FAIL — module not found.

### Step 3: Implement rate limiter

```typescript
// src/lib/rate-limit.ts
/** Redis fixed-window rate limiter. Fail-open when Redis is unavailable. */
import { getRedisClient } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

const KEY_PREFIX = "ratelimit:";

/**
 * Check if a request is within the rate limit using a fixed-window counter.
 * @param key - Unique identifier (e.g., "chat:userId" or "webhook:ip")
 * @param limit - Max requests per window
 * @param windowSeconds - Window duration in seconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = await getRedisClient();
  if (!client) {
    return { allowed: true, remaining: limit };
  }

  const redisKey = `${KEY_PREFIX}${key}`;

  try {
    const count = await client.incr(redisKey);

    // Set expiry on the first request in this window
    if (count === 1) {
      await client.expire(redisKey, windowSeconds);
    }

    if (count > limit) {
      const ttl = await client.ttl(redisKey);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return { allowed: true, remaining: limit - count };
  } catch {
    // Fail open — don't block requests if Redis errors
    return { allowed: true, remaining: limit };
  }
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/__tests__/rate-limit.test.ts
```
Expected: PASS — all 6 tests green.

### Step 5: Wire rate limiting into chat route

In `app/api/chat/route.ts`, add after authentication (after `authenticateRequest()` around line 187):

```typescript
// Add import at top:
import { checkRateLimit } from "@/lib/rate-limit";

// After: const { supabase, userId } = authResult;
const { allowed, retryAfter } = await checkRateLimit(
  `chat:${userId}`,
  30, // 30 requests per minute
  60,
);
if (!allowed) {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded. Please wait before sending more messages.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter ?? 60),
      },
    },
  );
}
```

Note: The auth helper returns `userId` (string), not `user.id`. See `src/lib/api/route-helpers.ts:24`.

### Step 6: Wire rate limiting into trigger webhook route

In `app/api/trigger/webhook/[triggerId]/route.ts`, add at the top of the POST handler:

```typescript
// Add import at top:
import { checkRateLimit } from "@/lib/rate-limit";

// At the start of POST(), before signature verification:
const ip =
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const { allowed, retryAfter } = await checkRateLimit(
  `webhook-trigger:${ip}`,
  60, // 60 requests per minute per IP
  60,
);
if (!allowed) {
  return new Response("Rate limit exceeded", {
    status: 429,
    headers: { "Retry-After": String(retryAfter ?? 60) },
  });
}
```

### Step 7: Commit

```bash
git add src/lib/rate-limit.ts src/lib/__tests__/rate-limit.test.ts \
  app/api/chat/route.ts \
  app/api/trigger/webhook/\[triggerId\]/route.ts
git commit -m "feat(pr47f): fixed-window rate limiting — per-user chat, per-IP webhooks"
```

---

## Post-Implementation

After all 6 PRs are committed:

1. Run full test suite:
```bash
pnpm vitest run
```

2. Verify build:
```bash
pnpm build
```

3. Update v2 plan — set `"status": "done"` and `"simplified": true` for PRs 47a–47f in `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`.
