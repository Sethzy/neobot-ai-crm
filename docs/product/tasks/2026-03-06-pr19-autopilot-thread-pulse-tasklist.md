# PR 19: Autopilot Thread + Pulse

**PR:** PR 19: Autopilot thread + pulse
**Decisions:** TRIG-06b, TRIG-07, TRIG-08, TRIG-09, TRIG-10
**Goal:** Create a pre-installed "Sunder Autopilot" pinned thread on signup, with a 6h-default pulse trigger that fires `runAutopilot()` using `generateText`. The autopilot follows a 10-level priority order, always calling tools for live state before acting. Includes `autopilot_config` table for per-client pulse interval and quiet hours. A `send_message` tool is stubbed for future email notifications (PR 32a).

**Architecture:** On user signup, a DB trigger on `clients` INSERT creates: (1) a pinned `conversation_threads` row titled "Sunder Autopilot", (2) an `agent_triggers` row with `trigger_type = 'pulse'` and `cron_expression = '0 */6 * * *'`, and (3) an `autopilot_config` row with defaults. The scanner (PR 18) now recognizes `pulse` triggers and checks quiet hours before dispatch. The executor routes pulse triggers to a new `runAutopilot()` function that uses `generateText` (not `streamText`) with the same tool set as `runAgent`. The autopilot instruction prompt is a TypeScript constant (not a Storage file) containing the 10-level priority order and mandatory bootstrap requirement.

**Tech Stack:** Supabase (Postgres + RLS), Vercel AI SDK v6, Vitest, Zod 4

**Prerequisite:** PR 18 (cron scanner + agent_triggers) and PR 22 (context recovery + compaction) must be merged. The runner engine, trigger system, thread queue, todo tools, and compaction infra are all required.

---

## Relevant Files

### Create
- `supabase/migrations/20260306030000_create_autopilot_config.sql`
- `supabase/migrations/20260306030001_add_pulse_trigger_type.sql`
- `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql`
- `src/lib/autopilot/constants.ts`
- `src/lib/autopilot/__tests__/constants.test.ts`
- `src/lib/autopilot/quiet-hours.ts`
- `src/lib/autopilot/__tests__/quiet-hours.test.ts`
- `src/lib/runner/run-autopilot.ts`
- `src/lib/runner/__tests__/run-autopilot.test.ts`
- `src/lib/runner/tools/utility/send-message.ts`
- `src/lib/runner/tools/utility/__tests__/send-message.test.ts`
- `supabase/verification/pr19_autopilot_bootstrap_check.sql`

### Modify
- `src/lib/triggers/schemas.ts` — add `"pulse"` to `triggerTypeValues`
- `src/lib/triggers/scanner.ts` — quiet hours check for pulse triggers
- `src/lib/triggers/executor.ts` — route pulse triggers to `runAutopilot()`
- `src/lib/triggers/__tests__/scanner.test.ts` — pulse dispatch + quiet hours tests
- `src/lib/triggers/__tests__/executor.test.ts` — pulse routing tests
- `src/lib/runner/context.ts` — add optional `instructions` param to `assembleContext`
- `src/lib/runner/__tests__/context.test.ts` — instructions injection tests
- `src/lib/runner/tools/utility/index.ts` — register `send_message` tool
- `src/types/database.ts` — add `autopilot_config` table + `pulse` type + new RPCs

### Reference (do not modify)
- `src/lib/runner/run-agent.ts` — runner engine (pattern reference for `runAutopilot`)
- `src/lib/runner/compaction.ts` — `generateText` pattern reference + `maybeCompactThread`
- `src/lib/runner/run-lifecycle.ts` — `createRun`, `completeRun`, `markStaleRunsFailed`
- `src/lib/runner/thread-queue.ts` — `enqueueMessage`, `drainAndContinue`
- `src/lib/runner/schemas.ts` — `RunnerPayload`, `triggerTypeValues` (already has `"pulse"`)
- `src/lib/runner/message-utils.ts` — `buildAssistantPartsFromSteps`, `getAssistantTextFromParts`
- `src/lib/runner/toolcall-artifacts.ts` — `truncateOversizedParts`
- `src/lib/ai/gateway.ts` — `gateway()`, `TIER_1_MODEL`
- `supabase/migrations/20260306010000_create_agent_triggers.sql` — trigger table schema
- `supabase/migrations/20260301000001_create_clients_trigger.sql` — `handle_new_user()` pattern

---

## Task 1: Autopilot Constants, Instruction Prompt, and Schemas

**Files:**
- Create: `src/lib/autopilot/constants.ts`
- Create: `src/lib/autopilot/__tests__/constants.test.ts`

This task defines the autopilot instruction prompt (TRIG-08), pulse configuration constants, and Zod schemas for `autopilot_config`. The instruction prompt is a TypeScript constant — not a Storage file — because it's version-controlled and shared across all clients in v1.

The 10-level priority order (from TRIG-08, adapted from App Spec §7.2):

1. Resume interrupted work (`list_todo` — check payload for next step)
2. Check overdue CRM tasks (`search_tasks` where `due_date < now`)
3. Act on monitored triggers (deal stage changes, inbound interactions)
4. Follow up with user on unanswered questions
5. Handle stale CRM tasks (open too long without progress)
6. Research/prepare for upcoming tasks
7. Get to know user (sparse USER.md)
8. Engage user (nudge, pending approvals)
9. Propose new CRM tasks (`create_task`) or self-todos (`manage_todo` add)
10. Create momentum (break large work into smaller pieces)

Hard rules (TRIG-08):
- Always do something. Never say "nothing to do."
- Always end with a concrete next action.
- MANDATORY bootstrap: call tools for live state before acting. Thread history ≠ current truth.
- Noise suppression (TRIG-09): Avoid low-value pulses. If no urgent work exists, focus on relationship building or forward planning — never produce filler.

**Step 1: Write tests for constants and schemas**

Create `src/lib/autopilot/__tests__/constants.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  AUTOPILOT_INSTRUCTION_PROMPT,
  AUTOPILOT_THREAD_TITLE,
  DEFAULT_PULSE_CRON,
  PULSE_INTERVAL_MAP,
  autopilotConfigSchema,
  type AutopilotConfig,
} from "../constants";

describe("autopilot constants", () => {
  test("AUTOPILOT_THREAD_TITLE is a non-empty string", () => {
    expect(AUTOPILOT_THREAD_TITLE).toBe("Sunder Autopilot");
  });

  test("DEFAULT_PULSE_CRON is a valid 6h cron expression", () => {
    expect(DEFAULT_PULSE_CRON).toBe("0 */6 * * *");
  });

  test("PULSE_INTERVAL_MAP maps all supported intervals to valid cron expressions", () => {
    expect(PULSE_INTERVAL_MAP).toEqual({
      "1h": "0 * * * *",
      "2h": "0 */2 * * *",
      "6h": "0 */6 * * *",
      "12h": "0 */12 * * *",
    });
  });

  test("AUTOPILOT_INSTRUCTION_PROMPT includes priority order keywords", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("list_todo");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("search_tasks");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("priority");
  });

  test("AUTOPILOT_INSTRUCTION_PROMPT includes bootstrap requirement", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("MUST call tools");
  });

  test("AUTOPILOT_INSTRUCTION_PROMPT includes noise suppression guidance", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("noise");
  });
});

describe("autopilotConfigSchema", () => {
  test("validates a complete config row", () => {
    const input = {
      config_id: "11111111-1111-1111-1111-111111111111",
      client_id: "22222222-2222-2222-2222-222222222222",
      pulse_interval: "6h",
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
      enabled: true,
      created_at: "2026-03-06T00:00:00+00:00",
      updated_at: "2026-03-06T00:00:00+00:00",
    };

    const result = autopilotConfigSchema.parse(input);
    expect(result.pulse_interval).toBe("6h");
    expect(result.enabled).toBe(true);
  });

  test("accepts all valid pulse intervals", () => {
    for (const interval of ["1h", "2h", "6h", "12h"]) {
      const input = {
        config_id: "11111111-1111-1111-1111-111111111111",
        client_id: "22222222-2222-2222-2222-222222222222",
        pulse_interval: interval,
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
        enabled: true,
        created_at: "2026-03-06T00:00:00+00:00",
        updated_at: "2026-03-06T00:00:00+00:00",
      };
      expect(() => autopilotConfigSchema.parse(input)).not.toThrow();
    }
  });

  test("rejects invalid pulse interval", () => {
    const input = {
      config_id: "11111111-1111-1111-1111-111111111111",
      client_id: "22222222-2222-2222-2222-222222222222",
      pulse_interval: "3h",
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
      enabled: true,
      created_at: "2026-03-06T00:00:00+00:00",
      updated_at: "2026-03-06T00:00:00+00:00",
    };
    expect(() => autopilotConfigSchema.parse(input)).toThrow();
  });

  test("accepts null quiet hours", () => {
    const input = {
      config_id: "11111111-1111-1111-1111-111111111111",
      client_id: "22222222-2222-2222-2222-222222222222",
      pulse_interval: "6h",
      quiet_hours_start: null,
      quiet_hours_end: null,
      enabled: true,
      created_at: "2026-03-06T00:00:00+00:00",
      updated_at: "2026-03-06T00:00:00+00:00",
    };
    const result = autopilotConfigSchema.parse(input);
    expect(result.quiet_hours_start).toBeNull();
    expect(result.quiet_hours_end).toBeNull();
  });
});
```

Run the tests — they should fail because `constants.ts` does not exist yet.

```bash
npx vitest run src/lib/autopilot/__tests__/constants.test.ts
```

Expected: All tests fail with "Cannot find module '../constants'".

**Step 2: Implement the constants module**

Create `src/lib/autopilot/constants.ts`:

```typescript
/**
 * Autopilot configuration constants, instruction prompt, and Zod schemas.
 * @module lib/autopilot/constants
 */
import { z } from "zod";

/** Title for the pre-installed Autopilot pinned thread. */
export const AUTOPILOT_THREAD_TITLE = "Sunder Autopilot";

/** Default pulse cron expression: every 6 hours (TRIG-07). */
export const DEFAULT_PULSE_CRON = "0 */6 * * *";

/** Maps supported pulse interval labels to their cron expressions. */
export const PULSE_INTERVAL_MAP: Record<string, string> = {
  "1h": "0 * * * *",
  "2h": "0 */2 * * *",
  "6h": "0 */6 * * *",
  "12h": "0 */12 * * *",
};

/** Supported pulse interval values for the autopilot_config table. */
export const pulseIntervalValues = ["1h", "2h", "6h", "12h"] as const;

/**
 * Autopilot instruction prompt injected into the system prompt for pulse runs.
 * Contains the 10-level priority order (TRIG-08), mandatory bootstrap
 * requirement (PR19-6), and noise suppression guidance (TRIG-09).
 *
 * This is a TypeScript constant (not a Storage file) because it is
 * version-controlled and shared across all clients in v1.
 */
export const AUTOPILOT_INSTRUCTION_PROMPT = `You are running an autonomous pulse. Your job is to review the client's current state and take the most valuable action available.

MANDATORY BOOTSTRAP: You MUST call tools for live state before acting. Thread history is stale — it does NOT reflect current truth. Always start by calling list_todo() and search_tasks() to get fresh data.

Follow this priority order. Work the highest-priority item that has actionable work:

1. Resume interrupted work — call list_todo(). If any todo has a resume payload, pick up where you left off.
2. Check overdue CRM tasks — call search_tasks() filtered to due_date < now. Handle the most urgent one.
3. Act on monitored triggers — check for recent deal stage changes or inbound interactions via search_interactions().
4. Follow up with user — if you asked the user something in a previous pulse and got no answer, nudge them.
5. Handle stale CRM tasks — look for open tasks that have been sitting without progress for too long.
6. Research and prepare — if upcoming tasks need preparation (e.g., property research, market data), do it now.
7. Get to know user — if USER.md is sparse, ask a thoughtful question to learn more about their business.
8. Engage user — nudge on pending approvals, share a useful insight, or surface something they might have missed.
9. Propose new work — create CRM tasks (create_task) or self-todos (manage_todo add) for things you've identified.
10. Create momentum — break large stalled work into smaller actionable pieces.

HARD RULES:
- Always do something. Never say "nothing to do." If nothing is urgent, move down the priority list.
- Always end with a concrete next action — what you will do on the next pulse.
- Keep output concise and actionable. The user reads this in their Autopilot thread.

NOISE SUPPRESSION: Avoid low-value pulses. If no urgent work exists, focus on relationship building (priority 7-8) or forward planning (priority 9-10). Never produce filler content. Quality over quantity — a shorter, meaningful update is better than a long generic one.`;

/** Validates one `autopilot_config` row returned from Supabase. */
export const autopilotConfigSchema = z.object({
  config_id: z.string().uuid(),
  client_id: z.string().uuid(),
  pulse_interval: z.enum(pulseIntervalValues),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  enabled: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>;
```

**Step 3: Run tests — all should pass**

```bash
npx vitest run src/lib/autopilot/__tests__/constants.test.ts
```

Expected: All 8 tests pass.

---

## Task 2: Database Migrations — autopilot_config, Pulse Trigger Type, Bootstrap

**Files:**
- Create: `supabase/migrations/20260306030000_create_autopilot_config.sql`
- Create: `supabase/migrations/20260306030001_add_pulse_trigger_type.sql`
- Create: `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql`
- Create: `supabase/verification/pr19_autopilot_bootstrap_check.sql`

Three migrations, split for clarity:
1. `autopilot_config` table with RLS (TRIG-07)
2. Add `'pulse'` to the `agent_triggers.trigger_type` CHECK constraint
3. DB trigger on `clients` INSERT that bootstraps the Autopilot thread, trigger, and config

**Step 1: Write autopilot_config migration**

Create `supabase/migrations/20260306030000_create_autopilot_config.sql`:

```sql
-- PR 19: autopilot_config table for per-client pulse settings (TRIG-07).
-- Stores pulse interval (enum), quiet hours, and enabled toggle.
-- One row per client, created automatically on signup.

CREATE TABLE public.autopilot_config (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(client_id) ON DELETE CASCADE,

  -- Pulse frequency: 1h, 2h, 6h, or 12h (TRIG-07).
  pulse_interval TEXT NOT NULL DEFAULT '6h'
    CHECK (pulse_interval IN ('1h', '2h', '6h', '12h')),

  -- Quiet hours: HH:MM in client's local time (Asia/Singapore default).
  -- Both NULL = no quiet hours. Both must be set or both NULL.
  quiet_hours_start TIME,
  quiet_hours_end TIME,

  enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure quiet hours are either both set or both NULL.
  CONSTRAINT autopilot_config_quiet_hours_check
    CHECK (
      (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
      OR (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
    )
);

-- Tenant isolation index
CREATE INDEX idx_autopilot_config_client_id ON public.autopilot_config(client_id);

-- RLS
ALTER TABLE public.autopilot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY autopilot_config_select_own ON public.autopilot_config
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY autopilot_config_update_own ON public.autopilot_config
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

-- Users should not insert or delete directly — managed by bootstrap trigger.
-- Service role bypasses RLS for administrative operations.

-- updated_at auto-refresh
CREATE OR REPLACE FUNCTION public.update_autopilot_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_autopilot_config_updated_at
  BEFORE UPDATE ON public.autopilot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_autopilot_config_updated_at();
```

**Step 2: Write pulse trigger type migration**

Create `supabase/migrations/20260306030001_add_pulse_trigger_type.sql`:

```sql
-- PR 19: Add 'pulse' to agent_triggers.trigger_type CHECK constraint.
-- Required for the autopilot pulse trigger (TRIG-07).

-- Drop and recreate the CHECK constraint to add 'pulse'.
ALTER TABLE public.agent_triggers
  DROP CONSTRAINT IF EXISTS agent_triggers_trigger_type_check;

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_trigger_type_check
    CHECK (trigger_type IN ('schedule', 'webhook', 'rss', 'pulse'));
```

**Step 3: Write bootstrap trigger migration**

Create `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql`:

```sql
-- PR 19: Bootstrap Autopilot thread, trigger, and config on client creation.
-- Decision refs: TRIG-07 (pre-installed autopilot on signup).
--
-- Fires AFTER INSERT on public.clients (which itself is created by
-- handle_new_user() on auth.users INSERT).
--
-- Creates three rows:
-- 1. A pinned conversation_threads row titled "Sunder Autopilot"
-- 2. An agent_triggers row with trigger_type='pulse', cron='0 */6 * * *'
-- 3. An autopilot_config row with default settings

CREATE OR REPLACE FUNCTION public.bootstrap_autopilot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_thread_id UUID;
  v_next_fire TIMESTAMPTZ;
BEGIN
  -- 1. Create pinned Autopilot thread.
  INSERT INTO public.conversation_threads (client_id, title, is_pinned)
  VALUES (NEW.client_id, 'Sunder Autopilot', true)
  RETURNING thread_id INTO v_thread_id;

  -- Compute first fire time: next aligned 6h boundary from now.
  v_next_fire := date_trunc('hour', now()) + INTERVAL '6 hours';

  -- 2. Create pulse trigger (fires into the Autopilot thread).
  INSERT INTO public.agent_triggers (
    client_id, thread_id, trigger_type, name,
    cron_expression, instruction_path, next_fire_at
  ) VALUES (
    NEW.client_id, v_thread_id, 'pulse', 'Autopilot Pulse',
    '0 */6 * * *', 'autopilot/pulse', v_next_fire
  );

  -- 3. Create default autopilot config.
  INSERT INTO public.autopilot_config (client_id)
  VALUES (NEW.client_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_client_created_bootstrap_autopilot
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_autopilot();

COMMENT ON FUNCTION public.bootstrap_autopilot()
  IS 'Creates Autopilot thread, pulse trigger, and config for new clients (TRIG-07).';

-- Backfill: bootstrap autopilot for existing clients that don't have one yet.
DO $$
DECLARE
  r RECORD;
  v_thread_id UUID;
  v_next_fire TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT c.client_id
    FROM public.clients c
    LEFT JOIN public.autopilot_config ac ON ac.client_id = c.client_id
    WHERE ac.config_id IS NULL
  LOOP
    INSERT INTO public.conversation_threads (client_id, title, is_pinned)
    VALUES (r.client_id, 'Sunder Autopilot', true)
    RETURNING thread_id INTO v_thread_id;

    v_next_fire := date_trunc('hour', now()) + INTERVAL '6 hours';

    INSERT INTO public.agent_triggers (
      client_id, thread_id, trigger_type, name,
      cron_expression, instruction_path, next_fire_at
    ) VALUES (
      r.client_id, v_thread_id, 'pulse', 'Autopilot Pulse',
      '0 */6 * * *', 'autopilot/pulse', v_next_fire
    );

    INSERT INTO public.autopilot_config (client_id)
    VALUES (r.client_id);
  END LOOP;
END;
$$;
```

**Step 4: Write verification SQL**

Create `supabase/verification/pr19_autopilot_bootstrap_check.sql`:

```sql
-- Verify autopilot bootstrap created rows for all existing clients.

-- 1. Every client should have exactly one autopilot_config row.
SELECT c.client_id,
       ac.config_id IS NOT NULL AS has_config,
       ac.pulse_interval,
       ac.enabled
FROM public.clients c
LEFT JOIN public.autopilot_config ac ON ac.client_id = c.client_id
ORDER BY c.client_id;

-- 2. Every client should have a pinned "Sunder Autopilot" thread.
SELECT c.client_id,
       ct.thread_id,
       ct.title,
       ct.is_pinned
FROM public.clients c
LEFT JOIN public.conversation_threads ct
  ON ct.client_id = c.client_id
  AND ct.title = 'Sunder Autopilot'
  AND ct.is_pinned = true
ORDER BY c.client_id;

-- 3. Every client should have a pulse trigger.
SELECT c.client_id,
       at.id AS trigger_id,
       at.trigger_type,
       at.cron_expression,
       at.enabled,
       at.next_fire_at
FROM public.clients c
LEFT JOIN public.agent_triggers at
  ON at.client_id = c.client_id
  AND at.trigger_type = 'pulse'
ORDER BY c.client_id;

-- 4. Verify CHECK constraint includes 'pulse'.
SELECT conname, consrc
FROM pg_constraint
WHERE conrelid = 'public.agent_triggers'::regclass
  AND conname = 'agent_triggers_trigger_type_check';
```

**Step 5: Apply migrations locally**

```bash
npx supabase db reset
```

Expected: All three migrations apply cleanly. Verification queries show correct bootstrap data.

---

## Task 3: Quiet Hours Utility

**Files:**
- Create: `src/lib/autopilot/quiet-hours.ts`
- Create: `src/lib/autopilot/__tests__/quiet-hours.test.ts`

A pure function that determines whether the current time falls within a client's configured quiet hours. Called by the scanner before dispatching pulse triggers. Uses `Asia/Singapore` as the default timezone (per App Spec — Singapore agents).

The quiet hours window can wrap midnight (e.g., 22:00 → 07:00). If both `quiet_hours_start` and `quiet_hours_end` are `null`, quiet hours are disabled.

**Step 1: Write tests for quiet hours**

Create `src/lib/autopilot/__tests__/quiet-hours.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { isInQuietHours } from "../quiet-hours";

describe("isInQuietHours", () => {
  test("returns false when quiet hours are null", () => {
    expect(isInQuietHours({
      quietHoursStart: null,
      quietHoursEnd: null,
      now: new Date("2026-03-06T23:30:00+08:00"),
    })).toBe(false);
  });

  test("returns true when current time is within overnight quiet hours", () => {
    // 22:00 - 07:00 SGT, current time 23:30 SGT — inside quiet hours.
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-06T23:30:00+08:00"),
    })).toBe(true);
  });

  test("returns true at midnight within overnight quiet hours", () => {
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-07T00:00:00+08:00"),
    })).toBe(true);
  });

  test("returns true at 06:59 within overnight quiet hours", () => {
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-06T06:59:00+08:00"),
    })).toBe(true);
  });

  test("returns false at 07:00 (end boundary, exclusive)", () => {
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-06T07:00:00+08:00"),
    })).toBe(false);
  });

  test("returns false when current time is outside overnight quiet hours", () => {
    // 22:00 - 07:00 SGT, current time 14:00 SGT — outside.
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-06T14:00:00+08:00"),
    })).toBe(false);
  });

  test("returns true within same-day quiet hours", () => {
    // 09:00 - 17:00, current time 12:00 SGT — inside.
    expect(isInQuietHours({
      quietHoursStart: "09:00",
      quietHoursEnd: "17:00",
      now: new Date("2026-03-06T12:00:00+08:00"),
    })).toBe(true);
  });

  test("returns false outside same-day quiet hours", () => {
    // 09:00 - 17:00, current time 20:00 SGT — outside.
    expect(isInQuietHours({
      quietHoursStart: "09:00",
      quietHoursEnd: "17:00",
      now: new Date("2026-03-06T20:00:00+08:00"),
    })).toBe(false);
  });

  test("returns true at 22:00 (start boundary, inclusive)", () => {
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-06T22:00:00+08:00"),
    })).toBe(true);
  });

  test("defaults to Asia/Singapore timezone", () => {
    // 23:30 UTC = 07:30 SGT (+8). Quiet hours 22:00-07:00 SGT.
    // 07:30 SGT is outside quiet hours.
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-06T23:30:00Z"),
    })).toBe(false);
  });

  test("accepts custom timezone parameter", () => {
    // 23:30 UTC in America/New_York (UTC-5) = 18:30 EST.
    // Quiet hours 22:00-07:00 EST. 18:30 is outside.
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-06T23:30:00Z"),
      timezone: "America/New_York",
    })).toBe(false);

    // 04:30 UTC in America/New_York = 23:30 EST. Inside quiet hours.
    expect(isInQuietHours({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      now: new Date("2026-03-07T04:30:00Z"),
      timezone: "America/New_York",
    })).toBe(true);
  });
});
```

Run tests — should fail because module doesn't exist.

```bash
npx vitest run src/lib/autopilot/__tests__/quiet-hours.test.ts
```

**Step 2: Implement quiet hours utility**

Create `src/lib/autopilot/quiet-hours.ts`:

```typescript
/**
 * Quiet hours check for autopilot pulse suppression.
 * @module lib/autopilot/quiet-hours
 */

const DEFAULT_TIMEZONE = "Asia/Singapore";

export interface IsInQuietHoursInput {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  now: Date;
  /** IANA timezone string. Defaults to Asia/Singapore. */
  timezone?: string;
}

/**
 * Parses an "HH:MM" time string into total minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Returns the current time-of-day in the given timezone as minutes since midnight.
 */
function getCurrentMinutesInTimezone(now: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

  return hour * 60 + minute;
}

/**
 * Determines whether the given time falls within the configured quiet hours.
 * Quiet hours suppress autopilot pulse dispatch (TRIG-07).
 *
 * - Start is inclusive, end is exclusive.
 * - Supports overnight ranges (e.g., 22:00 → 07:00).
 * - Returns false if either start or end is null (quiet hours disabled).
 */
export function isInQuietHours({
  quietHoursStart,
  quietHoursEnd,
  now,
  timezone = DEFAULT_TIMEZONE,
}: IsInQuietHoursInput): boolean {
  if (quietHoursStart === null || quietHoursEnd === null) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(quietHoursStart);
  const endMinutes = parseTimeToMinutes(quietHoursEnd);
  const currentMinutes = getCurrentMinutesInTimezone(now, timezone);

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g., 09:00 → 17:00).
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Overnight range (e.g., 22:00 → 07:00).
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
```

**Step 3: Run tests — all should pass**

```bash
npx vitest run src/lib/autopilot/__tests__/quiet-hours.test.ts
```

Expected: All 10 tests pass.

---

## Task 4: Context Assembly — Instructions Injection

**Files:**
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/runner/__tests__/context.test.ts`

Add an optional `instructions` parameter to `assembleContext`. When provided, the instructions are injected into the system prompt between the core `SYSTEM_PROMPT` layer and the memory layers. This is used by `runAutopilot()` to inject the autopilot instruction prompt without modifying the global system prompt.

**Step 1: Write tests for instructions injection**

Add to `src/lib/runner/__tests__/context.test.ts`:

```typescript
describe("assembleContext with instructions", () => {
  test("includes instructions in system prompt between SYSTEM_PROMPT and memory layers", async () => {
    // Setup: mock supabase calls to return memory + history
    // Call assembleContext with instructions: "Custom autopilot instructions"
    // Assert: system prompt contains "Custom autopilot instructions"
    // Assert: instructions appear after SYSTEM_PROMPT but before <soul> tag
  });

  test("omits instructions from system prompt when not provided", async () => {
    // Setup: same mock as above but no instructions param
    // Assert: system prompt does NOT contain the instruction text
  });
});
```

Note: These tests follow the existing mock patterns in `context.test.ts`. The exact mock setup depends on the current test file structure — adapt to match existing patterns.

**Step 2: Modify `AssembleContextParams` interface**

In `src/lib/runner/context.ts`, add an optional `instructions` field:

```typescript
interface AssembleContextParams {
  supabase: ChatSupabaseClient;
  threadId: string;
  currentMessage: string;
  clientId?: string;
  /** Optional instructions injected after SYSTEM_PROMPT, before memory layers. */
  instructions?: string;
}
```

**Step 3: Modify `buildSystemPrompt` to accept instructions**

Update the function signature and inject instructions after `SYSTEM_PROMPT`:

```typescript
function buildSystemPrompt(
  memory?: MemoryContext,
  compactionSummary?: string,
  systemReminder?: string,
  instructions?: string,
): string {
  if (!memory) {
    return instructions
      ? [SYSTEM_PROMPT, instructions].join("\n\n")
      : SYSTEM_PROMPT;
  }

  const sections: string[] = [];

  // Layer 1: platform-level operational instructions.
  sections.push(PLATFORM_INSTRUCTIONS);

  // Layer 2: core personality, tool usage, approvals, and output guidance.
  sections.push(SYSTEM_PROMPT);

  // Layer 3 (optional): run-specific instructions (e.g., autopilot priority order).
  if (instructions && instructions.trim().length > 0) {
    sections.push(instructions);
  }

  // ... rest unchanged (soul, user, memory, compaction, system-reminder)
```

**Step 4: Thread `instructions` through `assembleContext`**

Pass `instructions` to `buildSystemPrompt`:

```typescript
return {
  system: buildSystemPrompt(
    memoryContext,
    compactionState?.compaction_summary,
    systemReminder,
    instructions,
  ),
  messages: [...historyMessages, ...currentMessageTurn],
};
```

**Step 5: Run context tests — all should pass**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: All existing + new tests pass.

---

## Task 5: Autopilot Runner — `runAutopilot()`

**Files:**
- Create: `src/lib/runner/run-autopilot.ts`
- Create: `src/lib/runner/__tests__/run-autopilot.test.ts`

The core autopilot execution function. Uses `generateText` (not `streamText`) because there is no client streaming for pulse runs. Follows the same tool setup and run lifecycle as `runAgent` but injects the autopilot instruction prompt via `assembleContext({ instructions })`.

Key differences from `runAgent`:
- Uses `generateText` instead of `streamText` (no streaming for autonomous runs)
- Injects `AUTOPILOT_INSTRUCTION_PROMPT` via `assembleContext({ instructions })`
- Input is a fixed nudge message (same pattern as executor's `CRON_RUN_NUDGE`)
- Does not create a user message (same as `triggerType !== "cron"` check — pulse behaves like cron)
- Still calls `completeRun`, `drainAndContinue`, and `maybeCompactThread` in the same lifecycle pattern

**Step 1: Write tests for `runAutopilot`**

Create `src/lib/runner/__tests__/run-autopilot.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock external dependencies before importing the module under test.
vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn(() => () => false),
}));
vi.mock("@/lib/ai/gateway", () => ({
  gateway: vi.fn(() => "mock-model"),
  TIER_1_MODEL: "mock-tier-1",
}));
vi.mock("@/lib/chat/messages", () => ({
  createMessages: vi.fn(),
}));
vi.mock("@/lib/runner/compaction", () => ({
  CRM_COMPACTION_INSTRUCTIONS: "mock compaction instructions",
  maybeCompactThread: vi.fn(),
}));
vi.mock("@/lib/runner/context", () => ({
  assembleContext: vi.fn(),
}));
vi.mock("@/lib/runner/message-utils", () => ({
  buildAssistantPartsFromSteps: vi.fn(() => []),
  getAssistantTextFromParts: vi.fn(() => ""),
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: vi.fn(),
  completeRun: vi.fn(),
  markStaleRunsFailed: vi.fn(),
}));
vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: vi.fn(),
}));
vi.mock("@/lib/runner/toolcall-artifacts", () => ({
  truncateOversizedParts: vi.fn(() => ({ parts: [], recoveryPaths: [] })),
}));
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: vi.fn(() => ({})),
  createStorageTools: vi.fn(() => ({})),
  createWebTools: vi.fn(() => ({})),
  createUtilityTools: vi.fn(() => ({})),
}));
vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: vi.fn(),
}));

import { generateText } from "ai";
import { assembleContext } from "@/lib/runner/context";
import { createRun, completeRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";

import { runAutopilot } from "../run-autopilot";

function mockSupabase() {
  return {} as any;
}

describe("runAutopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("acquires a run lock and calls generateText", async () => {
    vi.mocked(createRun).mockResolvedValue({ created: true, runId: "run-1" });
    vi.mocked(assembleContext).mockResolvedValue({ system: "sys", messages: [] });
    vi.mocked(generateText).mockResolvedValue({
      text: "Autopilot output",
      steps: [],
      usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const result = await runAutopilot({
      clientId: "client-1",
      threadId: "thread-1",
      supabase: mockSupabase(),
    });

    expect(result.status).toBe("completed");
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  test("passes autopilot instructions to assembleContext", async () => {
    vi.mocked(createRun).mockResolvedValue({ created: true, runId: "run-1" });
    vi.mocked(assembleContext).mockResolvedValue({ system: "sys", messages: [] });
    vi.mocked(generateText).mockResolvedValue({
      text: "output",
      steps: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    } as any);

    await runAutopilot({
      clientId: "client-1",
      threadId: "thread-1",
      supabase: mockSupabase(),
    });

    expect(assembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("autonomous pulse"),
      }),
    );
  });

  test("returns queued when thread is busy", async () => {
    vi.mocked(createRun).mockResolvedValue({ created: false, runId: "" });

    const result = await runAutopilot({
      clientId: "client-1",
      threadId: "thread-1",
      supabase: mockSupabase(),
    });

    expect(result.status).toBe("queued");
    expect(generateText).not.toHaveBeenCalled();
  });

  test("marks run as failed on generateText error", async () => {
    vi.mocked(createRun).mockResolvedValue({ created: true, runId: "run-1" });
    vi.mocked(assembleContext).mockResolvedValue({ system: "sys", messages: [] });
    vi.mocked(generateText).mockRejectedValue(new Error("LLM timeout"));

    const result = await runAutopilot({
      clientId: "client-1",
      threadId: "thread-1",
      supabase: mockSupabase(),
    });

    expect(result.status).toBe("failed");
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
  });

  test("completes run lifecycle on success", async () => {
    vi.mocked(createRun).mockResolvedValue({ created: true, runId: "run-1" });
    vi.mocked(assembleContext).mockResolvedValue({ system: "sys", messages: [] });
    vi.mocked(generateText).mockResolvedValue({
      text: "Done",
      steps: [{ stepType: "initial" }],
      usage: { inputTokens: 200, outputTokens: 100 },
    } as any);

    await runAutopilot({
      clientId: "client-1",
      threadId: "thread-1",
      supabase: mockSupabase(),
    });

    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: "run-1",
        status: "completed",
        tokensIn: 200,
        tokensOut: 100,
      }),
    );
  });
});
```

Run tests — should fail because module doesn't exist.

```bash
npx vitest run src/lib/runner/__tests__/run-autopilot.test.ts
```

**Step 2: Implement `runAutopilot`**

Create `src/lib/runner/run-autopilot.ts`:

```typescript
/**
 * Autopilot runner using generateText for autonomous pulse execution.
 * @module lib/runner/run-autopilot
 */
import { generateText, stepCountIs } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import { createMessages } from "@/lib/chat/messages";
import { maybeCompactThread } from "@/lib/runner/compaction";
import { assembleContext } from "@/lib/runner/context";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import {
  buildAssistantPartsFromSteps,
  getAssistantTextFromParts,
} from "@/lib/runner/message-utils";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import { truncateOversizedParts } from "@/lib/runner/toolcall-artifacts";
import { buildPrepareStep } from "@/lib/runner/run-agent";
import {
  createCrmTools,
  createStorageTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import type { Database, Json } from "@/types/database";

const MAX_STEPS_AUTOPILOT = 9;
const AUTOPILOT_NUDGE = "Run your autonomous pulse. Follow the priority order.";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface RunAutopilotInput {
  clientId: string;
  threadId: string;
  supabase: ChatSupabaseClient;
}

export type RunAutopilotResult =
  | { status: "completed" }
  | { status: "queued" }
  | { status: "failed"; error: string };

/**
 * Executes one autopilot pulse using generateText (no client streaming).
 * Uses the same tool set and run lifecycle as runAgent.
 */
export async function runAutopilot({
  clientId,
  threadId,
  supabase,
}: RunAutopilotInput): Promise<RunAutopilotResult> {
  const modelId = TIER_1_MODEL;

  await markStaleRunsFailed(supabase, { threadId, staleMinutes: 15 });

  const lockResult = await createRun(supabase, { threadId, clientId });
  if (!lockResult.created) {
    await enqueueMessage(supabase, {
      threadId,
      clientId,
      content: AUTOPILOT_NUDGE,
      channel: "web",
    });
    return { status: "queued" };
  }

  try {
    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
      clientId,
      instructions: AUTOPILOT_INSTRUCTION_PROMPT,
    });

    const crmTools = createCrmTools(supabase, clientId, { allowWriteTools: true });
    const storageTools = createStorageTools(supabase, clientId);
    const webTools = createWebTools();
    const utilityTools = createUtilityTools(supabase, clientId, threadId);
    const tools = {
      ...crmTools,
      ...storageTools,
      ...webTools,
      ...utilityTools,
    };

    const result = await generateText({
      model: gateway(modelId),
      system,
      messages,
      maxSteps: MAX_STEPS_AUTOPILOT,
      tools,
      prepareStep: buildPrepareStep(modelId),
    });

    const rawParts = buildAssistantPartsFromSteps(result.steps);
    let parts = rawParts;
    let recoveryPaths: string[] = [];

    try {
      const truncatedResult = await truncateOversizedParts(
        supabase,
        clientId,
        rawParts,
      );
      parts = truncatedResult.parts;
      recoveryPaths = truncatedResult.recoveryPaths;
    } catch (artifactError) {
      console.error("[autopilot] toolcall artifact persistence failed:", artifactError);
    }

    const contentTextFromParts = getAssistantTextFromParts(parts);
    const fallbackContentText = typeof result.text === "string" ? result.text.trim() : "";
    const contentText = contentTextFromParts.length > 0
      ? contentTextFromParts
      : fallbackContentText;
    const hasNonStepParts = parts.some((part) => part.type !== "step-start");

    if (hasNonStepParts || contentText.length > 0) {
      await createMessages(supabase, [
        {
          thread_id: threadId,
          role: "assistant",
          content: contentText,
          parts: hasNonStepParts
            ? (parts as Json)
            : ([{ type: "text", text: contentText }] as Json),
        },
      ]);
    }

    await completeRun(supabase, {
      runId: lockResult.runId,
      status: "completed",
      model: modelId,
      tokensIn: result.usage?.inputTokens ?? 0,
      tokensOut: result.usage?.outputTokens ?? 0,
      stepCount: result.steps.length,
    });

    await drainAndContinue(supabase, { clientId, threadId });
    void maybeCompactThread(supabase, clientId, threadId).catch((compactionError) => {
      console.error("[autopilot] post-run compaction failed:", compactionError);
    });

    return { status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown autopilot error";

    await completeRun(supabase, {
      runId: lockResult.runId,
      status: "failed",
      model: modelId,
      tokensIn: 0,
      tokensOut: 0,
    });

    return { status: "failed", error: message };
  }
}
```

**Step 3: Run tests — all should pass**

```bash
npx vitest run src/lib/runner/__tests__/run-autopilot.test.ts
```

Expected: All 5 tests pass.

---

## Task 6: send_message Tool Stub

**Files:**
- Create: `src/lib/runner/tools/utility/send-message.ts`
- Create: `src/lib/runner/tools/utility/__tests__/send-message.test.ts`
- Modify: `src/lib/runner/tools/utility/index.ts`

Stub implementation of the `send_message` tool (TRIG-06b). The agent calls this when it wants to notify the user via email. In this PR, the tool logs the intent but does not actually send. Full implementation deferred to PR 32a (Resend integration).

**Step 1: Write tests for send_message stub**

Create `src/lib/runner/tools/utility/__tests__/send-message.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";

import { createSendMessageTool } from "../send-message";

describe("createSendMessageTool", () => {
  test("returns a tool object with the correct name", () => {
    const tools = createSendMessageTool();
    expect(tools).toHaveProperty("send_message");
    expect(tools.send_message).toHaveProperty("execute");
    expect(tools.send_message).toHaveProperty("parameters");
  });

  test("execute returns a stub success response", async () => {
    const tools = createSendMessageTool();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await tools.send_message.execute({
      channel: "email",
      subject: "Follow-up reminder",
      body: "Hi, just checking in on the deal.",
    });

    expect(result).toEqual({
      success: true,
      data: { stub: true, message: "send_message is not yet implemented" },
      error: null,
      source: "send_message",
    });

    consoleSpy.mockRestore();
  });

  test("execute logs the send intent", async () => {
    const tools = createSendMessageTool();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await tools.send_message.execute({
      channel: "email",
      subject: "Test",
      body: "Test body",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[send_message]"),
      expect.objectContaining({ channel: "email" }),
    );

    consoleSpy.mockRestore();
  });
});
```

Run tests — should fail because module doesn't exist.

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/send-message.test.ts
```

**Step 2: Implement send_message stub**

Create `src/lib/runner/tools/utility/send-message.ts`:

```typescript
/**
 * Stub send_message tool for platform notifications (TRIG-06b).
 * Logs the send intent but does not actually deliver. Full implementation in PR 32a.
 * @module lib/runner/tools/utility/send-message
 */
import { tool } from "ai";
import { z } from "zod";

/**
 * Creates the send_message tool (stub).
 * The agent calls this when it wants to notify the user via email.
 */
export function createSendMessageTool() {
  return {
    send_message: tool({
      description:
        "Send a notification to the user via their preferred channel (currently email only). " +
        "Use this when you have important updates, completed work, or need user input. " +
        "Note: This tool is a stub — messages are logged but not yet delivered.",
      parameters: z.object({
        channel: z.enum(["email"]).describe("Delivery channel. Currently only 'email' is supported."),
        subject: z.string().min(1).describe("Message subject line."),
        body: z.string().min(1).describe("Message body in plain text."),
      }),
      execute: async (params) => {
        console.log("[send_message] stub — message not delivered:", params);

        return {
          success: true,
          data: { stub: true, message: "send_message is not yet implemented" },
          error: null,
          source: "send_message",
        };
      },
    }),
  };
}
```

**Step 3: Register in utility tools barrel**

Update `src/lib/runner/tools/utility/index.ts` to include `send_message`:

```typescript
import { createSendMessageTool } from "./send-message";

// Inside createUtilityTools:
const sendMessageTool = createSendMessageTool();

return {
  ...todoTools,
  ...renameChatTool,
  ...sqlTools,
  ...sendMessageTool,
};
```

**Step 4: Run tests — all should pass**

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/send-message.test.ts
```

Expected: All 3 tests pass.

---

## Task 7: Scanner + Executor Integration — Quiet Hours + Pulse Routing

**Files:**
- Modify: `src/lib/triggers/schemas.ts` — add `"pulse"` to `triggerTypeValues`
- Modify: `src/lib/triggers/scanner.ts` — quiet hours check before pulse dispatch
- Modify: `src/lib/triggers/executor.ts` — route pulse triggers to `runAutopilot()`
- Modify: `src/lib/triggers/__tests__/scanner.test.ts` — pulse + quiet hours tests
- Modify: `src/lib/triggers/__tests__/executor.test.ts` — pulse routing tests

### 7a: Update trigger schemas

Add `"pulse"` to `triggerTypeValues` in `src/lib/triggers/schemas.ts`:

```typescript
export const triggerTypeValues = ["schedule", "webhook", "rss", "pulse"] as const;
```

### 7b: Scanner — quiet hours gating for pulse triggers

The scanner must check quiet hours before dispatching pulse triggers. If the client is in quiet hours, the scanner skips the trigger (does not dispatch, does not release claim — leaves it for the next tick). The `claim_due_triggers` RPC already claimed it, so we release the claim with a `"skipped_quiet_hours"` status.

**Step 1: Write scanner tests for pulse quiet hours**

Add to `src/lib/triggers/__tests__/scanner.test.ts`:

```typescript
describe("pulse trigger quiet hours", () => {
  test("dispatches pulse trigger when outside quiet hours", async () => {
    // Setup: claimed trigger with trigger_type='pulse', quiet hours 22:00-07:00
    // Mock isInQuietHours to return false
    // Assert: dispatch is called
  });

  test("skips pulse trigger when inside quiet hours", async () => {
    // Setup: claimed trigger with trigger_type='pulse', quiet hours 22:00-07:00
    // Mock isInQuietHours to return true
    // Assert: dispatch is NOT called
    // Assert: claim is released with 'skipped_quiet_hours' status
  });

  test("processes schedule triggers regardless of quiet hours", async () => {
    // Setup: claimed trigger with trigger_type='schedule'
    // Assert: dispatch is called (quiet hours only apply to pulse)
  });
});
```

**Step 2: Implement quiet hours check in scanner**

In `src/lib/triggers/scanner.ts`, add quiet hours gating for pulse triggers:

1. Add a `fetchAutopilotConfig` dependency to `ScanDependencies` (or pass as a separate function).
2. Before dispatching a pulse trigger, load the client's `autopilot_config` and call `isInQuietHours`.
3. If in quiet hours, release the claim with `"skipped_quiet_hours"` status and continue.

Key implementation note: The scanner already has a `for (const trigger of claimedTriggers)` loop. Add a new `trigger.trigger_type === "pulse"` branch that:
- Loads the client's autopilot config via `supabase.from("autopilot_config").select(...).eq("client_id", trigger.client_id).maybeSingle()`
- Calls `isInQuietHours({ quietHoursStart, quietHoursEnd, now: new Date() })`
- If in quiet hours: `await releaseClaim(supabase, trigger, "skipped_quiet_hours")` and continue
- Otherwise: compute next fire time (same as schedule) and dispatch

### 7c: Executor — route pulse to `runAutopilot()`

**Step 1: Write executor tests for pulse routing**

Add to `src/lib/triggers/__tests__/executor.test.ts`:

```typescript
describe("pulse trigger execution", () => {
  test("routes pulse trigger to runAutopilot instead of runAgent", async () => {
    // Setup: payload with trigger_type indicator (pulse triggers have
    // instruction_path = 'autopilot/pulse')
    // Mock runAutopilot to return { status: "completed" }
    // Assert: runAutopilot is called, NOT runAgent
  });

  test("returns completed when runAutopilot succeeds", async () => {
    // Setup: same as above
    // Assert: result.status === "completed"
  });

  test("returns failed when runAutopilot fails", async () => {
    // Setup: runAutopilot returns { status: "failed", error: "..." }
    // Assert: result.status === "failed"
  });
});
```

**Step 2: Modify executor to detect and route pulse triggers**

In `src/lib/triggers/executor.ts`:

1. Import `runAutopilot` from `@/lib/runner/run-autopilot`.
2. Add a `triggerType` field to `TriggerDispatchPayload` (or detect pulse by `instruction_path === 'autopilot/pulse'`).
3. If the trigger is a pulse type, call `runAutopilot({ clientId, threadId, supabase })` instead of `runAgent()`.
4. Map `runAutopilot` result to executor result.

The cleanest detection is via the dispatch payload. Since `triggerDispatchPayloadSchema` doesn't include `trigger_type`, and we want minimal schema changes, detect pulse triggers via a new optional field on the dispatch payload:

In `src/lib/triggers/schemas.ts`, add to `triggerDispatchPayloadSchema`:
```typescript
triggerType: z.enum(triggerTypeValues).optional(),
```

Then in `scanner.ts`, include `triggerType: trigger.trigger_type` in `buildDispatchPayload`.

In `executor.ts`, check `payload.triggerType === "pulse"` to route to `runAutopilot`.

**Step 3: Run all trigger tests**

```bash
npx vitest run src/lib/triggers/__tests__/
```

Expected: All tests pass.

---

## Task 8: Database Types + Full Verification

**Files:**
- Modify: `src/types/database.ts`
- Run: all tests

**Step 1: Update database types**

Add the `autopilot_config` table type definition to `src/types/database.ts`. Follow the existing pattern for table type definitions in the file.

Key additions:
- `autopilot_config` table with Row/Insert/Update types
- `bootstrap_autopilot` function type
- Updated `agent_triggers.trigger_type` to include `"pulse"`

**Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass — no regressions.

**Step 3: Run verification SQL**

```bash
npx supabase db reset
# Then run: supabase/verification/pr19_autopilot_bootstrap_check.sql
```

Expected: All verification queries return expected results for bootstrapped clients.

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Constants, instruction prompt, schemas | 2 | 0 |
| 2 | Database migrations (config + pulse type + bootstrap) | 4 | 0 |
| 3 | Quiet hours utility | 2 | 0 |
| 4 | Context assembly — instructions injection | 0 | 2 |
| 5 | Autopilot runner (`runAutopilot`) | 2 | 0 |
| 6 | send_message tool stub | 2 | 1 |
| 7 | Scanner + executor integration | 0 | 6 |
| 8 | DB types + verification | 0 | 1 |
| **Total** | | **12** | **10** |
