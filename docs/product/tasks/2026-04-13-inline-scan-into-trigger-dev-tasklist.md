# Inline Scanner into Trigger.dev Task — Implementation Plan

**Goal:** Remove the pointless HTTP hop where Trigger.dev calls `/api/cron/scan` over HTTPS just to invoke `runScan()`. Call `runScan()` directly in the Trigger.dev scheduled task, delete the dead cron route.

**Architecture:** The current flow is `Trigger.dev → HTTP GET /api/cron/scan → runScan() → HTTP POST /api/trigger/run`. After this change: `Trigger.dev → runScan() in-process → HTTP POST /api/trigger/run`. The scan hop is eliminated. The dispatch hop to `/api/trigger/run` stays — it's a clean internal API that validates claims and spawns `runTriggerAgent` tasks. `runScan()` and `createAdminClient()` are already proven to work in Trigger.dev's runtime (see `src/trigger/run-trigger-agent.ts`).

**Tech Stack:** Trigger.dev v3 SDK, Supabase admin client, Vitest

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

---

## Relevant Files

### Modified
- `src/trigger/scan-triggers.ts` — Rewrite to import `runScan` and `createAdminClient` directly
- `src/trigger/__tests__/scan-triggers.test.ts` — New test file for the rewritten task
- `src/lib/triggers/schemas.ts:40` — Update JSDoc comment referencing `/api/trigger/run`

### Deleted
- `app/api/cron/scan/route.ts` — Dead code; scan now runs in-process
- `app/api/cron/scan/__tests__/route.test.ts` — Tests for dead route

### Unchanged (for reference only)
- `src/lib/triggers/scanner.ts` — `runScan()` and `ScanDependencies` interface (no changes needed)
- `src/lib/supabase/server.ts` — `createAdminClient()` (no changes needed)
- `src/lib/triggers/route-auth.ts` — `requireCronSecret()` stays; still used by `/api/trigger/run`
- `app/api/trigger/run/route.ts` — Dispatch target stays; still called as the dispatch callback

---

## Pre-Flight: Verify Existing Tests Pass

Before making any changes, confirm the baseline is green.

```bash
pnpm vitest run app/api/cron/scan/__tests__/route.test.ts src/trigger/__tests__/run-trigger-agent.test.ts src/lib/triggers/__tests__/scanner.test.ts
```

All three should pass. If they don't, fix them first — that's a separate issue.

---

### Task 1: Write Tests for the Rewritten Trigger.dev Scanner Task

**Files:**
- Create: `src/trigger/__tests__/scan-triggers.test.ts`

We write the tests BEFORE touching the implementation. These tests validate the new behavior: `scan-triggers` calls `runScan()` directly with a Supabase admin client and an HTTP dispatch callback.

**Step 1: Write the test file**

The test structure mirrors `src/trigger/__tests__/run-trigger-agent.test.ts` — mock the Trigger.dev SDK, Supabase client, scanner, and `fetch`. The key assertions:

1. `runScan` is called with a real Supabase client and a dispatch function
2. The dispatch function POSTs to `/api/trigger/run` with the correct auth header
3. Results from `runScan` are logged and returned
4. Errors from `runScan` propagate (Trigger.dev handles retries)
5. Missing env vars throw before calling `runScan`

```typescript
/**
 * Tests for the Trigger.dev scan-triggers scheduled task.
 * @module src/trigger/__tests__/scan-triggers
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { TriggerDispatchPayload } from "@/lib/triggers/schemas";

const {
  mockRunScan,
  mockCreateAdminClient,
  mockFetch,
} = vi.hoisted(() => ({
  mockRunScan: vi.fn(),
  mockCreateAdminClient: vi.fn().mockResolvedValue({ __role: "admin" }),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/triggers/scanner", () => ({
  runScan: mockRunScan,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
  schedules: {
    task: (definition: unknown) => definition,
  },
}));

const validPayload: TriggerDispatchPayload = {
  triggerId: "550e8400-e29b-41d4-a716-446655440000",
  clientId: "660e8400-e29b-41d4-a716-446655440000",
  threadId: "770e8400-e29b-41d4-a716-446655440000",
  currentRunId: "880e8400-e29b-41d4-a716-446655440000",
  triggerType: "schedule",
  triggerName: "Daily briefing",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: {},
  nextFireAt: "2026-03-07T09:00:00.000Z",
};

import { scanTriggers } from "../scan-triggers";

describe("scanTriggers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    };
    mockRunScan.mockResolvedValue({
      claimed: 0,
      dispatched: 0,
      staleReleased: 0,
      errors: [],
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("calls runScan with an admin Supabase client", async () => {
    await scanTriggers.run({} as never, { ctx: {} as never });

    expect(mockCreateAdminClient).toHaveBeenCalledOnce();
    expect(mockRunScan).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: { __role: "admin" },
      }),
    );
  });

  it("returns scan results", async () => {
    mockRunScan.mockResolvedValueOnce({
      claimed: 3,
      dispatched: 2,
      staleReleased: 1,
      errors: ["trigger-1: dispatch failed"],
    });

    const result = await scanTriggers.run({} as never, { ctx: {} as never });

    expect(result).toEqual({
      claimed: 3,
      dispatched: 2,
      staleReleased: 1,
      errors: ["trigger-1: dispatch failed"],
    });
  });

  it("dispatch callback POSTs to /api/trigger/run with CRON_SECRET", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      const result = await dispatch(validPayload);
      expect(result).toEqual({ ok: true, status: 200 });

      return { claimed: 1, dispatched: 1, staleReleased: 0, errors: [] };
    });

    await scanTriggers.run({} as never, { ctx: {} as never });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.example.com/api/trigger/run",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("dispatch callback returns error details on failure", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "claim mismatch" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      const result = await dispatch(validPayload);
      expect(result).toEqual({ ok: false, status: 409, error: "claim mismatch" });

      return { claimed: 1, dispatched: 0, staleReleased: 0, errors: ["failed"] };
    });

    await scanTriggers.run({} as never, { ctx: {} as never });
  });

  it("falls back to VERCEL_URL when NEXT_PUBLIC_APP_URL is missing", async () => {
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
      VERCEL_URL: "fallback.vercel.app",
    };
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      await dispatch(validPayload);
      return { claimed: 1, dispatched: 1, staleReleased: 0, errors: [] };
    });

    await scanTriggers.run({} as never, { ctx: {} as never });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://fallback.vercel.app/api/trigger/run",
      expect.any(Object),
    );
  });

  it("throws when no base URL is configured", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "test-secret" };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;

    await expect(
      scanTriggers.run({} as never, { ctx: {} as never }),
    ).rejects.toThrow("NEXT_PUBLIC_APP_URL or VERCEL_URL must be set");

    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("throws when CRON_SECRET is missing", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    };
    delete process.env.CRON_SECRET;

    await expect(
      scanTriggers.run({} as never, { ctx: {} as never }),
    ).rejects.toThrow("CRON_SECRET must be set");

    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("propagates runScan errors", async () => {
    mockRunScan.mockRejectedValueOnce(new Error("DB connection failed"));

    await expect(
      scanTriggers.run({} as never, { ctx: {} as never }),
    ).rejects.toThrow("DB connection failed");
  });
});
```

**Step 2: Run the tests — they should fail**

```bash
pnpm vitest run src/trigger/__tests__/scan-triggers.test.ts
```

Expected: FAIL. The current `scan-triggers.ts` doesn't import `runScan` or `createAdminClient`. The tests won't match the current HTTP-fetch implementation.

**Step 3: Commit the tests**

```bash
git add src/trigger/__tests__/scan-triggers.test.ts
git commit -m "test: add tests for inlined scan-triggers task (red)"
```

---

### Task 2: Rewrite `scan-triggers.ts` to Call `runScan()` Directly

**Files:**
- Modify: `src/trigger/scan-triggers.ts`

The dispatch callback moves from the cron route into the Trigger.dev task. The `resolveInternalBaseUrl` and `readDispatchError` helpers move here too since they're only needed by dispatch.

**Step 1: Rewrite the task**

Replace the entire file with:

```typescript
/**
 * Trigger.dev scheduled task that scans and dispatches due agent triggers.
 *
 * Calls runScan() directly — no HTTP hop to /api/cron/scan. The dispatch
 * callback still POSTs to /api/trigger/run so each trigger execution runs
 * in its own context with independent error boundaries.
 *
 * @module src/trigger/scan-triggers
 */
import { logger, schedules } from "@trigger.dev/sdk/v3";

import { createAdminClient } from "@/lib/supabase/server";
import { runScan } from "@/lib/triggers/scanner";
import type { TriggerDispatchPayload } from "@/lib/triggers/schemas";

function resolveBaseUrl(): string {
  const directBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (directBaseUrl) return directBaseUrl;

  const vercelUrl = (process.env.VERCEL_URL ?? "").trim();
  if (vercelUrl) return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;

  throw new Error("NEXT_PUBLIC_APP_URL or VERCEL_URL must be set");
}

async function readDispatchError(response: Response): Promise<string | undefined> {
  const text = (await response.text()).trim();
  if (!text) return undefined;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed.status === "string" && parsed.status.trim()) return parsed.status.trim();
  } catch {
    // Non-JSON response — fall through to raw text.
  }

  return text;
}

async function dispatchTrigger(
  baseUrl: string,
  cronSecret: string,
  payload: TriggerDispatchPayload,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const response = await fetch(`${baseUrl}/api/trigger/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) return { ok: true, status: response.status };

  return {
    ok: false,
    status: response.status,
    error: await readDispatchError(response),
  };
}

/**
 * Scans for due triggers every minute and dispatches them.
 */
export const scanTriggers = schedules.task({
  id: "scan-triggers",
  cron: "* * * * *",
  maxDuration: 60,
  run: async () => {
    const baseUrl = resolveBaseUrl();
    const cronSecret = (process.env.CRON_SECRET ?? "").trim();
    if (!cronSecret) throw new Error("CRON_SECRET must be set");

    const supabase = await createAdminClient();

    const result = await runScan({
      supabase,
      dispatch: (payload) => dispatchTrigger(baseUrl, cronSecret, payload),
    });

    logger.info("Scanner tick complete", {
      claimed: result.claimed,
      dispatched: result.dispatched,
      staleReleased: result.staleReleased,
      errors: result.errors,
    });

    return result;
  },
});
```

**Step 2: Run the new tests**

```bash
pnpm vitest run src/trigger/__tests__/scan-triggers.test.ts
```

Expected: ALL PASS.

**Step 3: Run the scanner library tests to confirm no regressions**

```bash
pnpm vitest run src/lib/triggers/__tests__/scanner.test.ts
```

Expected: ALL PASS (scanner.ts was not modified).

**Step 4: Commit**

```bash
git add src/trigger/scan-triggers.ts src/trigger/__tests__/scan-triggers.test.ts
git commit -m "feat: inline runScan() into Trigger.dev task, remove HTTP scan hop"
```

---

### Task 3: Delete the Dead `/api/cron/scan` Route

**Files:**
- Delete: `app/api/cron/scan/route.ts`
- Delete: `app/api/cron/scan/__tests__/route.test.ts`

**Step 1: Delete the route and test files**

```bash
rm app/api/cron/scan/route.ts
rm app/api/cron/scan/__tests__/route.test.ts
```

**Step 2: Remove the empty directories if nothing else is in them**

```bash
# Check if the cron/scan directory is now empty
ls app/api/cron/scan/
# If empty:
rmdir app/api/cron/scan/__tests__
rmdir app/api/cron/scan
# Check if app/api/cron/ is now empty
ls app/api/cron/
# If empty:
rmdir app/api/cron
```

**Step 3: Verify no import references remain in source code**

Search for any remaining imports of the deleted route:

```bash
rg "api/cron/scan" --type ts -l
```

Expected: no `.ts` source files reference it (only docs/plans may mention it historically — that's fine).

**Step 4: Run the full trigger test suite to confirm nothing broke**

```bash
pnpm vitest run src/trigger/ src/lib/triggers/ app/api/trigger/
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add -u app/api/cron/
git commit -m "chore: delete dead /api/cron/scan route (replaced by inline Trigger.dev scan)"
```

---

### Task 4: Clean Up References

**Files:**
- Modify: `src/lib/triggers/schemas.ts:40` — Update JSDoc comment

**Step 1: Update the JSDoc on `triggerDispatchPayloadSchema`**

In `src/lib/triggers/schemas.ts`, line 40 says:

```typescript
/** Payload sent from the scanner to `/api/trigger/run`. */
```

Update to:

```typescript
/** Payload sent from the scan-triggers task to `/api/trigger/run` for dispatch. */
```

**Step 2: Verify no other source files import from the deleted route**

```bash
rg "from.*api/cron/scan" --type ts
```

Expected: no results.

**Step 3: Verify `route-auth.ts` is still used**

```bash
rg "requireCronSecret" --type ts -l
```

Expected: `app/api/trigger/run/route.ts` and `src/lib/triggers/route-auth.ts` only. The scan route is gone.

**Step 4: Run the full test suite**

```bash
pnpm vitest run
```

Expected: ALL PASS. No test file should be broken by the removal.

**Step 5: Commit**

```bash
git add src/lib/triggers/schemas.ts
git commit -m "chore: update JSDoc references after cron scan route removal"
```

---

## Final Verification

After all tasks are complete, verify the architecture is correct:

```
Trigger.dev (every 1 min)
  → runScan() in-process
    → claim_due_triggers() RPC
    → For each claimed trigger:
        POST /api/trigger/run (CRON_SECRET auth)
          → executeTrigger()
            → spawnTriggerRun()
              → triggers runTriggerAgent task
```

Confirm:
1. `app/api/cron/` directory no longer exists
2. `scan-triggers.ts` imports `runScan` and `createAdminClient` directly
3. All tests pass: `pnpm vitest run`
4. The dispatch to `/api/trigger/run` still works (it's the only remaining HTTP hop)

---

## What NOT To Touch

- `app/api/trigger/run/route.ts` — Still the dispatch target. Stays.
- `src/lib/triggers/route-auth.ts` — Still used by `/api/trigger/run`. Stays.
- `src/lib/triggers/scanner.ts` — Business logic unchanged. Stays.
- `app/api/automations/[triggerId]/run/route.ts` — Manual run endpoint. Unrelated.
- `trigger.config.ts` — No changes needed. `dirs: ["./src/trigger"]` already includes the task.
- Docs/plans — Historical references to `/api/cron/scan` are fine. Don't rewrite history.
