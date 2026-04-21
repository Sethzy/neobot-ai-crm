# User-Scoped Telegram Pairing Implementation Plan

**Goal:** Let an authenticated user connect their own Telegram account from personal settings, route Telegram messages to their chosen default messaging thread, and keep the UI in sync with clear connected/waiting/error states.

**Architecture:** Keep `conversation_channel_mappings` as the transport routing table, but stop treating it as the personal source of truth. Add a user-owned Telegram connection table, a user-owned pairing-session table, and a per-user default messaging thread preference. Then rewrite the pairing API, webhook, disconnect flow, and settings UI around that model.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest + React Testing Library, Supabase (Postgres + RLS + Realtime), `grammy`, TanStack Query, Tailwind + ShadCN UI.

**Design Doc:** `docs/product/plans/2026-04-21-002-feat-user-scoped-telegram-pairing-plan.md`

**Reference Docs to Read First:**
- `docs/product/plans/2026-04-21-002-feat-user-scoped-telegram-pairing-plan.md`
- `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/telegram-drift-analysis.md`
- `app/api/webhook/telegram/route.ts`
- `app/api/telegram/generate-pairing-link/route.ts`
- `src/components/settings/messaging-channels/telegram-connect-row.tsx`

**Skills to use while executing:**
- `@test-driven-development` for every task
- `@systematic-debugging` if webhook/realtime/manual Telegram behavior diverges from tests
- `@nextjs-supabase-auth` for authenticated settings-route patterns

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

**Default commands:**

Run focused tests:

```bash
pnpm test:run path/to/file.test.ts
```

Run a named test:

```bash
pnpm test:run path/to/file.test.ts -t "test name"
```

Lint:

```bash
pnpm lint
```

Typecheck:

```bash
pnpm exec tsc --noEmit
```

## Relevant Files

**Schema + DB contract tests**
- Create: `supabase/migrations/20260421100000_create_messaging_channel_connections.sql`
- Create: `supabase/migrations/20260421100001_create_telegram_pairing_sessions.sql`
- Create: `supabase/migrations/20260421100002_ensure_user_profiles_and_add_default_messaging_thread_id.sql`
- Create: `supabase/migrations/20260421100003_backfill_telegram_connections_from_channel_mappings.sql`
- Create: `supabase/migrations/20260421100004_enable_realtime_for_messaging_channel_connections.sql`
- Create: `supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations.test.ts`
- Modify: `src/types/database.ts`

**Telegram helpers**
- Modify: `src/lib/channels/telegram/pairing.ts`
- Modify: `src/lib/channels/telegram/pairing.test.ts`
- Create: `src/lib/channels/telegram/user-connections.ts`
- Create: `src/lib/channels/telegram/user-connections.test.ts`
- Create: `src/lib/settings/profile/messaging-preferences.ts`
- Create: `src/lib/settings/profile/messaging-preferences.test.ts`

**Settings API**
- Create: `app/api/settings/profile/default-messaging-thread/route.ts`
- Create: `app/api/settings/profile/default-messaging-thread/route.test.ts`

**Pairing API**
- Modify: `app/api/telegram/generate-pairing-link/route.ts`
- Modify: `app/api/telegram/generate-pairing-link/route.test.ts`

**Webhook + disconnect**
- Modify: `app/api/webhook/telegram/route.ts`
- Modify: `app/api/webhook/telegram/__tests__/route.test.ts`
- Modify: `app/api/telegram/disconnect/route.ts`
- Modify: `app/api/telegram/disconnect/route.test.ts`

**Profile UI + settings IA**
- Modify: `app/settings/profile/page.tsx`
- Create: `src/components/settings/profile/default-messaging-agent-form.tsx`
- Create: `src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx`
- Modify: `src/components/settings/messaging-channels/telegram-connect-row.tsx`
- Modify: `src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx`
- Modify: `app/settings/workspace/messaging-channels/page.tsx`
- Modify: `src/components/agent/telegram-cta-banner.tsx`
- Modify: `src/hooks/use-realtime.ts`
- Modify: `src/hooks/__tests__/use-realtime.test.tsx`

**Ops helper**
- Create: `src/lib/channels/telegram/webhook-setup.ts`
- Create: `src/lib/channels/telegram/webhook-setup.test.ts`
- Create: `scripts/setup-telegram-webhook.ts`

---

### Task 1: Add the user-scoped Telegram schema and generated types

**Files:**
- Create: `supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations.test.ts`
- Create: `supabase/migrations/20260421100000_create_messaging_channel_connections.sql`
- Create: `supabase/migrations/20260421100001_create_telegram_pairing_sessions.sql`
- Create: `supabase/migrations/20260421100002_ensure_user_profiles_and_add_default_messaging_thread_id.sql`
- Create: `supabase/migrations/20260421100003_backfill_telegram_connections_from_channel_mappings.sql`
- Create: `supabase/migrations/20260421100004_enable_realtime_for_messaging_channel_connections.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the failing migration contract test**

Create `supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations.test.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const connectionMigration = join(
  process.cwd(),
  "supabase/migrations/20260421100000_create_messaging_channel_connections.sql",
);
const sessionMigration = join(
  process.cwd(),
  "supabase/migrations/20260421100001_create_telegram_pairing_sessions.sql",
);
const profileMigration = join(
  process.cwd(),
  "supabase/migrations/20260421100002_ensure_user_profiles_and_add_default_messaging_thread_id.sql",
);
const backfillMigration = join(
  process.cwd(),
  "supabase/migrations/20260421100003_backfill_telegram_connections_from_channel_mappings.sql",
);
const realtimeMigration = join(
  process.cwd(),
  "supabase/migrations/20260421100004_enable_realtime_for_messaging_channel_connections.sql",
);

function readSql(path: string) {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8");
}

describe("telegram user-scoped pairing migrations", () => {
  it("creates messaging_channel_connections with per-user ownership", () => {
    const sql = readSql(connectionMigration);
    expect(sql).toContain("CREATE TABLE public.messaging_channel_connections");
    expect(sql).toContain("user_id uuid NOT NULL");
    expect(sql).toContain("target_thread_id uuid NOT NULL");
    expect(sql).toContain("UNIQUE (user_id, channel)");
    expect(sql).toContain("UNIQUE (channel, external_conversation_id)");
    expect(sql).toContain("ALTER TABLE public.messaging_channel_connections ENABLE ROW LEVEL SECURITY");
  });

  it("creates telegram_pairing_sessions with deep-link tokens and display codes", () => {
    const sql = readSql(sessionMigration);
    expect(sql).toContain("CREATE TABLE public.telegram_pairing_sessions");
    expect(sql).toContain("deep_link_token text NOT NULL UNIQUE");
    expect(sql).toContain("display_code text NOT NULL UNIQUE");
    expect(sql).toContain("consumed_at timestamptz");
    expect(sql).toContain("ALTER TABLE public.telegram_pairing_sessions ENABLE ROW LEVEL SECURITY");
  });

  it("ensures user_profiles exists and adds default_messaging_thread_id", () => {
    const sql = readSql(profileMigration);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_profiles");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS default_messaging_thread_id uuid");
  });

  it("backfills telegram connections from the legacy channel mapping table", () => {
    const sql = readSql(backfillMigration);
    expect(sql).toContain("FROM public.conversation_channel_mappings");
    expect(sql).toContain("INSERT INTO public.messaging_channel_connections");
    expect(sql).toContain("WHERE channel = 'telegram'");
  });

  it("enables realtime for messaging_channel_connections", () => {
    const sql = readSql(realtimeMigration);
    expect(sql).toContain("messaging_channel_connections");
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_channel_connections");
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test:run supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations.test.ts
```

Expected: FAIL because the migration files do not exist yet.

**Step 3: Write the connection table migration**

Create `supabase/migrations/20260421100000_create_messaging_channel_connections.sql`:

```sql
CREATE TABLE public.messaging_channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_conversation_id text NOT NULL,
  target_thread_id uuid NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messaging_channel_connections_user_channel_unique UNIQUE (user_id, channel),
  CONSTRAINT messaging_channel_connections_channel_external_unique UNIQUE (channel, external_conversation_id)
);

CREATE INDEX idx_messaging_channel_connections_user_id
  ON public.messaging_channel_connections(user_id);

CREATE INDEX idx_messaging_channel_connections_client_id
  ON public.messaging_channel_connections(client_id);

ALTER TABLE public.messaging_channel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY messaging_channel_connections_select_own
  ON public.messaging_channel_connections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY messaging_channel_connections_insert_own
  ON public.messaging_channel_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY messaging_channel_connections_update_own
  ON public.messaging_channel_connections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY messaging_channel_connections_delete_own
  ON public.messaging_channel_connections
  FOR DELETE
  USING (auth.uid() = user_id);
```

**Step 4: Write the pairing-session migration**

Create `supabase/migrations/20260421100001_create_telegram_pairing_sessions.sql`:

```sql
CREATE TABLE public.telegram_pairing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  target_thread_id uuid NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  deep_link_token text NOT NULL UNIQUE,
  display_code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_pairing_sessions_user_id
  ON public.telegram_pairing_sessions(user_id);

ALTER TABLE public.telegram_pairing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_pairing_sessions_select_own
  ON public.telegram_pairing_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY telegram_pairing_sessions_insert_own
  ON public.telegram_pairing_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY telegram_pairing_sessions_update_own
  ON public.telegram_pairing_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY telegram_pairing_sessions_delete_own
  ON public.telegram_pairing_sessions
  FOR DELETE
  USING (auth.uid() = user_id);
```

**Step 5: Ensure `user_profiles` exists locally and add the default thread column**

Create `supabase/migrations/20260421100002_ensure_user_profiles_and_add_default_messaging_thread_id.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_config_id uuid REFERENCES public.clients(client_id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND policyname = 'user_profiles_select_own'
  ) THEN
    CREATE POLICY user_profiles_select_own
      ON public.user_profiles
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND policyname = 'user_profiles_upsert_own'
  ) THEN
    CREATE POLICY user_profiles_upsert_own
      ON public.user_profiles
      FOR ALL
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS default_messaging_thread_id uuid
    REFERENCES public.conversation_threads(thread_id) ON DELETE SET NULL;
```

**Step 6: Write the backfill migration**

Create `supabase/migrations/20260421100003_backfill_telegram_connections_from_channel_mappings.sql`:

```sql
INSERT INTO public.messaging_channel_connections (
  user_id,
  client_id,
  channel,
  external_conversation_id,
  target_thread_id
)
SELECT
  c.user_id,
  c.client_id,
  m.channel,
  m.external_conversation_id,
  m.thread_id
FROM public.conversation_channel_mappings AS m
JOIN public.clients AS c
  ON c.client_id = m.client_id
WHERE m.channel = 'telegram'
ON CONFLICT (user_id, channel) DO NOTHING;

INSERT INTO public.user_profiles (id, default_messaging_thread_id)
SELECT
  c.user_id,
  m.thread_id
FROM public.conversation_channel_mappings AS m
JOIN public.clients AS c
  ON c.client_id = m.client_id
WHERE m.channel = 'telegram'
ON CONFLICT (id) DO UPDATE
SET default_messaging_thread_id = COALESCE(
  public.user_profiles.default_messaging_thread_id,
  EXCLUDED.default_messaging_thread_id
);
```

**Step 7: Enable Realtime for the new table**

Create `supabase/migrations/20260421100004_enable_realtime_for_messaging_channel_connections.sql`:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messaging_channel_connections'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.messaging_channel_connections;
  END IF;
END $$;
```

**Step 8: Run the migration contract test again**

Run:

```bash
pnpm test:run supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations.test.ts
```

Expected: PASS.

**Step 9: Regenerate database types**

If running inside Codex, use Supabase MCP `generate_typescript_types`.

If running manually, use:

```bash
pnpm dlx supabase gen types typescript --linked > src/types/database.ts
```

Then sanity-check that these tables/columns exist in `src/types/database.ts`:
- `messaging_channel_connections`
- `telegram_pairing_sessions`
- `user_profiles.default_messaging_thread_id`

**Step 10: Commit**

```bash
git add supabase/migrations \
        supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations.test.ts \
        src/types/database.ts
git commit -m "feat(telegram): add user-scoped pairing schema"
```

---

### Task 2: Add pairing-code helpers and user-scoped Telegram connection helpers

**Files:**
- Modify: `src/lib/channels/telegram/pairing.ts`
- Modify: `src/lib/channels/telegram/pairing.test.ts`
- Create: `src/lib/channels/telegram/user-connections.ts`
- Create: `src/lib/channels/telegram/user-connections.test.ts`
- Create: `src/lib/settings/profile/messaging-preferences.ts`
- Create: `src/lib/settings/profile/messaging-preferences.test.ts`

**Step 1: Write the failing tests for display codes**

Append to `src/lib/channels/telegram/pairing.test.ts`:

```typescript
import {
  generatePairingDisplayCode,
  isPairingDisplayCodeFormat,
} from "./pairing";

describe("generatePairingDisplayCode", () => {
  it("returns a human-friendly code with a dash", () => {
    expect(generatePairingDisplayCode()).toMatch(/^[A-Z0-9]{2}-[A-Z0-9]{6}$/);
  });

  it("generates unique values", () => {
    expect(generatePairingDisplayCode()).not.toBe(generatePairingDisplayCode());
  });
});

describe("isPairingDisplayCodeFormat", () => {
  it("accepts valid display codes", () => {
    expect(isPairingDisplayCodeFormat("GW-22E14A")).toBe(true);
  });

  it("rejects invalid display codes", () => {
    expect(isPairingDisplayCodeFormat("gw-22e14a")).toBe(false);
    expect(isPairingDisplayCodeFormat("bad code")).toBe(false);
  });
});
```

**Step 2: Run the pairing-helper test to verify it fails**

Run:

```bash
pnpm test:run src/lib/channels/telegram/pairing.test.ts
```

Expected: FAIL — missing exports.

**Step 3: Implement the display-code helpers**

Update `src/lib/channels/telegram/pairing.ts`:

```typescript
const DISPLAY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomDisplayCodeChunk(length: number): string {
  return Array.from({ length }, () =>
    DISPLAY_CODE_ALPHABET[Math.floor(Math.random() * DISPLAY_CODE_ALPHABET.length)],
  ).join("");
}

export function generatePairingDisplayCode(): string {
  return `${randomDisplayCodeChunk(2)}-${randomDisplayCodeChunk(6)}`;
}

export function isPairingDisplayCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{2}-[A-Z0-9]{6}$/.test(code);
}
```

**Step 4: Run the pairing-helper test to verify it passes**

Run:

```bash
pnpm test:run src/lib/channels/telegram/pairing.test.ts
```

Expected: PASS.

**Step 5: Write failing tests for the shared connection helpers**

Create `src/lib/channels/telegram/user-connections.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import {
  deleteTelegramConnectionForUser,
  getTelegramConnectionForUser,
  upsertTelegramConnectionForUser,
} from "./user-connections";

function createSupabase() {
  const maybeSingle = vi.fn();
  const updateSelectSingle = vi.fn();
  const updateEq = vi.fn(() => ({ select: () => ({ single: updateSelectSingle }) }));
  const insertSelectSingle = vi.fn();
  const insert = vi.fn(() => ({ select: () => ({ single: insertSelectSingle }) }));
  const deleteEqChannel = vi.fn();
  const deleteEqUser = vi.fn(() => ({ eq: deleteEqChannel }));
  const deleteRow = vi.fn(() => ({ eq: deleteEqUser }));
  const selectEqChannel = vi.fn(() => ({ maybeSingle }));
  const selectEqUser = vi.fn(() => ({ eq: selectEqChannel }));

  const from = vi.fn((table: string) => {
    if (table === "messaging_channel_connections") {
      return {
        select: vi.fn(() => ({ eq: selectEqUser })),
        insert,
        update: vi.fn(() => ({ eq: updateEq })),
        delete: deleteRow,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, maybeSingle, insert, insertSelectSingle, deleteEqUser, deleteEqChannel };
}

describe("getTelegramConnectionForUser", () => {
  it("loads the user's telegram connection row", async () => {
    const supabase = createSupabase();
    supabase.maybeSingle.mockResolvedValue({
      data: { external_conversation_id: "12345", target_thread_id: "thread-1" },
      error: null,
    });

    const result = await getTelegramConnectionForUser(supabase as never, "user-1");

    expect(result?.chatId).toBe("12345");
  });
});

describe("upsertTelegramConnectionForUser", () => {
  it("writes a telegram connection row with user, client, chat, and target thread", async () => {
    const supabase = createSupabase();
    supabase.insertSelectSingle.mockResolvedValue({ data: { id: "conn-1" }, error: null });

    await upsertTelegramConnectionForUser(supabase as never, {
      userId: "user-1",
      clientId: "client-1",
      chatId: "12345",
      targetThreadId: "thread-1",
    });

    expect(supabase.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      client_id: "client-1",
      channel: "telegram",
      external_conversation_id: "12345",
      target_thread_id: "thread-1",
    });
  });
});

describe("deleteTelegramConnectionForUser", () => {
  it("deletes the user's telegram connection row", async () => {
    const supabase = createSupabase();
    supabase.deleteEqChannel.mockResolvedValue({ error: null });

    await deleteTelegramConnectionForUser(supabase as never, "user-1");

    expect(supabase.deleteEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.deleteEqChannel).toHaveBeenCalledWith("channel", "telegram");
  });
});
```

**Step 6: Run the helper test to verify it fails**

Run:

```bash
pnpm test:run src/lib/channels/telegram/user-connections.test.ts
```

Expected: FAIL — file missing.

**Step 7: Implement the Telegram connection helper module**

Create `src/lib/channels/telegram/user-connections.ts`:

```typescript
/**
 * User-scoped Telegram connection helpers.
 * @module lib/channels/telegram/user-connections
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export async function getTelegramConnectionForUser(
  supabase: AppSupabase,
  userId: string,
) {
  const { data, error } = await supabase
    .from("messaging_channel_connections")
    .select("external_conversation_id, target_thread_id")
    .eq("user_id", userId)
    .eq("channel", "telegram")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    chatId: data.external_conversation_id,
    targetThreadId: data.target_thread_id,
  };
}

export async function upsertTelegramConnectionForUser(
  supabase: AppSupabase,
  input: {
    userId: string;
    clientId: string;
    chatId: string;
    targetThreadId: string;
  },
) {
  const { error } = await supabase.from("messaging_channel_connections").upsert({
    user_id: input.userId,
    client_id: input.clientId,
    channel: "telegram",
    external_conversation_id: input.chatId,
    target_thread_id: input.targetThreadId,
  });

  if (error) throw new Error(error.message);
}

export async function deleteTelegramConnectionForUser(
  supabase: AppSupabase,
  userId: string,
) {
  const { error } = await supabase
    .from("messaging_channel_connections")
    .delete()
    .eq("user_id", userId)
    .eq("channel", "telegram");

  if (error) throw new Error(error.message);
}
```

**Step 8: Write the failing tests for the profile-preferences helper**

Create `src/lib/settings/profile/messaging-preferences.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import {
  getTelegramReadiness,
  resolveDefaultMessagingThreadId,
} from "./messaging-preferences";

describe("getTelegramReadiness", () => {
  it("returns missing env keys when telegram is not configured", () => {
    expect(getTelegramReadiness({})).toEqual({
      isConfigured: false,
      missing: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"],
    });
  });
});

describe("resolveDefaultMessagingThreadId", () => {
  it("prefers the saved user preference, then falls back to primary thread", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "user_profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { default_messaging_thread_id: "thread-preferred" },
                    error: null,
                  }),
              }),
            }),
          };
        }

        if (table === "conversation_threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { thread_id: "thread-primary" },
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const result = await resolveDefaultMessagingThreadId(
      supabase as never,
      "user-1",
      "client-1",
    );

    expect(result).toBe("thread-preferred");
  });
});
```

**Step 9: Run the profile-helper test to verify it fails**

Run:

```bash
pnpm test:run src/lib/settings/profile/messaging-preferences.test.ts
```

Expected: FAIL — file missing.

**Step 10: Implement the profile-preferences helper**

Create `src/lib/settings/profile/messaging-preferences.ts`:

```typescript
/**
 * Profile-level messaging preference helpers.
 * @module lib/settings/profile/messaging-preferences
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export function getTelegramReadiness(
  env: NodeJS.ProcessEnv = process.env,
): { isConfigured: boolean; missing: string[] } {
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"].filter(
    (key) => !env[key]?.trim(),
  );

  return { isConfigured: missing.length === 0, missing };
}

export async function resolveDefaultMessagingThreadId(
  supabase: AppSupabase,
  userId: string,
  clientId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("default_messaging_thread_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.default_messaging_thread_id) {
    return profile.default_messaging_thread_id;
  }

  const { data: primaryThread, error } = await supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("client_id", clientId)
    .eq("is_primary", true)
    .maybeSingle();

  if (error || !primaryThread?.thread_id) {
    throw new Error("Could not resolve default messaging thread");
  }

  return primaryThread.thread_id;
}
```

**Step 11: Run all helper tests**

Run:

```bash
pnpm test:run src/lib/channels/telegram/pairing.test.ts
pnpm test:run src/lib/channels/telegram/user-connections.test.ts
pnpm test:run src/lib/settings/profile/messaging-preferences.test.ts
```

Expected: PASS.

**Step 12: Commit**

```bash
git add src/lib/channels/telegram/pairing.ts \
        src/lib/channels/telegram/pairing.test.ts \
        src/lib/channels/telegram/user-connections.ts \
        src/lib/channels/telegram/user-connections.test.ts \
        src/lib/settings/profile/messaging-preferences.ts \
        src/lib/settings/profile/messaging-preferences.test.ts
git commit -m "feat(telegram): add user-scoped pairing helpers"
```

---

### Task 3: Add the default-messaging-thread update route

**Files:**
- Create: `app/api/settings/profile/default-messaging-thread/route.ts`
- Create: `app/api/settings/profile/default-messaging-thread/route.test.ts`
- Modify: `src/lib/settings/profile/messaging-preferences.ts`
- Modify: `src/lib/settings/profile/messaging-preferences.test.ts`

**Step 1: Write the failing route tests**

Create `app/api/settings/profile/default-messaging-thread/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockResolveDefaultMessagingThreadId,
  mockUpdateDefaultMessagingThreadForUser,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockResolveDefaultMessagingThreadId: vi.fn(),
  mockUpdateDefaultMessagingThreadForUser: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/settings/profile/messaging-preferences", () => ({
  resolveDefaultMessagingThreadId: (...args: unknown[]) =>
    mockResolveDefaultMessagingThreadId(...args),
  updateDefaultMessagingThreadForUser: (...args: unknown[]) =>
    mockUpdateDefaultMessagingThreadForUser(...args),
}));

import { GET, PUT } from "./route";

describe("default messaging thread route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current default thread id", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {},
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockResolveDefaultMessagingThreadId.mockResolvedValue("thread-1");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ defaultMessagingThreadId: "thread-1" });
  });

  it("updates the default thread id", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {},
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");

    const response = await PUT(
      new Request("http://localhost/api/settings/profile/default-messaging-thread", {
        method: "PUT",
        body: JSON.stringify({ defaultMessagingThreadId: "thread-2" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateDefaultMessagingThreadForUser).toHaveBeenCalledWith(
      {},
      "user-1",
      "client-1",
      "thread-2",
    );
  });
});
```

**Step 2: Run the route test to verify it fails**

Run:

```bash
pnpm test:run app/api/settings/profile/default-messaging-thread/route.test.ts
```

Expected: FAIL — route missing.

**Step 3: Add the update helper**

Append to `src/lib/settings/profile/messaging-preferences.ts`:

```typescript
export async function updateDefaultMessagingThreadForUser(
  supabase: AppSupabase,
  userId: string,
  clientId: string,
  defaultMessagingThreadId: string,
) {
  const { error: profileError } = await supabase.from("user_profiles").upsert({
    id: userId,
    default_messaging_thread_id: defaultMessagingThreadId,
  });

  if (profileError) throw new Error(profileError.message);

  const { data: connection } = await supabase
    .from("messaging_channel_connections")
    .select("external_conversation_id")
    .eq("user_id", userId)
    .eq("channel", "telegram")
    .maybeSingle();

  if (!connection?.external_conversation_id) {
    return;
  }

  const { error: mappingError } = await supabase
    .from("conversation_channel_mappings")
    .update({ thread_id: defaultMessagingThreadId })
    .eq("client_id", clientId)
    .eq("channel", "telegram")
    .eq("external_conversation_id", connection.external_conversation_id);

  if (mappingError) throw new Error(mappingError.message);

  const { error: connectionError } = await supabase
    .from("messaging_channel_connections")
    .update({ target_thread_id: defaultMessagingThreadId })
    .eq("user_id", userId)
    .eq("channel", "telegram");

  if (connectionError) throw new Error(connectionError.message);
}
```

**Step 4: Add the route**

Create `app/api/settings/profile/default-messaging-thread/route.ts`:

```typescript
/**
 * Read and update the authenticated user's default messaging thread.
 * @module app/api/settings/profile/default-messaging-thread/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  resolveDefaultMessagingThreadId,
  updateDefaultMessagingThreadForUser,
} from "@/lib/settings/profile/messaging-preferences";

const putBodySchema = z.object({
  defaultMessagingThreadId: z.string().uuid(),
});

export async function GET(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;

  try {
    const clientId = await resolveClientId(authResult.supabase, authResult.userId);
    const defaultMessagingThreadId = await resolveDefaultMessagingThreadId(
      authResult.supabase,
      authResult.userId,
      clientId,
    );

    return Response.json({ defaultMessagingThreadId });
  } catch {
    return jsonError("Failed to load default messaging thread.", 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  let body: z.infer<typeof putBodySchema>;

  try {
    body = putBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;

  try {
    const clientId = await resolveClientId(authResult.supabase, authResult.userId);
    await updateDefaultMessagingThreadForUser(
      authResult.supabase,
      authResult.userId,
      clientId,
      body.defaultMessagingThreadId,
    );

    return Response.json({ success: true });
  } catch {
    return jsonError("Failed to update default messaging thread.", 500);
  }
}
```

**Step 5: Run the route test**

Run:

```bash
pnpm test:run app/api/settings/profile/default-messaging-thread/route.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add app/api/settings/profile/default-messaging-thread/route.ts \
        app/api/settings/profile/default-messaging-thread/route.test.ts \
        src/lib/settings/profile/messaging-preferences.ts \
        src/lib/settings/profile/messaging-preferences.test.ts
git commit -m "feat(telegram): add default messaging thread route"
```

---

### Task 4: Rewrite the pairing-link API for user-scoped sessions

**Files:**
- Modify: `app/api/telegram/generate-pairing-link/route.ts`
- Modify: `app/api/telegram/generate-pairing-link/route.test.ts`
- Modify: `src/lib/settings/profile/messaging-preferences.ts`

**Step 1: Write failing tests for the new response shape**

Append to `app/api/telegram/generate-pairing-link/route.test.ts`:

```typescript
it("returns botUsername, openUrl, displayCode, and expiry for a user-scoped pairing session", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-21T10:00:00.000Z"));

  const deleteEqUser = vi.fn().mockResolvedValue({ error: null });
  const deleteRow = vi.fn(() => ({ eq: deleteEqUser }));
  const insert = vi.fn().mockResolvedValue({ error: null });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "telegram_pairing_sessions") {
        return { delete: deleteRow, insert };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  mockAuthenticateRequest.mockResolvedValue({
    kind: "ok",
    supabase,
    userId: "user-1",
  });
  mockResolveClientId.mockResolvedValue("client-1");
  mockGetBotUsername.mockResolvedValue("SunderBot");
  mockGeneratePairingToken.mockReturnValue("deep-link-token");

  const response = await POST();

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    botUsername: "SunderBot",
    openUrl: "https://t.me/SunderBot?start=deep-link-token",
    displayCode: expect.stringMatching(/^[A-Z0-9]{2}-[A-Z0-9]{6}$/),
    expiresInSeconds: 600,
  });

  vi.useRealTimers();
});
```

**Step 2: Run the route test to verify it fails**

Run:

```bash
pnpm test:run app/api/telegram/generate-pairing-link/route.test.ts
```

Expected: FAIL because the route still writes `telegram_pairing_tokens` and returns `url`.

**Step 3: Update the route implementation**

Rewrite `app/api/telegram/generate-pairing-link/route.ts` so it:

- resolves `clientId`
- resolves the default messaging thread
- checks readiness
- deletes stale sessions by `user_id`
- inserts `telegram_pairing_sessions`
- returns the new response shape

Use this target structure:

```typescript
const targetThreadId = await resolveDefaultMessagingThreadId(
  authResult.supabase,
  authResult.userId,
  clientId,
);

const token = generatePairingToken();
const displayCode = generatePairingDisplayCode();
const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS).toISOString();

await authResult.supabase
  .from("telegram_pairing_sessions")
  .delete()
  .eq("user_id", authResult.userId);

await authResult.supabase
  .from("telegram_pairing_sessions")
  .insert({
    user_id: authResult.userId,
    client_id: clientId,
    target_thread_id: targetThreadId,
    deep_link_token: token,
    display_code: displayCode,
    expires_at: expiresAt,
  });

return Response.json({
  botUsername: username,
  openUrl: `https://t.me/${username}?start=${token}`,
  displayCode,
  expiresInSeconds: PAIRING_TOKEN_TTL_MS / 1000,
});
```

**Step 4: Run the route test**

Run:

```bash
pnpm test:run app/api/telegram/generate-pairing-link/route.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/api/telegram/generate-pairing-link/route.ts \
        app/api/telegram/generate-pairing-link/route.test.ts \
        src/lib/settings/profile/messaging-preferences.ts
git commit -m "feat(telegram): create user-scoped pairing sessions"
```

---

### Task 5: Rewrite the Telegram webhook and disconnect flow for user ownership

**Files:**
- Modify: `app/api/webhook/telegram/route.ts`
- Modify: `app/api/webhook/telegram/__tests__/route.test.ts`
- Modify: `app/api/telegram/disconnect/route.ts`
- Modify: `app/api/telegram/disconnect/route.test.ts`
- Modify: `src/lib/channels/telegram/user-connections.ts`

**Step 1: Write the failing webhook tests for token/code pairing**

Append focused tests to `app/api/webhook/telegram/__tests__/route.test.ts`:

```typescript
it("pairs via /start deep-link token into the user-scoped connection table", async () => {
  // Add a config case where telegram_pairing_sessions returns:
  // { user_id, client_id, target_thread_id, deep_link_token, expires_at }
  // and assert inserts include messaging_channel_connections and conversation_channel_mappings.
});

it("pairs via plain-text display code for an unpaired chat", async () => {
  // Send a message body equal to GW-22E14A and assert the same inserts occur.
});

it("rejects pairing if the chat is already linked to another user", async () => {
  // Mock existing connection and assert Telegram receives "already connected".
});
```

Do not overbuild the test harness. Extend the existing mock `from(table)` switch with:
- `messaging_channel_connections`
- `telegram_pairing_sessions`

**Step 2: Run the webhook test to verify it fails**

Run:

```bash
pnpm test:run app/api/webhook/telegram/__tests__/route.test.ts -t "pairs via"
```

Expected: FAIL.

**Step 3: Rewrite the pairing branch in the webhook**

In `app/api/webhook/telegram/route.ts`, replace the current `telegram_pairing_tokens` logic with:

```typescript
async function resolvePairingSession(
  supabase: ReturnType<typeof createAdminClient> extends Promise<infer T> ? T : never,
  candidate: string,
) {
  const isDisplayCode = isPairingDisplayCodeFormat(candidate);
  const column = isDisplayCode ? "display_code" : "deep_link_token";

  const { data, error } = await supabase
    .from("telegram_pairing_sessions")
    .select("user_id, client_id, target_thread_id, expires_at, consumed_at")
    .eq(column, candidate)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.consumed_at) return null;
  if (new Date(data.expires_at) <= new Date()) return null;

  return data;
}
```

Then in `handleStartCommand`:
- accept either token or display code
- reject if the chat already exists in `messaging_channel_connections`
- upsert `messaging_channel_connections`
- upsert `conversation_channel_mappings`
- mark the pairing session consumed
- send `Connected`

Also add a plain-text guard in the main message handler:
- if the chat is unpaired and the incoming text matches `isPairingDisplayCodeFormat`, treat it as a pairing attempt
- otherwise reply with the existing "This chat is not connected" guidance

**Step 4: Rewrite disconnect to use the new connection table**

Update `app/api/telegram/disconnect/route.ts`:

- load connection via `messaging_channel_connections` and `user_id`
- clear pending Telegram questions for `external_conversation_id`
- delete the user's `messaging_channel_connections` row
- delete the matching `conversation_channel_mappings` row by `client_id`, `channel`, `external_conversation_id`

Use this target shape:

```typescript
const { data: connection } = await authResult.supabase
  .from("messaging_channel_connections")
  .select("external_conversation_id")
  .eq("user_id", authResult.userId)
  .eq("channel", "telegram")
  .maybeSingle();
```

**Step 5: Update the disconnect tests**

Change `app/api/telegram/disconnect/route.test.ts` so it expects:
- a read from `messaging_channel_connections`
- a delete from `messaging_channel_connections`
- a delete from `conversation_channel_mappings`

**Step 6: Run the focused webhook and disconnect tests**

Run:

```bash
pnpm test:run app/api/webhook/telegram/__tests__/route.test.ts
pnpm test:run app/api/telegram/disconnect/route.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add app/api/webhook/telegram/route.ts \
        app/api/webhook/telegram/__tests__/route.test.ts \
        app/api/telegram/disconnect/route.ts \
        app/api/telegram/disconnect/route.test.ts \
        src/lib/channels/telegram/user-connections.ts
git commit -m "feat(telegram): pair and disconnect by user ownership"
```

---

### Task 6: Move the Telegram UX into Profile settings and add the default thread picker

**Files:**
- Modify: `app/settings/profile/page.tsx`
- Create: `src/components/settings/profile/default-messaging-agent-form.tsx`
- Create: `src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx`
- Modify: `src/components/settings/messaging-channels/telegram-connect-row.tsx`
- Modify: `src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx`
- Modify: `app/settings/workspace/messaging-channels/page.tsx`
- Modify: `src/components/agent/telegram-cta-banner.tsx`
- Modify: `src/hooks/use-realtime.ts`
- Modify: `src/hooks/__tests__/use-realtime.test.tsx`

**Step 1: Write the failing test for the thread picker**

Create `src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultMessagingAgentForm } from "../default-messaging-agent-form";

describe("DefaultMessagingAgentForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }))));
  });

  it("submits the selected thread id", async () => {
    render(
      <DefaultMessagingAgentForm
        initialThreadId="thread-1"
        threads={[
          { threadId: "thread-1", title: "Agent" },
          { threadId: "thread-2", title: "Buyer follow-ups" },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "thread-2" },
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/settings/profile/default-messaging-thread",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ defaultMessagingThreadId: "thread-2" }),
        }),
      );
    });
  });
});
```

**Step 2: Run the thread-picker test to verify it fails**

Run:

```bash
pnpm test:run src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx
```

Expected: FAIL — component missing.

**Step 3: Implement the thread picker**

Create `src/components/settings/profile/default-messaging-agent-form.tsx`:

```typescript
/**
 * Selects the user's default messaging thread.
 * @module components/settings/profile/default-messaging-agent-form
 */
"use client";

import { useState } from "react";

export function DefaultMessagingAgentForm(input: {
  initialThreadId: string;
  threads: Array<{ threadId: string; title: string | null }>;
}) {
  const [value, setValue] = useState(input.initialThreadId);

  async function handleChange(nextValue: string) {
    setValue(nextValue);
    await fetch("/api/settings/profile/default-messaging-thread", {
      method: "PUT",
      body: JSON.stringify({ defaultMessagingThreadId: nextValue }),
    });
  }

  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">Default messaging agent</span>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
      >
        {input.threads.map((thread) => (
          <option key={thread.threadId} value={thread.threadId}>
            {thread.title ?? "Untitled thread"}
          </option>
        ))}
      </select>
    </label>
  );
}
```

**Step 4: Rewrite the Telegram connect row to the new response shape**

Update `src/components/settings/messaging-channels/telegram-connect-row.tsx`:

- query/subscription target should become `messaging_channel_connections`
- connected state still shows chat id
- waiting state should show:
  - bot username
  - display code
  - copy button
  - `Open Telegram`
- connect route should expect:

```typescript
interface PairingLinkResponse {
  botUsername: string;
  openUrl: string;
  displayCode: string;
  expiresInSeconds: number;
}
```

Minimal target body:

```tsx
<p className="text-muted-foreground">
  Send this code to @{botUsername} on Telegram:
</p>
<div className="flex items-center gap-2">
  <code className="rounded-md border px-3 py-2 font-mono">{displayCode}</code>
  <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
    Copy
  </Button>
</div>
<a href={openUrl} target="_blank" rel="noreferrer">Open in Telegram</a>
```

**Step 5: Update the connect-row tests**

Modify `src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx` so the success fixture becomes:

```typescript
JSON.stringify({
  botUsername: "SunderBot",
  openUrl: "https://t.me/SunderBot?start=abc123",
  displayCode: "GW-22E14A",
  expiresInSeconds: 600,
})
```

Then assert:
- `@SunderBot`
- `GW-22E14A`
- `Copy` button
- `Open Telegram` link

**Step 6: Add Realtime support for the new table**

Update `src/hooks/use-realtime.ts`:

```typescript
export type RealtimeTableName =
  | "conversation_threads"
  | "conversation_messages"
  | "conversation_channel_mappings"
  | "messaging_channel_connections"
  // ...
```

Update `src/hooks/__tests__/use-realtime.test.tsx` with a new test:

```typescript
test("supports messaging_channel_connections subscriptions", () => {
  const { wrapper } = createWrapper();

  renderHook(
    () =>
      useRealtimeTable({
        table: "messaging_channel_connections",
        filter: "user_id=eq.user-1",
        queryKeys: [["telegram", "connection", "user-1"]],
      }),
    { wrapper },
  );

  expect(mockChannelName).toHaveBeenCalledWith(
    "realtime:messaging_channel_connections:user_id=eq.user-1",
  );
});
```

**Step 7: Move the Profile page from stub to real content**

Update `app/settings/profile/page.tsx` to:

- create a server Supabase client
- authenticate the user
- resolve `clientId`
- load:
  - current default thread id
  - selectable threads
  - current Telegram connection
  - Telegram readiness
- render:
  - `DefaultMessagingAgentForm`
  - `TelegramConnectRow`

Use this rough shape:

```tsx
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const clientId = await resolveClientId(supabase, user.id);
  const initialData = await loadMessagingPreferencesPageData(supabase, user.id, clientId);

  return (
    <div className="space-y-6">
      <DefaultMessagingAgentForm
        initialThreadId={initialData.defaultMessagingThreadId}
        threads={initialData.threads}
      />
      <TelegramConnectRow
        clientId={clientId}
        userId={user.id}
        initialChatId={initialData.telegramConnection?.chatId ?? null}
        initialReadiness={initialData.telegramReadiness}
      />
    </div>
  );
}
```

**Step 8: Demote the workspace messaging page**

Update `app/settings/workspace/messaging-channels/page.tsx`:

- remove the functional Telegram DM row
- add copy that personal Telegram lives under Profile
- keep workspace-level placeholders only

Example copy:

```tsx
<p className="text-sm text-muted-foreground">
  Personal Telegram lives in Profile. This page is reserved for shared or workspace-level channels.
</p>
```

**Step 9: Update the agent CTA banner**

Change the link in `src/components/agent/telegram-cta-banner.tsx` to:

```tsx
<Link href="/settings/profile">Connect Telegram</Link>
```

**Step 10: Run the UI tests**

Run:

```bash
pnpm test:run src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx
pnpm test:run src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx
pnpm test:run src/hooks/__tests__/use-realtime.test.tsx
```

Expected: PASS.

**Step 11: Commit**

```bash
git add app/settings/profile/page.tsx \
        src/components/settings/profile/default-messaging-agent-form.tsx \
        src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx \
        src/components/settings/messaging-channels/telegram-connect-row.tsx \
        src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx \
        app/settings/workspace/messaging-channels/page.tsx \
        src/components/agent/telegram-cta-banner.tsx \
        src/hooks/use-realtime.ts \
        src/hooks/__tests__/use-realtime.test.tsx
git commit -m "feat(telegram): move personal pairing into profile settings"
```

---

### Task 7: Add the Telegram webhook setup helper and do final end-to-end verification

**Files:**
- Create: `src/lib/channels/telegram/webhook-setup.ts`
- Create: `src/lib/channels/telegram/webhook-setup.test.ts`
- Create: `scripts/setup-telegram-webhook.ts`
- Modify: `.env.example` only if any variable names drift from implementation

**Step 1: Write the failing helper test**

Create `src/lib/channels/telegram/webhook-setup.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildTelegramWebhookUrl, buildTelegramWebhookRequest } from "./webhook-setup";

describe("telegram webhook setup helpers", () => {
  it("builds the public webhook URL", () => {
    expect(buildTelegramWebhookUrl("https://app.trysunder.com")).toBe(
      "https://app.trysunder.com/api/webhook/telegram",
    );
  });

  it("builds the Bot API setWebhook request", () => {
    expect(
      buildTelegramWebhookRequest({
        token: "123:ABC",
        appUrl: "https://app.trysunder.com",
        secret: "telegram-secret",
      }),
    ).toEqual({
      url: "https://api.telegram.org/bot123:ABC/setWebhook",
      body: {
        url: "https://app.trysunder.com/api/webhook/telegram",
        secret_token: "telegram-secret",
      },
    });
  });
});
```

**Step 2: Run the helper test to verify it fails**

Run:

```bash
pnpm test:run src/lib/channels/telegram/webhook-setup.test.ts
```

Expected: FAIL — helper missing.

**Step 3: Implement the helper and script**

Create `src/lib/channels/telegram/webhook-setup.ts`:

```typescript
/**
 * Telegram webhook setup helpers.
 * @module lib/channels/telegram/webhook-setup
 */
export function buildTelegramWebhookUrl(appUrl: string): string {
  return new URL("/api/webhook/telegram", appUrl).toString();
}

export function buildTelegramWebhookRequest(input: {
  token: string;
  appUrl: string;
  secret: string;
}) {
  return {
    url: `https://api.telegram.org/bot${input.token}/setWebhook`,
    body: {
      url: buildTelegramWebhookUrl(input.appUrl),
      secret_token: input.secret,
    },
  };
}
```

Create `scripts/setup-telegram-webhook.ts`:

```typescript
/**
 * Register the Telegram webhook for the current environment.
 * @module scripts/setup-telegram-webhook
 */
import { buildTelegramWebhookRequest } from "@/lib/channels/telegram/webhook-setup";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

if (!token || !secret || !appUrl) {
  console.error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, and NEXT_PUBLIC_APP_URL");
  process.exit(1);
}

const request = buildTelegramWebhookRequest({ token, appUrl, secret });
const response = await fetch(request.url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request.body),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));
```

**Step 4: Run the helper test**

Run:

```bash
pnpm test:run src/lib/channels/telegram/webhook-setup.test.ts
```

Expected: PASS.

**Step 5: Run the full focused suite**

Run:

```bash
pnpm test:run supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations.test.ts
pnpm test:run src/lib/channels/telegram/pairing.test.ts
pnpm test:run src/lib/channels/telegram/user-connections.test.ts
pnpm test:run src/lib/settings/profile/messaging-preferences.test.ts
pnpm test:run app/api/settings/profile/default-messaging-thread/route.test.ts
pnpm test:run app/api/telegram/generate-pairing-link/route.test.ts
pnpm test:run app/api/telegram/disconnect/route.test.ts
pnpm test:run app/api/webhook/telegram/__tests__/route.test.ts
pnpm test:run src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx
pnpm test:run src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx
pnpm test:run src/hooks/__tests__/use-realtime.test.tsx
```

Expected: PASS.

**Step 6: Run repo-wide safety checks**

Run:

```bash
pnpm lint
pnpm exec tsc --noEmit
```

Expected: PASS.

**Step 7: Manual verification**

1. Start the app:

```bash
pnpm dev
```

2. Set a public app URL, then register the webhook:

```bash
NEXT_PUBLIC_APP_URL=https://<your-ngrok-subdomain>.ngrok.io \
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_WEBHOOK_SECRET=... \
pnpm tsx scripts/setup-telegram-webhook.ts
```

3. Log in and open `/settings/profile`.
4. Confirm you can pick a default messaging thread.
5. Click `Connect Telegram`.
6. Confirm the UI shows:
   - bot username
   - short code
   - copy button
   - open link
7. Complete pairing in Telegram by either:
   - opening the deep link
   - or sending the copied code
8. Confirm the page flips to `Connected` without a refresh.
9. Send a message from Telegram and confirm it lands in the selected default thread.
10. Change the default messaging thread and confirm future Telegram replies route there.
11. Disconnect and confirm the UI returns to `Connect`.

**Step 8: Commit**

```bash
git add src/lib/channels/telegram/webhook-setup.ts \
        src/lib/channels/telegram/webhook-setup.test.ts \
        scripts/setup-telegram-webhook.ts \
        .env.example
git commit -m "feat(telegram): add webhook setup helper and verification tooling"
```

---

## Final Notes

- Do not invent a workspace-sharing model. Telegram DM is personal in this feature.
- Do not replace `conversation_channel_mappings`. Keep it as routing state and keep it in sync.
- Do not add a separate cancel API for pairing unless tests show the orphan-session TTL is a real problem.
- Do not add multiple Telegram accounts per user.
- If any DB shape differs from the assumptions above, stop and use `@systematic-debugging` before making compensating changes.

## Execution Handoff

Tasklist complete and saved to `docs/tasks/2026-04-21-user-scoped-telegram-pairing-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint.
