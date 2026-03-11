# Message Usage Caps + Quota UX Implementation Plan

**PR:** PR 38c: Message usage caps + quota UX  
**Decisions:** FOUND-07, LLM-10, DATA-09, GAP-07  
**Goal:** Enforce monthly chat-message caps by plan, block new sends at the cap, and show remaining usage in pricing, settings, and chat.

**Architecture:** `clients.plan_name` remains the source of truth for which quota applies (`FOUND-07`). Quota state lives in Supabase as a monthly aggregate table plus two RPC functions (`get_message_quota_status`, `consume_message_quota`) instead of Stripe metered billing or `COUNT(*)` scans over `conversation_messages` (`DATA-09`). Keep token/run telemetry separate in `usage_telemetry` and `runs` (`LLM-10`); the message cap is customer-facing packaging, not the only internal cost control (`GAP-07`).

**Tech Stack:** Next.js 15 App Router, Supabase Postgres + RPC, Supabase JS, TanStack Query, Zod, Vitest, React Testing Library

## Assumptions

- Free: `100` messages / month
- Pro: `500` messages / month
- Max: `2,000` messages / month
- Billable unit: one brand-new user-authored inbound chat turn
- Do not count: assistant replies, tool calls, approval continuations, queued replays, pulse runs, cron runs
- Reset boundary: calendar month in `Asia/Singapore`

## Reference Docs

- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` — PR 38b + PR 38c scope
- `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` — `FOUND-07`, `LLM-10`, `DATA-09`, `GAP-07`
- `src/lib/stripe/plans.ts` — existing plan catalog to extend
- `app/api/chat/route.ts` — exact server enforcement point
- `supabase/migrations/__tests__/approval-events-migration.test.ts` — migration contract-test pattern
- `src/lib/ai/__tests__/chat-route.test.ts` — chat route mocking pattern

## Relevant Files

| File | Action |
|---|---|
| `src/lib/stripe/plans.ts` | Modify: add per-plan monthly message limits + helper |
| `src/lib/stripe/plans.test.ts` | Create: plan-limit contract tests |
| `supabase/migrations/20260311010000_create_message_quota.sql` | Create: monthly quota table + RPCs |
| `supabase/migrations/__tests__/message-quota-migration.test.ts` | Create: migration contract tests |
| `src/types/database.ts` | Modify: regenerate after migration |
| `src/lib/usage/message-quota.ts` | Create: typed RPC helpers + reset-date formatter |
| `src/lib/usage/message-quota.test.ts` | Create: helper tests |
| `app/api/chat/route.ts` | Modify: consume quota before `runAgent()` |
| `src/lib/ai/__tests__/chat-route.test.ts` | Modify: quota enforcement tests |
| `app/(dashboard)/pricing/page.tsx` | Modify: display caps and usage copy |
| `app/(dashboard)/pricing/page.test.tsx` | Modify: pricing UI tests |
| `app/(dashboard)/settings/page.tsx` | Modify: display used/remaining/reset |
| `app/(dashboard)/settings/page.test.tsx` | Modify: settings UI tests |
| `src/hooks/use-message-quota.ts` | Create: client-side TanStack Query hook |
| `src/components/chat/chat-panel.tsx` | Modify: wire quota into chat UI + invalidate quota query on finish |
| `src/components/chat/chat-panel.test.tsx` | Modify: quota wiring tests |
| `src/components/chat/chat-composer.tsx` | Modify: lock composer at zero remaining + show upgrade CTA |
| `src/components/chat/chat-composer.test.tsx` | Modify: quota lock tests |
| `src/components/chat/chat-welcome.tsx` | Modify: show quota summary in empty state |
| `docs/product/designs/stripe-billing-integration.md` | Modify: add usage-cap behavior |
| `docs/product/handovers/stripe-billing-handover.md` | Modify: add implementation notes for quota rules |

## Implementation Rules

1. Use `@test-driven-development` on every behavior change.
2. Use `pnpm`, not `npm`.
3. Every new file starts with a one-line file-level JSDoc header.
4. Do not implement quota by scanning `conversation_messages`. Use the dedicated monthly aggregate table and RPCs.
5. Do not count approval-continuation requests. Only count requests where `body.message?.role === "user"`.
6. Stage only touched files. Never use `git add -A` in this repo.
7. Keep the code boring. Small helpers. No new abstractions unless reused at least twice.

---

## Task 1: Extend the plan catalog with explicit message-cap constants

**Files:**
- Modify: `src/lib/stripe/plans.ts`
- Create: `src/lib/stripe/plans.test.ts`

### Step 1: Write the failing test

Create `src/lib/stripe/plans.test.ts`:

```typescript
/**
 * Tests for billing plan quota constants.
 * @module lib/stripe/plans.test
 */
import { describe, expect, it } from "vitest";

import {
  billingPlanCatalog,
  getBillingPlanMessageLimit,
} from "./plans";

describe("billing plan message limits", () => {
  it("defines explicit monthly limits for every plan", () => {
    expect(billingPlanCatalog.Free.monthlyMessageLimit).toBe(100);
    expect(billingPlanCatalog.Pro.monthlyMessageLimit).toBe(500);
    expect(billingPlanCatalog.Max.monthlyMessageLimit).toBe(2000);
  });

  it("falls back to the free limit for unknown plan names", () => {
    expect(getBillingPlanMessageLimit(null)).toBe(100);
    expect(getBillingPlanMessageLimit(undefined)).toBe(100);
    expect(getBillingPlanMessageLimit("Starter")).toBe(100);
  });
});
```

### Step 2: Run the test to verify it fails

Run:

```bash
pnpm exec vitest run src/lib/stripe/plans.test.ts
```

Expected: FAIL because `monthlyMessageLimit` and `getBillingPlanMessageLimit()` do not exist yet.

### Step 3: Write the minimal implementation

In `src/lib/stripe/plans.ts`:

```typescript
export interface BillingPlanDefinition {
  name: BillingPlanName;
  monthlyPriceSgd: number;
  trialDays: number;
  isFree: boolean;
  summary: string;
  highlights: string[];
  monthlyMessageLimit: number;
}

export function getBillingPlanMessageLimit(
  planName: string | null | undefined,
): number {
  if (planName && planName in billingPlanCatalog) {
    return billingPlanCatalog[planName as BillingPlanName].monthlyMessageLimit;
  }

  return billingPlanCatalog.Free.monthlyMessageLimit;
}
```

Use these values:

```typescript
Free: { monthlyMessageLimit: 100, ... }
Pro: { monthlyMessageLimit: 500, ... }
Max: { monthlyMessageLimit: 2000, ... }
```

Do not add a separate config system yet. The catalog is already the single place where product plan constants live.

### Step 4: Run the test again

Run:

```bash
pnpm exec vitest run src/lib/stripe/plans.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/stripe/plans.ts src/lib/stripe/plans.test.ts
git commit -m "feat(pr38c): add plan quota constants"
```

---

## Task 2: Add the quota table and RPCs in Supabase

**Files:**
- Create: `supabase/migrations/20260311010000_create_message_quota.sql`
- Create: `supabase/migrations/__tests__/message-quota-migration.test.ts`
- Modify: `src/types/database.ts`

### Step 1: Write the failing migration contract test

Create `supabase/migrations/__tests__/message-quota-migration.test.ts`:

```typescript
/**
 * Contract tests for the PR38c message quota migration.
 * @module supabase/migrations/__tests__/message-quota-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260311010000_create_message_quota.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("PR38c message quota migration", () => {
  it("creates the monthly usage table with the expected key and counters", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE TABLE public.client_message_usage_monthly");
    expect(sql).toContain("client_id uuid NOT NULL REFERENCES public.clients(client_id)");
    expect(sql).toContain("period_start date NOT NULL");
    expect(sql).toContain("messages_used integer NOT NULL DEFAULT 0");
    expect(sql).toContain("CHECK (messages_used >= 0)");
    expect(sql).toContain("PRIMARY KEY (client_id, period_start)");
  });

  it("uses the Singapore month boundary and explicit plan limits", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("timezone('Asia/Singapore', now())");
    expect(sql).toContain("WHEN 'Pro' THEN 500");
    expect(sql).toContain("WHEN 'Max' THEN 2000");
    expect(sql).toContain("ELSE 100");
  });

  it("creates quota read and consume RPCs with the project auth guard", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_message_quota_status");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.consume_message_quota");
    expect(sql).toContain("auth.role() = 'service_role'");
    expect(sql).toContain("OR p_client_id = public.get_my_client_id()");
    expect(sql).toContain("messages_remaining");
    expect(sql).toContain("quota_reached");
    expect(sql).toContain("allowed boolean");
  });
});
```

### Step 2: Run the test to verify it fails

Run:

```bash
pnpm exec vitest run supabase/migrations/__tests__/message-quota-migration.test.ts
```

Expected: FAIL because the migration file does not exist yet.

### Step 3: Write the migration SQL

Create `supabase/migrations/20260311010000_create_message_quota.sql` with this exact shape:

```sql
-- PR38c: monthly message quota accounting and enforcement.

CREATE TABLE public.client_message_usage_monthly (
  client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  period_start date NOT NULL,
  messages_used integer NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, period_start)
);

ALTER TABLE public.client_message_usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_message_usage_monthly_select"
  ON public.client_message_usage_monthly FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY "client_message_usage_monthly_insert"
  ON public.client_message_usage_monthly FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  );

CREATE POLICY "client_message_usage_monthly_update"
  ON public.client_message_usage_monthly FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  );

CREATE OR REPLACE FUNCTION public.update_client_message_usage_monthly_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_client_message_usage_monthly_updated_at
  BEFORE UPDATE ON public.client_message_usage_monthly
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_message_usage_monthly_updated_at();

CREATE OR REPLACE FUNCTION public.get_monthly_message_limit(p_plan_name text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(p_plan_name, 'Free')
    WHEN 'Pro' THEN 500
    WHEN 'Max' THEN 2000
    ELSE 100
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_message_quota_status(p_client_id uuid)
RETURNS TABLE (
  client_id uuid,
  plan_name text,
  monthly_message_limit integer,
  messages_used integer,
  messages_remaining integer,
  quota_reached boolean,
  period_start date,
  period_end date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date := date_trunc('month', timezone('Asia/Singapore', now()))::date;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR p_client_id = public.get_my_client_id()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH client_plan AS (
    SELECT
      c.client_id,
      coalesce(c.plan_name, 'Free') AS plan_name,
      public.get_monthly_message_limit(c.plan_name) AS monthly_message_limit
    FROM public.clients AS c
    WHERE c.client_id = p_client_id
  ),
  usage_row AS (
    SELECT
      u.client_id,
      u.messages_used
    FROM public.client_message_usage_monthly AS u
    WHERE u.client_id = p_client_id
      AND u.period_start = v_period_start
  )
  SELECT
    cp.client_id,
    cp.plan_name,
    cp.monthly_message_limit,
    coalesce(ur.messages_used, 0) AS messages_used,
    greatest(cp.monthly_message_limit - coalesce(ur.messages_used, 0), 0) AS messages_remaining,
    coalesce(ur.messages_used, 0) >= cp.monthly_message_limit AS quota_reached,
    v_period_start AS period_start,
    (v_period_start + INTERVAL '1 month')::date AS period_end
  FROM client_plan AS cp
  LEFT JOIN usage_row AS ur ON ur.client_id = cp.client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_message_quota(p_client_id uuid)
RETURNS TABLE (
  allowed boolean,
  client_id uuid,
  plan_name text,
  monthly_message_limit integer,
  messages_used integer,
  messages_remaining integer,
  quota_reached boolean,
  period_start date,
  period_end date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date := date_trunc('month', timezone('Asia/Singapore', now()))::date;
  v_limit integer;
  v_consumed boolean := false;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR p_client_id = public.get_my_client_id()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT public.get_monthly_message_limit(c.plan_name)
  INTO v_limit
  FROM public.clients AS c
  WHERE c.client_id = p_client_id;

  INSERT INTO public.client_message_usage_monthly AS usage (
    client_id,
    period_start,
    messages_used
  )
  VALUES (p_client_id, v_period_start, 1)
  ON CONFLICT (client_id, period_start)
  DO UPDATE
    SET messages_used = usage.messages_used + 1
    WHERE usage.messages_used < v_limit
  RETURNING true INTO v_consumed;

  RETURN QUERY
  SELECT
    coalesce(v_consumed, false) AS allowed,
    quota.client_id,
    quota.plan_name,
    quota.monthly_message_limit,
    quota.messages_used,
    quota.messages_remaining,
    quota.quota_reached,
    quota.period_start,
    quota.period_end
  FROM public.get_message_quota_status(p_client_id) AS quota;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_message_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_quota_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_message_quota(uuid) TO authenticated;
```

### Step 4: Apply the migration and regenerate types

Run:

```bash
pnpm supabase db push
pnpm supabase gen types typescript --local > src/types/database.ts
```

Verify that `client_message_usage_monthly`, `get_message_quota_status`, and `consume_message_quota` appear in `src/types/database.ts`.

### Step 5: Run the migration contract test again

Run:

```bash
pnpm exec vitest run supabase/migrations/__tests__/message-quota-migration.test.ts
```

Expected: PASS

### Step 6: Commit

```bash
git add supabase/migrations/20260311010000_create_message_quota.sql supabase/migrations/__tests__/message-quota-migration.test.ts src/types/database.ts
git commit -m "feat(pr38c): add message quota migration"
```

---

## Task 3: Add typed quota helpers for Supabase RPC calls

**Files:**
- Create: `src/lib/usage/message-quota.ts`
- Create: `src/lib/usage/message-quota.test.ts`

### Step 1: Write the failing tests

Create `src/lib/usage/message-quota.test.ts`:

```typescript
/**
 * Tests for message quota helpers.
 * @module lib/usage/message-quota.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeMessageQuota,
  formatQuotaResetDate,
  getMessageQuotaStatus,
} from "./message-quota";

function createMockSupabaseRpc(result: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn(async () => result),
  } as never;
}

describe("message quota helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the current quota status from get_message_quota_status", async () => {
    const supabase = createMockSupabaseRpc({
      data: [{
        client_id: "770e8400-e29b-41d4-a716-446655440000",
        plan_name: "Free",
        monthly_message_limit: 100,
        messages_used: 12,
        messages_remaining: 88,
        quota_reached: false,
        period_start: "2026-03-01",
        period_end: "2026-04-01",
      }],
      error: null,
    });

    const result = await getMessageQuotaStatus(
      supabase,
      "770e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toEqual({
      clientId: "770e8400-e29b-41d4-a716-446655440000",
      planName: "Free",
      monthlyMessageLimit: 100,
      messagesUsed: 12,
      messagesRemaining: 88,
      quotaReached: false,
      periodStart: "2026-03-01",
      periodEnd: "2026-04-01",
    });
  });

  it("returns the allowed flag from consume_message_quota", async () => {
    const supabase = createMockSupabaseRpc({
      data: [{
        allowed: false,
        client_id: "770e8400-e29b-41d4-a716-446655440000",
        plan_name: "Free",
        monthly_message_limit: 100,
        messages_used: 100,
        messages_remaining: 0,
        quota_reached: true,
        period_start: "2026-03-01",
        period_end: "2026-04-01",
      }],
      error: null,
    });

    const result = await consumeMessageQuota(
      supabase,
      "770e8400-e29b-41d4-a716-446655440000",
    );

    expect(result.allowed).toBe(false);
    expect(result.messagesRemaining).toBe(0);
    expect(result.quotaReached).toBe(true);
  });

  it("throws a useful error when the RPC fails", async () => {
    const supabase = createMockSupabaseRpc({
      data: null,
      error: { message: "boom" },
    });

    await expect(
      getMessageQuotaStatus(supabase, "770e8400-e29b-41d4-a716-446655440000"),
    ).rejects.toThrow("Failed to load message quota: boom");
  });

  it("formats the reset date for UI copy", () => {
    expect(formatQuotaResetDate("2026-04-01")).toBe("1 Apr");
  });
});
```

### Step 2: Run the test to verify it fails

Run:

```bash
pnpm exec vitest run src/lib/usage/message-quota.test.ts
```

Expected: FAIL because the helper module does not exist yet.

### Step 3: Write the minimal implementation

Create `src/lib/usage/message-quota.ts` with this shape:

```typescript
/**
 * Typed helpers for the monthly message quota RPCs.
 * @module lib/usage/message-quota
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type AppSupabaseClient = SupabaseClient<Database>;

const quotaStatusSchema = z.object({
  client_id: z.string().uuid(),
  plan_name: z.string(),
  monthly_message_limit: z.number().int().nonnegative(),
  messages_used: z.number().int().nonnegative(),
  messages_remaining: z.number().int().nonnegative(),
  quota_reached: z.boolean(),
  period_start: z.string(),
  period_end: z.string(),
});

const consumedQuotaSchema = quotaStatusSchema.extend({
  allowed: z.boolean(),
});

export interface MessageQuotaStatus {
  clientId: string;
  planName: string;
  monthlyMessageLimit: number;
  messagesUsed: number;
  messagesRemaining: number;
  quotaReached: boolean;
  periodStart: string;
  periodEnd: string;
}

export interface ConsumedMessageQuota extends MessageQuotaStatus {
  allowed: boolean;
}

function mapQuotaStatus(
  row: z.infer<typeof quotaStatusSchema>,
): MessageQuotaStatus {
  return {
    clientId: row.client_id,
    planName: row.plan_name,
    monthlyMessageLimit: row.monthly_message_limit,
    messagesUsed: row.messages_used,
    messagesRemaining: row.messages_remaining,
    quotaReached: row.quota_reached,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  };
}

export async function getMessageQuotaStatus(
  supabase: AppSupabaseClient,
  clientId: string,
): Promise<MessageQuotaStatus> {
  const { data, error } = await supabase.rpc("get_message_quota_status", {
    p_client_id: clientId,
  });

  if (error) {
    throw new Error(`Failed to load message quota: ${error.message}`);
  }

  const row = quotaStatusSchema.parse(Array.isArray(data) ? data[0] : data);
  return mapQuotaStatus(row);
}

export async function consumeMessageQuota(
  supabase: AppSupabaseClient,
  clientId: string,
): Promise<ConsumedMessageQuota> {
  const { data, error } = await supabase.rpc("consume_message_quota", {
    p_client_id: clientId,
  });

  if (error) {
    throw new Error(`Failed to consume message quota: ${error.message}`);
  }

  const row = consumedQuotaSchema.parse(Array.isArray(data) ? data[0] : data);

  return {
    allowed: row.allowed,
    ...mapQuotaStatus(row),
  };
}

export function formatQuotaResetDate(periodEnd: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(periodEnd));
}
```

Keep the helper small. No class. No generic wrapper around `rpc()`.

### Step 4: Run the tests again

Run:

```bash
pnpm exec vitest run src/lib/usage/message-quota.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/usage/message-quota.ts src/lib/usage/message-quota.test.ts
git commit -m "feat(pr38c): add quota rpc helpers"
```

---

## Task 4: Enforce quota in the chat route before runner execution

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`

### Step 1: Write the failing route tests

In `src/lib/ai/__tests__/chat-route.test.ts`, add a new hoisted mock:

```typescript
const {
  mockConsumeMessageQuota,
} = vi.hoisted(() => ({
  mockConsumeMessageQuota: vi.fn(),
}));

vi.mock("@/lib/usage/message-quota", () => ({
  consumeMessageQuota: (...args: unknown[]) => mockConsumeMessageQuota(...args),
}));
```

In `beforeEach()`:

```typescript
mockConsumeMessageQuota.mockResolvedValue({
  allowed: true,
  clientId: "client-456",
  planName: "Free",
  monthlyMessageLimit: 100,
  messagesUsed: 1,
  messagesRemaining: 99,
  quotaReached: false,
  periodStart: "2026-03-01",
  periodEnd: "2026-04-01",
});
```

Add these tests:

```typescript
it("consumes quota for a brand-new user-authored message", async () => {
  mockRunAgent.mockResolvedValue({
    status: "queued",
  });

  const response = await POST(createJsonRequest({
    id: threadId,
    message: {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    },
  }));

  expect(mockConsumeMessageQuota).toHaveBeenCalledWith(mockSupabase, "client-456");
  expect(response.status).toBe(202);
});

it("does not consume quota for approval continuation payloads", async () => {
  mockResolveApprovalEvent.mockResolvedValue({
    success: true,
    status: "updated",
    event: { tool_name: "send_email" },
  });
  mockRunAgent.mockResolvedValue({
    status: "queued",
  });

  await POST(createJsonRequest({
    id: threadId,
    messages: [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-send_email",
            state: "approval-responded",
            approval: { id: "approval-1", approved: true },
          },
        ],
      },
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Proceed." }],
      },
    ],
  }));

  expect(mockConsumeMessageQuota).not.toHaveBeenCalled();
});

it("returns 402 and skips runAgent when quota is exhausted", async () => {
  mockConsumeMessageQuota.mockResolvedValueOnce({
    allowed: false,
    clientId: "client-456",
    planName: "Free",
    monthlyMessageLimit: 100,
    messagesUsed: 100,
    messagesRemaining: 0,
    quotaReached: true,
    periodStart: "2026-03-01",
    periodEnd: "2026-04-01",
  });

  const response = await POST(createJsonRequest({
    id: threadId,
    message: {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "Another message" }],
    },
  }));

  expect(mockRunAgent).not.toHaveBeenCalled();
  expect(response.status).toBe(402);
  await expect(response.json()).resolves.toMatchObject({
    error: "Monthly message limit reached.",
    quota: {
      messagesRemaining: 0,
      quotaReached: true,
    },
  });
});
```

### Step 2: Run the route test to verify it fails

Run:

```bash
pnpm exec vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: FAIL because the route does not import or call `consumeMessageQuota()` yet.

### Step 3: Write the minimal implementation

In `app/api/chat/route.ts`:

1. Import the helper:

```typescript
import { consumeMessageQuota } from "@/lib/usage/message-quota";
```

2. After thread creation / lookup and before `runAgent()`:

```typescript
if (body.message?.role === "user") {
  const quota = await consumeMessageQuota(supabase, clientId);

  if (!quota.allowed) {
    return Response.json(
      {
        error: "Monthly message limit reached.",
        quota,
      },
      { status: 402 },
    );
  }
}
```

Important:

- Do not consume quota for `body.messages` approval-continuation payloads.
- Do not move quota accounting into `runAgent()`. The route is the right choke point for user-authored inbound turns.
- Keep the existing `try/catch` so unexpected RPC failures still become the generic 500 response.

### Step 4: Run the route test again

Run:

```bash
pnpm exec vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add app/api/chat/route.ts src/lib/ai/__tests__/chat-route.test.ts
git commit -m "feat(pr38c): enforce message quota in chat route"
```

---

## Task 5: Show caps and current usage in pricing and settings

**Files:**
- Modify: `app/(dashboard)/pricing/page.tsx`
- Modify: `app/(dashboard)/pricing/page.test.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`
- Modify: `app/(dashboard)/settings/page.test.tsx`
- Modify: `src/lib/usage/message-quota.ts`

### Step 1: Write the failing pricing/settings tests

In `app/(dashboard)/pricing/page.test.tsx`, add:

```typescript
const { mockLoadCurrentMessageQuota } = vi.hoisted(() => ({
  mockLoadCurrentMessageQuota: vi.fn(),
}));

vi.mock("@/lib/usage/message-quota", () => ({
  loadCurrentMessageQuota: (...args: unknown[]) => mockLoadCurrentMessageQuota(...args),
  formatQuotaResetDate: () => "1 Apr",
}));
```

Return this in `beforeEach()`:

```typescript
mockLoadCurrentMessageQuota.mockResolvedValue({
  clientId: "client-1",
  planName: "Free",
  monthlyMessageLimit: 100,
  messagesUsed: 12,
  messagesRemaining: 88,
  quotaReached: false,
  periodStart: "2026-03-01",
  periodEnd: "2026-04-01",
});
```

Add assertions:

```typescript
expect(screen.getByText("100 messages / month")).toBeInTheDocument();
expect(screen.getByText("500 messages / month")).toBeInTheDocument();
expect(screen.getByText("2,000 messages / month")).toBeInTheDocument();
```

In `app/(dashboard)/settings/page.test.tsx`, mock the same helper and add:

```typescript
expect(screen.getByText("12 used this month")).toBeInTheDocument();
expect(screen.getByText("88 remaining")).toBeInTheDocument();
expect(screen.getByText("Resets 1 Apr")).toBeInTheDocument();
```

### Step 2: Run the page tests to verify they fail

Run:

```bash
pnpm exec vitest run 'app/(dashboard)/pricing/page.test.tsx' 'app/(dashboard)/settings/page.test.tsx'
```

Expected: FAIL because neither page loads or renders quota information yet.

### Step 3: Add the server-side quota read and UI

In `src/lib/usage/message-quota.ts`, add a tiny server helper:

```typescript
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

export async function loadCurrentMessageQuota(): Promise<MessageQuotaStatus> {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  return getMessageQuotaStatus(supabase, clientId);
}
```

In `app/(dashboard)/pricing/page.tsx`:

```typescript
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota";

const quota = await loadCurrentMessageQuota();
```

Render a quota line in each plan card:

```tsx
<p className="mt-2 text-sm font-medium text-foreground/80">
  {planDefinition.monthlyMessageLimit.toLocaleString()} messages / month
</p>
```

Add a small summary above the cards:

```tsx
<p className="text-sm text-muted-foreground">
  This month: {quota.messagesUsed} used, {quota.messagesRemaining} remaining.
</p>
```

In `app/(dashboard)/settings/page.tsx`:

```typescript
import {
  formatQuotaResetDate,
  loadCurrentMessageQuota,
} from "@/lib/usage/message-quota";

const quota = await loadCurrentMessageQuota();
```

Add a usage block in the billing card or a sibling card:

```tsx
<div className="grid gap-3 rounded-xl border border-border/60 bg-background/80 p-4 sm:grid-cols-3">
  <div>
    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
      Used this month
    </p>
    <p className="font-medium text-foreground">
      {quota.messagesUsed} used this month
    </p>
  </div>
  <div>
    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
      Remaining
    </p>
    <p className="font-medium text-foreground">
      {quota.messagesRemaining} remaining
    </p>
  </div>
  <div>
    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
      Reset
    </p>
    <p className="font-medium text-foreground">
      Resets {formatQuotaResetDate(quota.periodEnd)}
    </p>
  </div>
</div>
```

### Step 4: Run the page tests again

Run:

```bash
pnpm exec vitest run 'app/(dashboard)/pricing/page.test.tsx' 'app/(dashboard)/settings/page.test.tsx'
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/usage/message-quota.ts 'app/(dashboard)/pricing/page.tsx' 'app/(dashboard)/pricing/page.test.tsx' 'app/(dashboard)/settings/page.tsx' 'app/(dashboard)/settings/page.test.tsx'
git commit -m "feat(pr38c): show quota in billing surfaces"
```

---

## Task 6: Add chat-side quota UX and lock the composer at zero remaining

**Files:**
- Create: `src/hooks/use-message-quota.ts`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `src/components/chat/chat-panel.test.tsx`
- Modify: `src/components/chat/chat-composer.tsx`
- Modify: `src/components/chat/chat-composer.test.tsx`
- Modify: `src/components/chat/chat-welcome.tsx`

### Step 1: Write the failing chat UI tests

In `src/components/chat/chat-panel.test.tsx`, add a hook mock:

```typescript
const { mockUseMessageQuota } = vi.hoisted(() => ({
  mockUseMessageQuota: vi.fn(),
}));

vi.mock("@/hooks/use-message-quota", () => ({
  useMessageQuota: () => mockUseMessageQuota(),
  messageQuotaKeys: {
    all: ["message-quota"],
    byClient: (clientId: string) => ["message-quota", clientId],
  },
}));
```

In `beforeEach()`:

```typescript
mockUseMessageQuota.mockReturnValue({
  data: {
    clientId: "client-1",
    planName: "Free",
    monthlyMessageLimit: 100,
    messagesUsed: 100,
    messagesRemaining: 0,
    quotaReached: true,
    periodStart: "2026-03-01",
    periodEnd: "2026-04-01",
  },
});
```

Add:

```typescript
it("renders the quota summary and upgrade link when the cap is reached", () => {
  render(<ChatPanel chatId="thread-1" />);

  expect(screen.getByText(/100 \/ 100 used this month/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /view plans/i })).toHaveAttribute("href", "/pricing");
});

it("invalidates the quota query when a run finishes", () => {
  render(<ChatPanel chatId="thread-1" />);

  const options = mockUseChat.mock.calls[0][0] as {
    onFinish: () => void;
  };

  options.onFinish();

  expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: threadKeys.all });
  expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["message-quota"] });
});
```

In `src/components/chat/chat-composer.test.tsx`, add:

```typescript
it("locks the composer and shows upgrade guidance when quota is exhausted", () => {
  render(
    <ChatComposer
      {...baseProps}
      quota={{
        clientId: "client-1",
        planName: "Free",
        monthlyMessageLimit: 100,
        messagesUsed: 100,
        messagesRemaining: 0,
        quotaReached: true,
        periodStart: "2026-03-01",
        periodEnd: "2026-04-01",
      }}
    />,
  );

  expect(screen.getByText("100 / 100 used this month")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /view plans/i })).toHaveAttribute("href", "/pricing");
  expect(screen.getByPlaceholderText(/monthly message limit reached/i)).toBeDisabled();
  expect(screen.getByRole("button", { name: /attach files/i })).toBeDisabled();
});
```

### Step 2: Run the chat tests to verify they fail

Run:

```bash
pnpm exec vitest run src/components/chat/chat-panel.test.tsx src/components/chat/chat-composer.test.tsx
```

Expected: FAIL because there is no quota hook, no quota props, and no lock-state UI.

### Step 3: Implement the client hook and wire it into chat

Create `src/hooks/use-message-quota.ts`:

```typescript
/**
 * TanStack Query hook for the current client's message quota.
 * @module hooks/use-message-quota
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { getMessageQuotaStatus } from "@/lib/usage/message-quota";
import { supabase } from "@/lib/supabase";

export const messageQuotaKeys = {
  all: ["message-quota"] as const,
  byClient: (clientId: string) => ["message-quota", clientId] as const,
};

export function useMessageQuota() {
  const { data: clientId, isLoading } = useClientId();

  return useQuery({
    queryKey: messageQuotaKeys.byClient(clientId ?? "anonymous"),
    queryFn: () => getMessageQuotaStatus(supabase, clientId as string),
    enabled: !isLoading && Boolean(clientId),
    staleTime: 30_000,
  });
}
```

In `src/components/chat/chat-panel.tsx`:

```typescript
import { messageQuotaKeys, useMessageQuota } from "@/hooks/use-message-quota";

const { data: quota } = useMessageQuota();
```

Update `onFinish`:

```typescript
onFinish: () => {
  queryClient.invalidateQueries({ queryKey: threadKeys.all });
  queryClient.invalidateQueries({ queryKey: messageQuotaKeys.all });
},
```

Pass quota into both states:

```tsx
<ChatComposer
  status={status}
  value={composerValue}
  onValueChange={setComposerValue}
  onSubmit={handleSubmit}
  onStop={stop}
  quota={quota ?? null}
/>
```

```tsx
<ChatWelcome
  status={status}
  composerValue={composerValue}
  onComposerValueChange={setComposerValue}
  onSubmit={handleSubmit}
  onStop={stop}
  quota={quota ?? null}
/>
```

In `src/components/chat/chat-composer.tsx`:

```typescript
import Link from "next/link";
import type { MessageQuotaStatus } from "@/lib/usage/message-quota";

interface ChatComposerProps {
  ...
  quota?: MessageQuotaStatus | null;
}
```

Add the lock-state logic:

```typescript
const isQuotaReached = quota?.quotaReached ?? false;
const isInputLocked = isQuotaReached && !isGenerating;
const isSubmitDisabled =
  isInputLocked ||
  uploadQueue.length > 0 ||
  (!isGenerating && !hasContent);
```

Use it in the controls:

```tsx
{quota ? (
  <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
    <span>
      {quota.messagesUsed} / {quota.monthlyMessageLimit} used this month
    </span>
    <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/pricing">
      View plans
    </Link>
  </div>
) : null}
```

```tsx
<PromptInputTextarea
  placeholder={isInputLocked ? "Monthly message limit reached" : placeholder ?? "Send a message..."}
  value={value}
  onChange={handleChange}
  onPaste={handlePaste}
  disabled={isGenerating || isInputLocked}
/>
```

```tsx
<PromptInputButton
  aria-label="Attach files"
  disabled={isGenerating || isInputLocked}
  ...
/>
```

In `src/components/chat/chat-welcome.tsx`, add a `quota` prop and show a small summary line above the composer:

```tsx
{quota ? (
  <p className="text-center text-sm text-muted-foreground">
    {quota.messagesRemaining > 0
      ? `${quota.messagesRemaining} messages remaining this month`
      : `You have used all ${quota.monthlyMessageLimit.toLocaleString()} messages for this month. Upgrade to continue.`}
  </p>
) : null}
```

### Step 4: Run the chat tests again

Run:

```bash
pnpm exec vitest run src/components/chat/chat-panel.test.tsx src/components/chat/chat-composer.test.tsx
```

Expected: PASS

### Step 5: Commit

```bash
git add src/hooks/use-message-quota.ts src/components/chat/chat-panel.tsx src/components/chat/chat-panel.test.tsx src/components/chat/chat-composer.tsx src/components/chat/chat-composer.test.tsx src/components/chat/chat-welcome.tsx
git commit -m "feat(pr38c): add chat quota ux"
```

---

## Task 7: Document the quota rules and run the full verification pass

**Files:**
- Modify: `docs/product/designs/stripe-billing-integration.md`
- Modify: `docs/product/handovers/stripe-billing-handover.md`

### Step 1: Update the docs with the exact quota contract

Add these rules to both docs:

- Free = `100` messages / month
- Pro = `500` messages / month
- Max = `2,000` messages / month
- What counts: only brand-new user-authored inbound chat turns
- What does not count: assistant replies, approval continuations, tool calls, queue replays, pulse runs, cron runs
- Reset cadence: `Asia/Singapore` calendar month
- Enforcement point: `app/api/chat/route.ts`
- UI surfaces: `/pricing`, `/settings`, chat composer / empty state

Keep the billing docs explicit. A future engineer should not need to reverse-engineer quota behavior from the SQL function.

### Step 2: Run the focused test suite

Run:

```bash
pnpm exec vitest run \
  src/lib/stripe/plans.test.ts \
  supabase/migrations/__tests__/message-quota-migration.test.ts \
  src/lib/usage/message-quota.test.ts \
  src/lib/ai/__tests__/chat-route.test.ts \
  src/components/chat/chat-panel.test.tsx \
  src/components/chat/chat-composer.test.tsx \
  'app/(dashboard)/pricing/page.test.tsx' \
  'app/(dashboard)/settings/page.test.tsx'
```

Expected: PASS

### Step 3: Run TypeScript

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS

### Step 4: Manual smoke test locally

Use one free workspace and one paid workspace.

Free-user smoke test:

1. Seed the month row to `99` used:

```sql
insert into public.client_message_usage_monthly (client_id, period_start, messages_used)
values (
  '<client-id>',
  date_trunc('month', timezone('Asia/Singapore', now()))::date,
  99
)
on conflict (client_id, period_start)
do update set messages_used = excluded.messages_used;
```

2. Open `/chat` and send one new message.
3. Verify the message is accepted and usage becomes `100 / 100`.
4. Send one more new message.
5. Verify the composer locks and the API returns the quota error without starting a new run.

Paid-user smoke test:

1. Set `clients.plan_name = 'Pro'`.
2. Refresh `/pricing` and `/settings`.
3. Verify the UI shows `500 messages / month`.
4. Verify the used / remaining values match the current month row.

Month-reset smoke test:

1. Change the row to the previous month.
2. Refresh `/settings`.
3. Verify usage resets to `0 used` and full remaining quota for the current month.

### Step 5: Commit

```bash
git add docs/product/designs/stripe-billing-integration.md docs/product/handovers/stripe-billing-handover.md
git commit -m "docs(pr38c): document message quota rules"
```

---

## Final Check

- Quota constants live in exactly one product catalog: `src/lib/stripe/plans.ts`
- DB accounting lives in exactly one monthly table: `client_message_usage_monthly`
- Route enforcement happens exactly once per new user-authored inbound turn
- UI reads quota from typed helpers; it does not duplicate month math in components
- No `COUNT(*)` scans over `conversation_messages`
- No Stripe metered billing
- No changes to autopilot or cron accounting in this PR
