# PR 3: Clients + Conversation Threads + Messages DB Schema — Implementation Plan

**Goal:** Create the foundational database schema (clients, conversation_threads, conversation_messages, runs) with RLS policies, plus TypeScript data access layer and React hooks to persist chat messages and threads to the database.

**Architecture:** Five new Postgres tables with RLS scoped by `client_id`. A database trigger auto-creates `clients` rows on auth signup. All other tables FK to `client_id`, never `auth.uid()` directly. The data access layer wraps Supabase queries behind typed functions. React hooks use TanStack Query for caching and invalidation. Thread rail and chat persistence wire into the UI built in PRs 1-2.

**Tech Stack:** Supabase (Postgres + RLS), Zod 4, TypeScript, TanStack Query, Vitest, React Testing Library

**Prerequisites:** PRs 1-2 must be completed first (AI Gateway endpoint + Chat UI with streaming). Tasks 1-7 below are standalone (DB + data access). Tasks 8-9 modify the chat UI from PR 2.

**Architecture Decisions:**
- `DATA-03` — RLS via `client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid())`
- `DATA-09` — 23 v1 tables; this PR creates 4 of them + `clients` root entity
- `SESSION-01` — Simple UUID-based threads, web-only, no channel routing
- `RUNNER-08` — Run statuses: queued, running, completed, partial, failed, cancelled

**App Spec Sections:** §10.1 (Supabase Tables), §10.1.1 (Auth→Client Mapping), §11.1 (Thread Identity), §11.2 (Per-Thread Run Serialization)

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Task Overview

| Task | Component | TDD? | Depends On |
|------|-----------|------|------------|
| 1 | Zod Validation Schemas | Yes | — |
| 2 | SQL Migrations (5 tables + trigger) | Config (exception) | — |
| 3 | RLS Policies Migration | Config (exception) | Task 2 |
| 4 | TypeScript Database Types Update | Config (exception) | Task 2 |
| 5 | Test Infrastructure (Supabase Mock) | Yes | Task 1 |
| 6 | Client Resolution Helper | Yes | Tasks 1, 4, 5 |
| 7 | Thread Data Access Layer | Yes | Tasks 1, 4, 5 |
| 8 | Message Data Access Layer | Yes | Tasks 1, 4, 5 |
| 9 | React Hooks (useThreads + useMessages) | Yes | Tasks 6, 7 |
| 10 | Thread Rail + Chat Persistence | Yes | Task 9, PR 1, PR 2 |

---

### Task 1: Zod Validation Schemas

**Files:**
- Create: `src/lib/chat/schemas.ts`
- Test: `src/lib/chat/__tests__/schemas.test.ts`
- Reference: `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` (RUNNER-08 for run statuses)

**Context:** These schemas validate data shape for all 4 new tables plus the `clients` table. They're pure logic — no Supabase dependency — making them ideal for strict TDD. The `parts` field on messages matches Vercel AI SDK's `CoreMessage` part types (text, tool-call, tool-result). The `status` field on runs uses the 6 canonical statuses from RUNNER-08.

**Step 1: Write failing tests for all schemas**

```typescript
// src/lib/chat/__tests__/schemas.test.ts
import { describe, expect, test } from "vitest";
import {
  clientSchema,
  conversationThreadSchema,
  conversationMessageSchema,
  runSchema,
  runStatusValues,
  messageRoleValues,
  type Client,
  type ConversationThread,
  type ConversationMessage,
  type Run,
} from "../schemas";

describe("clientSchema", () => {
  test("validates a valid client row", () => {
    const valid = {
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      user_id: "660e8400-e29b-41d4-a716-446655440000",
      display_name: "John Doe",
      created_at: "2026-03-01T00:00:00Z",
    };
    expect(clientSchema.parse(valid)).toEqual(valid);
  });

  test("rejects missing client_id", () => {
    const invalid = {
      user_id: "660e8400-e29b-41d4-a716-446655440000",
      display_name: "John Doe",
      created_at: "2026-03-01T00:00:00Z",
    };
    expect(() => clientSchema.parse(invalid)).toThrow();
  });

  test("allows null display_name", () => {
    const valid = {
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      user_id: "660e8400-e29b-41d4-a716-446655440000",
      display_name: null,
      created_at: "2026-03-01T00:00:00Z",
    };
    expect(clientSchema.parse(valid)).toEqual(valid);
  });
});

describe("conversationThreadSchema", () => {
  test("validates a valid thread row", () => {
    const valid = {
      thread_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      title: "My first thread",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    expect(conversationThreadSchema.parse(valid)).toEqual(valid);
  });

  test("allows null title", () => {
    const valid = {
      thread_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      title: null,
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    expect(conversationThreadSchema.parse(valid)).toEqual(valid);
  });

  test("rejects missing client_id", () => {
    const invalid = {
      thread_id: "550e8400-e29b-41d4-a716-446655440000",
      title: "test",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    expect(() => conversationThreadSchema.parse(invalid)).toThrow();
  });
});

describe("conversationMessageSchema", () => {
  test("validates a user text message", () => {
    const valid = {
      message_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "user" as const,
      content: "Hello, agent!",
      parts: null,
      created_at: "2026-03-01T00:00:00Z",
    };
    expect(conversationMessageSchema.parse(valid)).toEqual(valid);
  });

  test("validates an assistant message with parts", () => {
    const valid = {
      message_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "assistant" as const,
      content: "I created the contact.",
      parts: [
        { type: "text", text: "I created the contact." },
        {
          type: "tool-call",
          toolCallId: "call_123",
          toolName: "create_contact",
          args: { first_name: "John" },
        },
      ],
      created_at: "2026-03-01T00:00:00Z",
    };
    expect(conversationMessageSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid role", () => {
    const invalid = {
      message_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "admin",
      content: "test",
      parts: null,
      created_at: "2026-03-01T00:00:00Z",
    };
    expect(() => conversationMessageSchema.parse(invalid)).toThrow();
  });
});

describe("runSchema", () => {
  test("validates a completed run", () => {
    const valid = {
      run_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      client_id: "770e8400-e29b-41d4-a716-446655440000",
      status: "completed" as const,
      model: "gemini-2.0-flash",
      tokens_in: 150,
      tokens_out: 200,
      created_at: "2026-03-01T00:00:00Z",
      completed_at: "2026-03-01T00:00:01Z",
    };
    expect(runSchema.parse(valid)).toEqual(valid);
  });

  test("allows null completed_at for running status", () => {
    const valid = {
      run_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      client_id: "770e8400-e29b-41d4-a716-446655440000",
      status: "running" as const,
      model: null,
      tokens_in: null,
      tokens_out: null,
      created_at: "2026-03-01T00:00:00Z",
      completed_at: null,
    };
    expect(runSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid status", () => {
    const invalid = {
      run_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      client_id: "770e8400-e29b-41d4-a716-446655440000",
      status: "paused",
      model: null,
      tokens_in: null,
      tokens_out: null,
      created_at: "2026-03-01T00:00:00Z",
      completed_at: null,
    };
    expect(() => runSchema.parse(invalid)).toThrow();
  });

  test("runStatusValues contains all 6 canonical statuses", () => {
    expect(runStatusValues).toEqual([
      "queued",
      "running",
      "completed",
      "partial",
      "failed",
      "cancelled",
    ]);
  });

  test("messageRoleValues contains 4 roles", () => {
    expect(messageRoleValues).toEqual(["system", "user", "assistant", "tool"]);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/chat/__tests__/schemas.test.ts
```

Expected: FAIL — `Cannot find module '../schemas'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/chat/schemas.ts
/**
 * Zod validation schemas for chat/conversation database tables.
 * Covers: clients, conversation_threads, conversation_messages, runs.
 * @module lib/chat/schemas
 */
import { z } from "zod/v4";

// --- Shared constants ---

/** Canonical run statuses from RUNNER-08 */
export const runStatusValues = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

/** Message roles matching Vercel AI SDK CoreMessage */
export const messageRoleValues = ["system", "user", "assistant", "tool"] as const;

// --- Clients ---

export const clientSchema = z.object({
  client_id: z.string().uuid(),
  user_id: z.string().uuid(),
  display_name: z.string().nullable(),
  created_at: z.string(),
});

export type Client = z.infer<typeof clientSchema>;

// --- Conversation Threads (SESSION-01) ---

export const conversationThreadSchema = z.object({
  thread_id: z.string().uuid(),
  client_id: z.string().uuid(),
  title: z.string().nullable(),
  is_pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ConversationThread = z.infer<typeof conversationThreadSchema>;

// --- Conversation Messages ---

export const conversationMessageSchema = z.object({
  message_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  role: z.enum(messageRoleValues),
  content: z.string().nullable(),
  parts: z.any().nullable(),
  created_at: z.string(),
});

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

// --- Runs (RUNNER-08) ---

export const runSchema = z.object({
  run_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  client_id: z.string().uuid(),
  status: z.enum(runStatusValues),
  model: z.string().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

export type Run = z.infer<typeof runSchema>;
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/chat/__tests__/schemas.test.ts
```

Expected: All 12 tests PASS

**Step 5: Commit**

```bash
git add src/lib/chat/schemas.ts src/lib/chat/__tests__/schemas.test.ts
git commit -m "feat(pr3): add Zod validation schemas for clients, threads, messages, runs"
```

---

### Task 2: SQL Migrations (5 Tables + Trigger)

**Files:**
- Create: `supabase/migrations/20260301000000_create_clients_table.sql`
- Create: `supabase/migrations/20260301000001_create_clients_trigger.sql`
- Create: `supabase/migrations/20260301000002_create_conversation_threads.sql`
- Create: `supabase/migrations/20260301000003_create_conversation_messages.sql`
- Create: `supabase/migrations/20260301000004_create_runs_table.sql`
- Reference: App Spec §10.1.1 (Auth→Client Mapping), §11.1 (Thread Identity)

**Context:** SQL migration files are configuration — TDD exception. Each migration creates one table (except the trigger migration). The `clients` table is the root entity; all other tables FK to `client_id`. A Postgres trigger auto-creates a `clients` row when a new auth user signs up. The `runs` table uses a custom enum type for the 6 canonical statuses (RUNNER-08).

**Step 1: Create clients table migration**

```sql
-- supabase/migrations/20260301000000_create_clients_table.sql
-- PR3: clients table — root entity for all user-owned data.
-- All other tables FK to client_id, never to auth.uid() directly (DATA-03).
-- v1: 1:1 mapping (user_id UNIQUE). v2+: drop unique for multi-user.

CREATE TABLE public.clients (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clients IS 'Root entity for tenant isolation. All data tables FK to client_id.';
COMMENT ON COLUMN public.clients.user_id IS '1:1 with auth.users in v1. Drop UNIQUE for multi-user in v2.';
```

**Step 2: Create auth trigger migration**

```sql
-- supabase/migrations/20260301000001_create_clients_trigger.sql
-- PR3: Auto-create clients row on auth.users INSERT (App Spec §10.1.1).
-- Uses raw_user_meta_data->>'display_name' if provided during signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.clients (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Auto-creates clients row on signup. display_name falls back to email.';
```

**Step 3: Create conversation_threads migration**

```sql
-- supabase/migrations/20260301000002_create_conversation_threads.sql
-- PR3: conversation_threads — simple UUID-based threads (SESSION-01).
-- Web-only for v1. No channel routing, no chat_identity_key.

CREATE TABLE public.conversation_threads (
  thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  title TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_threads_client_id ON public.conversation_threads(client_id);
CREATE INDEX idx_conversation_threads_updated_at ON public.conversation_threads(updated_at DESC);

COMMENT ON TABLE public.conversation_threads IS 'Chat threads. is_pinned used for Autopilot/Synthesis threads (Phase 2).';
```

**Step 4: Create conversation_messages migration**

```sql
-- supabase/migrations/20260301000003_create_conversation_messages.sql
-- PR3: conversation_messages — stores all messages in a thread.
-- parts JSONB stores Vercel AI SDK multi-part message format (text, tool-call, tool-result).

CREATE TABLE public.conversation_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT,
  parts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_messages_thread_id ON public.conversation_messages(thread_id);
CREATE INDEX idx_conversation_messages_created_at ON public.conversation_messages(thread_id, created_at);

COMMENT ON TABLE public.conversation_messages IS 'All messages in a thread. Source history never deleted (SESSION-07).';
COMMENT ON COLUMN public.conversation_messages.parts IS 'Vercel AI SDK CoreMessage parts: text, tool-call, tool-result JSONB array.';
```

**Step 5: Create runs table migration**

```sql
-- supabase/migrations/20260301000004_create_runs_table.sql
-- PR3: runs table — tracks each agent execution (RUNNER-08).
-- 6 statuses: queued, running (non-terminal), completed, partial, failed, cancelled (terminal).

CREATE TYPE public.run_status AS ENUM (
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
  'cancelled'
);

CREATE TABLE public.runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  status public.run_status NOT NULL DEFAULT 'queued',
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_runs_thread_id ON public.runs(thread_id);
CREATE INDEX idx_runs_client_id ON public.runs(client_id);
CREATE INDEX idx_runs_active ON public.runs(thread_id) WHERE status IN ('queued', 'running');

COMMENT ON TABLE public.runs IS 'Agent execution records. One active run per thread at a time (TRIG-06).';
COMMENT ON COLUMN public.runs.status IS 'RUNNER-08: queued/running (non-terminal), completed/partial/failed/cancelled (terminal).';
```

**Step 6: Verify migrations are syntactically valid**

```bash
# Check SQL syntax (no runtime execution — just verify files exist and are non-empty)
wc -l supabase/migrations/2026030100000*.sql
```

Expected: 5 files, each with content (non-zero line counts)

**Step 7: Commit**

```bash
git add supabase/migrations/20260301000000_create_clients_table.sql \
        supabase/migrations/20260301000001_create_clients_trigger.sql \
        supabase/migrations/20260301000002_create_conversation_threads.sql \
        supabase/migrations/20260301000003_create_conversation_messages.sql \
        supabase/migrations/20260301000004_create_runs_table.sql
git commit -m "feat(pr3): add SQL migrations for clients, threads, messages, runs tables"
```

---

### Task 3: RLS Policies Migration

**Files:**
- Create: `supabase/migrations/20260301000005_add_rls_policies.sql`
- Reference: `DATA-03` — RLS via `client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid())`

**Context:** All new tables use the canonical RLS pattern from DATA-03. The `clients` table itself uses `user_id = auth.uid()`. We create a reusable SQL function `get_my_client_id()` so every policy doesn't repeat the subquery.

**Step 1: Write RLS policies migration**

```sql
-- supabase/migrations/20260301000005_add_rls_policies.sql
-- PR3: RLS policies for all new tables (DATA-03).
-- Pattern: client_id = get_my_client_id() for data tables.
-- clients table: user_id = auth.uid() directly.

-- Helper function: resolve auth.uid() → client_id (used in all RLS policies)
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT client_id FROM public.clients WHERE user_id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_client_id() IS 'Resolves current auth user to client_id for RLS policies (DATA-03).';

-- clients: user can only see their own client row
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON public.clients
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY clients_update ON public.clients
  FOR UPDATE USING (user_id = auth.uid());

-- conversation_threads: scoped by client_id
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_threads_select ON public.conversation_threads
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY conversation_threads_insert ON public.conversation_threads
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY conversation_threads_update ON public.conversation_threads
  FOR UPDATE USING (client_id = public.get_my_client_id());

CREATE POLICY conversation_threads_delete ON public.conversation_threads
  FOR DELETE USING (client_id = public.get_my_client_id());

-- conversation_messages: scoped by thread ownership (join through thread → client_id)
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_messages_select ON public.conversation_messages
  FOR SELECT USING (
    thread_id IN (
      SELECT thread_id FROM public.conversation_threads
      WHERE client_id = public.get_my_client_id()
    )
  );

CREATE POLICY conversation_messages_insert ON public.conversation_messages
  FOR INSERT WITH CHECK (
    thread_id IN (
      SELECT thread_id FROM public.conversation_threads
      WHERE client_id = public.get_my_client_id()
    )
  );

-- runs: scoped by client_id
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY runs_select ON public.runs
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY runs_insert ON public.runs
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY runs_update ON public.runs
  FOR UPDATE USING (client_id = public.get_my_client_id());
```

**Step 2: Verify file exists and is non-empty**

```bash
wc -l supabase/migrations/20260301000005_add_rls_policies.sql
```

Expected: Non-zero line count

**Step 3: Commit**

```bash
git add supabase/migrations/20260301000005_add_rls_policies.sql
git commit -m "feat(pr3): add RLS policies for all new tables using DATA-03 pattern"
```

---

### Task 4: TypeScript Database Types Update

**Files:**
- Modify: `src/types/database.ts`
- Reference: Task 2 migration schemas

**Context:** The `Database` type in `src/types/database.ts` is used by both browser and server Supabase clients for type safety. We add the 4 new tables (`clients`, `conversation_threads`, `conversation_messages`, `runs`) plus the `get_my_client_id` function and `run_status` enum. This is a generated-style type file — TDD exception (types are validated at compile time, not runtime).

**Step 1: Add new table types to database.ts**

Add the following inside `public.Tables` (after the existing `whatsapp_messages` table, before the closing `}`):

```typescript
      clients: {
        Row: {
          client_id: string
          user_id: string
          display_name: string | null
          created_at: string
        }
        Insert: {
          client_id?: string
          user_id: string
          display_name?: string | null
          created_at?: string
        }
        Update: {
          client_id?: string
          user_id?: string
          display_name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      conversation_threads: {
        Row: {
          thread_id: string
          client_id: string
          title: string | null
          is_pinned: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          thread_id?: string
          client_id: string
          title?: string | null
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          thread_id?: string
          client_id?: string
          title?: string | null
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          message_id: string
          thread_id: string
          role: string
          content: string | null
          parts: Json | null
          created_at: string
        }
        Insert: {
          message_id?: string
          thread_id: string
          role: string
          content?: string | null
          parts?: Json | null
          created_at?: string
        }
        Update: {
          message_id?: string
          thread_id?: string
          role?: string
          content?: string | null
          parts?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      runs: {
        Row: {
          run_id: string
          thread_id: string
          client_id: string
          status: Database["public"]["Enums"]["run_status"]
          model: string | null
          tokens_in: number | null
          tokens_out: number | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          run_id?: string
          thread_id: string
          client_id: string
          status?: Database["public"]["Enums"]["run_status"]
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          run_id?: string
          thread_id?: string
          client_id?: string
          status?: Database["public"]["Enums"]["run_status"]
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
          {
            foreignKeyName: "runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
```

Also add the `run_status` enum inside `public.Enums`:

```typescript
    Enums: {
      run_status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled"
    }
```

Also add `get_my_client_id` inside `public.Functions`:

```typescript
    Functions: {
      get_my_client_config: { Args: never; Returns: string }
      get_my_client_id: { Args: never; Returns: string }
    }
```

Also update `Constants` to include the new enum:

```typescript
export const Constants = {
  public: {
    Enums: {
      run_status: ["queued", "running", "completed", "partial", "failed", "cancelled"],
    },
  },
} as const;
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to the new types (existing errors unrelated to this PR are OK)

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(pr3): add TypeScript types for clients, threads, messages, runs tables"
```

---

### Task 5: Test Infrastructure (Supabase Mock)

**Files:**
- Create: `src/test/mocks/supabase.ts`
- Test: `src/test/__tests__/supabase-mock.test.ts`

**Context:** All data access functions use the Supabase client. For unit tests, we need a mock that simulates Supabase's chainable query builder (`.from().select().eq().order()`). This mock is reusable across all future tests. It returns predictable data and tracks calls.

**Step 1: Write failing test for the mock helper**

```typescript
// src/test/__tests__/supabase-mock.test.ts
import { describe, expect, test } from "vitest";
import { createMockSupabaseClient, type MockSupabaseClient } from "../mocks/supabase";

describe("createMockSupabaseClient", () => {
  test("returns a mock client with .from() method", () => {
    const mock = createMockSupabaseClient();
    expect(mock.from).toBeDefined();
    expect(typeof mock.from).toBe("function");
  });

  test("select query returns configured data", async () => {
    const mockData = [{ thread_id: "abc", title: "Test" }];
    const mock = createMockSupabaseClient({
      selectResult: { data: mockData, error: null },
    });

    const result = await mock
      .from("conversation_threads")
      .select("*")
      .eq("client_id", "123")
      .order("updated_at", { ascending: false });

    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  test("insert query returns configured data", async () => {
    const mockData = [{ thread_id: "new-id", title: "New Thread" }];
    const mock = createMockSupabaseClient({
      insertResult: { data: mockData, error: null },
    });

    const result = await mock
      .from("conversation_threads")
      .insert({ client_id: "123", title: "New Thread" })
      .select()
      .single();

    expect(result.data).toEqual(mockData[0]);
    expect(result.error).toBeNull();
  });

  test("returns error when configured", async () => {
    const mockError = { message: "RLS violation", code: "42501" };
    const mock = createMockSupabaseClient({
      selectResult: { data: null, error: mockError },
    });

    const result = await mock
      .from("conversation_threads")
      .select("*");

    expect(result.data).toBeNull();
    expect(result.error).toEqual(mockError);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/__tests__/supabase-mock.test.ts
```

Expected: FAIL — `Cannot find module '../mocks/supabase'`

**Step 3: Write minimal implementation**

```typescript
// src/test/mocks/supabase.ts
/**
 * Reusable mock for Supabase client in unit tests.
 * Simulates chainable query builder: .from().select().eq().order() etc.
 * @module test/mocks/supabase
 */

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockConfig {
  selectResult?: MockResult;
  insertResult?: MockResult;
  updateResult?: MockResult;
  deleteResult?: MockResult;
}

/** Chainable query builder mock */
function createChainableQuery(result: MockResult) {
  const chain: Record<string, unknown> = {};

  const chainMethods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "gt",
    "lt",
    "gte",
    "lte",
    "like",
    "ilike",
    "in",
    "is",
    "order",
    "limit",
    "range",
    "match",
    "not",
    "filter",
    "contains",
    "containedBy",
    "textSearch",
    "maybeSingle",
  ];

  for (const method of chainMethods) {
    chain[method] = () => chain;
  }

  /** .single() resolves the chain and returns { data: first item, error } */
  chain.single = () =>
    Promise.resolve({
      data: Array.isArray(result.data) ? result.data[0] : result.data,
      error: result.error,
    });

  /** .then() makes the chain awaitable directly */
  chain.then = (resolve: (value: MockResult) => void) =>
    resolve(result);

  return chain;
}

export interface MockSupabaseClient {
  from: (table: string) => Record<string, unknown>;
}

export function createMockSupabaseClient(config: MockConfig = {}): MockSupabaseClient {
  const defaultResult: MockResult = { data: [], error: null };

  return {
    from: () => {
      const selectChain = createChainableQuery(config.selectResult ?? defaultResult);
      const insertChain = createChainableQuery(config.insertResult ?? defaultResult);
      const updateChain = createChainableQuery(config.updateResult ?? defaultResult);
      const deleteChain = createChainableQuery(config.deleteResult ?? defaultResult);

      return {
        select: () => selectChain,
        insert: () => insertChain,
        update: () => updateChain,
        delete: () => deleteChain,
        eq: () => selectChain,
        order: () => selectChain,
        limit: () => selectChain,
        single: () =>
          Promise.resolve({
            data: Array.isArray((config.selectResult ?? defaultResult).data)
              ? (config.selectResult ?? defaultResult).data?.[0]
              : (config.selectResult ?? defaultResult).data,
            error: (config.selectResult ?? defaultResult).error,
          }),
      };
    },
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/__tests__/supabase-mock.test.ts
```

Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/test/mocks/supabase.ts src/test/__tests__/supabase-mock.test.ts
git commit -m "feat(pr3): add reusable Supabase mock for unit tests"
```

---

### Task 6: Client Resolution Helper

**Files:**
- Create: `src/lib/chat/client-resolver.ts`
- Test: `src/lib/chat/__tests__/client-resolver.test.ts`

**Context:** Every data access function needs the current user's `client_id`. This helper wraps the `get_my_client_id()` RPC call (from Task 3's migration). It's called once per request/render and cached. Falls back to a direct query if the RPC isn't available.

**Step 1: Write failing test**

```typescript
// src/lib/chat/__tests__/client-resolver.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";
import { getClientId } from "../client-resolver";

// Mock the server supabase client
const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs);
            return { single: () => mockSingle() };
          },
        };
      },
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      }),
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getClientId", () => {
  test("returns client_id from RPC call", async () => {
    mockRpc.mockResolvedValue({
      data: "client-456",
      error: null,
    });

    const result = await getClientId();
    expect(result).toBe("client-456");
    expect(mockRpc).toHaveBeenCalledWith("get_my_client_id");
  });

  test("falls back to direct query if RPC fails", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });
    mockSingle.mockResolvedValue({
      data: { client_id: "client-789" },
      error: null,
    });

    const result = await getClientId();
    expect(result).toBe("client-789");
  });

  test("throws when both RPC and fallback fail", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "no rows" },
    });

    await expect(getClientId()).rejects.toThrow("Could not resolve client_id");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/chat/__tests__/client-resolver.test.ts
```

Expected: FAIL — `Cannot find module '../client-resolver'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/chat/client-resolver.ts
/**
 * Resolves the current authenticated user's client_id.
 * Uses the get_my_client_id() RPC function (DATA-03 pattern).
 * Falls back to direct query if RPC is unavailable.
 * @module lib/chat/client-resolver
 */
import { createClient } from "@/lib/supabase/server";

/**
 * Get the client_id for the currently authenticated user.
 * Calls the get_my_client_id() Postgres function (set up in RLS migration).
 * @throws Error if client_id cannot be resolved (user not authenticated or no client row).
 */
export async function getClientId(): Promise<string> {
  const supabase = await createClient();

  // Primary path: use RPC function
  const { data: clientId, error: rpcError } = await supabase.rpc("get_my_client_id");

  if (!rpcError && clientId) {
    return clientId as string;
  }

  // Fallback: direct query
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Could not resolve client_id: user not authenticated");
  }

  const { data: client, error: queryError } = await supabase
    .from("clients")
    .select("client_id")
    .eq("user_id", user.id)
    .single();

  if (queryError || !client) {
    throw new Error("Could not resolve client_id: no client row found");
  }

  return client.client_id;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/chat/__tests__/client-resolver.test.ts
```

Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/lib/chat/client-resolver.ts src/lib/chat/__tests__/client-resolver.test.ts
git commit -m "feat(pr3): add client resolution helper with RPC + fallback"
```

---

### Task 7: Thread Data Access Layer

**Files:**
- Create: `src/lib/chat/threads.ts`
- Test: `src/lib/chat/__tests__/threads.test.ts`

**Context:** CRUD operations for `conversation_threads`. Used by both server components (listing threads) and React hooks (creating/updating threads). Each function takes a Supabase client as a parameter (dependency injection) so it works with both browser and server clients, and is testable with the mock from Task 5.

**Step 1: Write failing tests**

```typescript
// src/lib/chat/__tests__/threads.test.ts
import { describe, expect, test, vi } from "vitest";
import {
  listThreads,
  createThread,
  getThread,
  updateThreadTitle,
} from "../threads";

/**
 * Creates a mock Supabase client that returns configurable results.
 * Each test configures the exact response it expects.
 */
function mockClient(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: Array.isArray(result.data) ? result.data[0] : result.data,
      error: result.error,
    }),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

describe("listThreads", () => {
  test("returns threads ordered by updated_at desc", async () => {
    const threads = [
      { thread_id: "t1", client_id: "c1", title: "Thread 1", is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T01:00:00Z" },
      { thread_id: "t2", client_id: "c1", title: "Thread 2", is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:30:00Z" },
    ];
    const client = mockClient({ data: threads, error: null });

    const result = await listThreads(client as any, "c1");

    expect(result).toEqual(threads);
    expect(client.from).toHaveBeenCalledWith("conversation_threads");
    expect(client._chain.eq).toHaveBeenCalledWith("client_id", "c1");
    expect(client._chain.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  test("throws on error", async () => {
    const client = mockClient({ data: null, error: { message: "RLS violation" } });

    await expect(listThreads(client as any, "c1")).rejects.toThrow("RLS violation");
  });
});

describe("createThread", () => {
  test("creates a thread with title and returns it", async () => {
    const newThread = {
      thread_id: "t-new",
      client_id: "c1",
      title: "New Thread",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const client = mockClient({ data: newThread, error: null });

    const result = await createThread(client as any, "c1", "New Thread");

    expect(result).toEqual(newThread);
    expect(client.from).toHaveBeenCalledWith("conversation_threads");
    expect(client._chain.insert).toHaveBeenCalledWith({
      client_id: "c1",
      title: "New Thread",
    });
  });

  test("creates a thread with null title (auto-generated later)", async () => {
    const newThread = {
      thread_id: "t-new",
      client_id: "c1",
      title: null,
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const client = mockClient({ data: newThread, error: null });

    const result = await createThread(client as any, "c1");

    expect(result).toEqual(newThread);
    expect(client._chain.insert).toHaveBeenCalledWith({
      client_id: "c1",
      title: null,
    });
  });
});

describe("getThread", () => {
  test("returns a single thread by ID", async () => {
    const thread = {
      thread_id: "t1",
      client_id: "c1",
      title: "Test",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const client = mockClient({ data: thread, error: null });

    const result = await getThread(client as any, "t1");

    expect(result).toEqual(thread);
    expect(client._chain.eq).toHaveBeenCalledWith("thread_id", "t1");
  });
});

describe("updateThreadTitle", () => {
  test("updates the title and returns the updated thread", async () => {
    const updated = {
      thread_id: "t1",
      client_id: "c1",
      title: "Renamed",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const client = mockClient({ data: updated, error: null });

    const result = await updateThreadTitle(client as any, "t1", "Renamed");

    expect(result).toEqual(updated);
    expect(client._chain.update).toHaveBeenCalledWith({
      title: "Renamed",
      updated_at: expect.any(String),
    });
    expect(client._chain.eq).toHaveBeenCalledWith("thread_id", "t1");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/chat/__tests__/threads.test.ts
```

Expected: FAIL — `Cannot find module '../threads'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/chat/threads.ts
/**
 * Data access functions for conversation_threads table.
 * All functions take a Supabase client as first parameter (DI for testability).
 * @module lib/chat/threads
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ConversationThread } from "./schemas";

type Client = SupabaseClient<Database>;
type ThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

/**
 * List all threads for a client, ordered by most recently updated.
 */
export async function listThreads(
  supabase: Client,
  clientId: string
): Promise<ThreadRow[]> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Create a new conversation thread.
 * Title can be null — the agent or UI generates it after the first message.
 */
export async function createThread(
  supabase: Client,
  clientId: string,
  title: string | null = null
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .insert({ client_id: clientId, title })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Get a single thread by ID.
 */
export async function getThread(
  supabase: Client,
  threadId: string
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("thread_id", threadId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Update a thread's title. Also bumps updated_at.
 */
export async function updateThreadTitle(
  supabase: Client,
  threadId: string,
  title: string
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/chat/__tests__/threads.test.ts
```

Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/lib/chat/threads.ts src/lib/chat/__tests__/threads.test.ts
git commit -m "feat(pr3): add thread data access layer (list, create, get, update)"
```

---

### Task 8: Message Data Access Layer

**Files:**
- Create: `src/lib/chat/messages.ts`
- Test: `src/lib/chat/__tests__/messages.test.ts`

**Context:** CRUD for `conversation_messages`. Messages are created in pairs (user message + assistant response). The `parts` JSONB stores Vercel AI SDK multi-part format for tool calls/results. Messages are never deleted (SESSION-07: source history preserved).

**Step 1: Write failing tests**

```typescript
// src/lib/chat/__tests__/messages.test.ts
import { describe, expect, test, vi } from "vitest";
import { listMessages, createMessage, createMessages } from "../messages";

function mockClient(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: Array.isArray(result.data) ? result.data[0] : result.data,
      error: result.error,
    }),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

describe("listMessages", () => {
  test("returns messages ordered by created_at asc", async () => {
    const messages = [
      { message_id: "m1", thread_id: "t1", role: "user", content: "Hello", parts: null, created_at: "2026-03-01T00:00:00Z" },
      { message_id: "m2", thread_id: "t1", role: "assistant", content: "Hi!", parts: null, created_at: "2026-03-01T00:00:01Z" },
    ];
    const client = mockClient({ data: messages, error: null });

    const result = await listMessages(client as any, "t1");

    expect(result).toEqual(messages);
    expect(client.from).toHaveBeenCalledWith("conversation_messages");
    expect(client._chain.eq).toHaveBeenCalledWith("thread_id", "t1");
    expect(client._chain.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  test("throws on error", async () => {
    const client = mockClient({ data: null, error: { message: "not found" } });
    await expect(listMessages(client as any, "t1")).rejects.toThrow("not found");
  });
});

describe("createMessage", () => {
  test("creates a single message and returns it", async () => {
    const msg = {
      message_id: "m-new",
      thread_id: "t1",
      role: "user",
      content: "Hello",
      parts: null,
      created_at: "2026-03-01T00:00:00Z",
    };
    const client = mockClient({ data: msg, error: null });

    const result = await createMessage(client as any, {
      thread_id: "t1",
      role: "user",
      content: "Hello",
    });

    expect(result).toEqual(msg);
    expect(client._chain.insert).toHaveBeenCalledWith({
      thread_id: "t1",
      role: "user",
      content: "Hello",
    });
  });
});

describe("createMessages", () => {
  test("creates multiple messages in batch", async () => {
    const msgs = [
      { message_id: "m1", thread_id: "t1", role: "user", content: "Hello", parts: null, created_at: "2026-03-01T00:00:00Z" },
      { message_id: "m2", thread_id: "t1", role: "assistant", content: "Hi!", parts: [{ type: "text", text: "Hi!" }], created_at: "2026-03-01T00:00:01Z" },
    ];
    const client = mockClient({ data: msgs, error: null });

    const result = await createMessages(client as any, [
      { thread_id: "t1", role: "user", content: "Hello" },
      { thread_id: "t1", role: "assistant", content: "Hi!", parts: [{ type: "text", text: "Hi!" }] },
    ]);

    expect(result).toEqual(msgs);
    expect(client._chain.insert).toHaveBeenCalledWith([
      { thread_id: "t1", role: "user", content: "Hello" },
      { thread_id: "t1", role: "assistant", content: "Hi!", parts: [{ type: "text", text: "Hi!" }] },
    ]);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/chat/__tests__/messages.test.ts
```

Expected: FAIL — `Cannot find module '../messages'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/chat/messages.ts
/**
 * Data access functions for conversation_messages table.
 * Messages are append-only — never deleted (SESSION-07).
 * @module lib/chat/messages
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

type Client = SupabaseClient<Database>;
type MessageRow = Database["public"]["Tables"]["conversation_messages"]["Row"];
type MessageInsert = Database["public"]["Tables"]["conversation_messages"]["Insert"];

/**
 * List all messages in a thread, ordered chronologically.
 */
export async function listMessages(
  supabase: Client,
  threadId: string
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Create a single message.
 */
export async function createMessage(
  supabase: Client,
  message: Pick<MessageInsert, "thread_id" | "role" | "content"> & { parts?: Json }
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert(message)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Create multiple messages in a single batch insert.
 * Used after a run completes to persist both user message and assistant response.
 */
export async function createMessages(
  supabase: Client,
  messages: Array<Pick<MessageInsert, "thread_id" | "role" | "content"> & { parts?: Json }>
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert(messages)
    .select();

  if (error) throw new Error(error.message);
  return data ?? [];
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/chat/__tests__/messages.test.ts
```

Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/lib/chat/messages.ts src/lib/chat/__tests__/messages.test.ts
git commit -m "feat(pr3): add message data access layer (list, create, batch create)"
```

---

### Task 9: React Hooks (useThreads + useMessages)

**Files:**
- Create: `src/hooks/use-threads.ts`
- Create: `src/hooks/use-chat-messages.ts`
- Test: `src/hooks/__tests__/use-threads.test.tsx`
- Test: `src/hooks/__tests__/use-chat-messages.test.tsx`
- Reference: `src/hooks/use-session.ts` (existing pattern)

**Context:** TanStack Query hooks that wrap the data access functions from Tasks 7-8. `useThreads` provides thread listing and creation for the sidebar rail. `useChatMessages` provides message listing for a thread and a `saveMessages` mutation for persistence. Both use the browser Supabase client (since they run in client components).

**Step 1: Write failing test for useThreads**

```typescript
// src/hooks/__tests__/use-threads.test.tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";

// Mock the supabase browser client
const mockFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Mock getClientId
vi.mock("@/lib/chat/client-resolver", () => ({
  getClientId: vi.fn(),
}));

// Need a fresh QueryClient per test to avoid cache leaks
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Import AFTER mocks are set up
import { useThreads, useCreateThread } from "../use-threads";

describe("useThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches threads for the given clientId", async () => {
    const threads = [
      { thread_id: "t1", client_id: "c1", title: "Thread 1", is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T01:00:00Z" },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: threads, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useThreads("c1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(threads);
    expect(mockFrom).toHaveBeenCalledWith("conversation_threads");
  });

  test("returns empty array when no threads exist", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useThreads("c1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/use-threads.test.tsx
```

Expected: FAIL — `Cannot find module '../use-threads'`

**Step 3: Write minimal useThreads implementation**

```typescript
// src/hooks/use-threads.ts
/**
 * TanStack Query hooks for conversation_threads.
 * Provides thread listing and creation with optimistic updates.
 * @module hooks/use-threads
 */
'use client';

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

/** Query key factory for thread queries */
export const threadKeys = {
  all: ["threads"] as const,
  list: (clientId: string) => ["threads", "list", clientId] as const,
  detail: (threadId: string) => ["threads", "detail", threadId] as const,
};

/**
 * Fetch all threads for a client, ordered by most recently updated.
 * Disabled when clientId is empty (not yet resolved).
 */
export function useThreads(clientId: string) {
  return useQuery({
    queryKey: threadKeys.list(clientId),
    queryFn: async (): Promise<ThreadRow[]> => {
      const { data, error } = await supabase
        .from("conversation_threads")
        .select("*")
        .eq("client_id", clientId)
        .order("updated_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!clientId,
  });
}

/**
 * Create a new thread. Invalidates the thread list on success.
 */
export function useCreateThread(clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title: string | null = null): Promise<ThreadRow> => {
      const { data, error } = await supabase
        .from("conversation_threads")
        .insert({ client_id: clientId, title })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.list(clientId) });
    },
  });
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/__tests__/use-threads.test.tsx
```

Expected: All 2 tests PASS

**Step 5: Write failing test for useChatMessages**

```typescript
// src/hooks/__tests__/use-chat-messages.test.tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

import { useChatMessages } from "../use-chat-messages";

describe("useChatMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches messages for a thread ordered chronologically", async () => {
    const messages = [
      { message_id: "m1", thread_id: "t1", role: "user", content: "Hello", parts: null, created_at: "2026-03-01T00:00:00Z" },
      { message_id: "m2", thread_id: "t1", role: "assistant", content: "Hi!", parts: null, created_at: "2026-03-01T00:00:01Z" },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: messages, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useChatMessages("t1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(messages);
  });

  test("is disabled when threadId is empty", () => {
    const { result } = renderHook(() => useChatMessages(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
  });
});
```

**Step 6: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/use-chat-messages.test.tsx
```

Expected: FAIL — `Cannot find module '../use-chat-messages'`

**Step 7: Write minimal useChatMessages implementation**

```typescript
// src/hooks/use-chat-messages.ts
/**
 * TanStack Query hooks for conversation_messages.
 * Provides message fetching for a thread and a save mutation for persistence.
 * @module hooks/use-chat-messages
 */
'use client';

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

type MessageRow = Database["public"]["Tables"]["conversation_messages"]["Row"];

/** Query key factory for message queries */
export const messageKeys = {
  all: ["messages"] as const,
  byThread: (threadId: string) => ["messages", threadId] as const,
};

/**
 * Fetch all messages in a thread, ordered chronologically.
 * Disabled when threadId is empty.
 */
export function useChatMessages(threadId: string) {
  return useQuery({
    queryKey: messageKeys.byThread(threadId),
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!threadId,
  });
}

/**
 * Save messages to the database. Used after AI streaming completes
 * to persist the user message + assistant response.
 * Invalidates the message cache for the thread.
 */
export function useSaveMessages(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      messages: Array<{ role: string; content: string; parts?: Json }>
    ): Promise<MessageRow[]> => {
      const rows = messages.map((m) => ({
        thread_id: threadId,
        role: m.role,
        content: m.content,
        ...(m.parts ? { parts: m.parts } : {}),
      }));

      const { data, error } = await supabase
        .from("conversation_messages")
        .insert(rows)
        .select();

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.byThread(threadId) });
    },
  });
}
```

**Step 8: Run all hook tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-threads.test.tsx src/hooks/__tests__/use-chat-messages.test.tsx
```

Expected: All 4 tests PASS

**Step 9: Commit**

```bash
git add src/hooks/use-threads.ts src/hooks/use-chat-messages.ts \
        src/hooks/__tests__/use-threads.test.tsx src/hooks/__tests__/use-chat-messages.test.tsx
git commit -m "feat(pr3): add useThreads and useChatMessages TanStack Query hooks"
```

---

### Task 10: Thread Rail + Chat Persistence Wiring

> **Prerequisite:** PRs 1 and 2 must be completed first (chat API endpoint + chat UI with streaming). This task modifies the chat UI from PR 2.

**Files:**
- Create: `src/components/chat/thread-list.tsx`
- Test: `src/components/chat/__tests__/thread-list.test.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (add thread rail)
- Modify: `app/(dashboard)/chat/page.tsx` (add message persistence)
- Create: `src/hooks/use-client-id.ts`
- Test: `src/hooks/__tests__/use-client-id.test.tsx`

**Context:** The thread rail appears in the sidebar below the nav items. It shows recent threads and a "New Thread" button. When a thread is selected, the chat page loads its messages from the DB. After the AI responds, both messages are saved to the DB. The `useClientId` hook resolves the current user's `client_id` on the browser side.

**Step 1: Write failing test for useClientId hook**

```typescript
// src/hooks/__tests__/use-client-id.test.tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";

const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: () => mockAuthGetUser() },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

import { useClientId } from "../use-client-id";

describe("useClientId", () => {
  beforeEach(() => vi.clearAllMocks());

  test("resolves client_id from clients table", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { client_id: "client-456" },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useClientId(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe("client-456"));
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/use-client-id.test.tsx
```

Expected: FAIL — `Cannot find module '../use-client-id'`

**Step 3: Write useClientId implementation**

```typescript
// src/hooks/use-client-id.ts
/**
 * Hook to resolve the current user's client_id on the browser side.
 * Uses TanStack Query for caching (client_id won't change during a session).
 * @module hooks/use-client-id
 */
'use client';

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Resolves auth.uid() → client_id via the clients table.
 * Cached for the session lifetime (staleTime: Infinity).
 */
export function useClientId() {
  return useQuery({
    queryKey: ["clientId"],
    queryFn: async (): Promise<string> => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("clients")
        .select("client_id")
        .eq("user_id", user.id)
        .single();

      if (error || !data) throw new Error("No client row found");
      return data.client_id;
    },
    staleTime: Infinity,
  });
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/__tests__/use-client-id.test.tsx
```

Expected: PASS

**Step 5: Write failing test for ThreadList component**

```typescript
// src/components/chat/__tests__/thread-list.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadList } from "../thread-list";

describe("ThreadList", () => {
  test("renders a list of threads", () => {
    const threads = [
      { thread_id: "t1", client_id: "c1", title: "Property inquiry", is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T01:00:00Z" },
      { thread_id: "t2", client_id: "c1", title: "CRM update", is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:30:00Z" },
    ];

    render(
      <ThreadList
        threads={threads}
        activeThreadId="t1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />
    );

    expect(screen.getByText("Property inquiry")).toBeInTheDocument();
    expect(screen.getByText("CRM update")).toBeInTheDocument();
  });

  test("shows 'New Thread' as title for threads with null title", () => {
    const threads = [
      { thread_id: "t1", client_id: "c1", title: null, is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z" },
    ];

    render(
      <ThreadList
        threads={threads}
        activeThreadId=""
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />
    );

    expect(screen.getByText("New Thread")).toBeInTheDocument();
  });

  test("highlights the active thread", () => {
    const threads = [
      { thread_id: "t1", client_id: "c1", title: "Active", is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z" },
    ];

    render(
      <ThreadList
        threads={threads}
        activeThreadId="t1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />
    );

    const activeItem = screen.getByText("Active").closest("button");
    expect(activeItem).toHaveAttribute("data-active", "true");
  });

  test("calls onSelectThread when a thread is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const threads = [
      { thread_id: "t1", client_id: "c1", title: "Click me", is_pinned: false, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z" },
    ];

    render(
      <ThreadList
        threads={threads}
        activeThreadId=""
        onSelectThread={onSelect}
        onNewThread={() => {}}
      />
    );

    await user.click(screen.getByText("Click me"));
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  test("calls onNewThread when new thread button is clicked", async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();

    render(
      <ThreadList
        threads={[]}
        activeThreadId=""
        onSelectThread={() => {}}
        onNewThread={onNew}
      />
    );

    await user.click(screen.getByRole("button", { name: /new thread/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
```

**Step 6: Run test to verify it fails**

```bash
npx vitest run src/components/chat/__tests__/thread-list.test.tsx
```

Expected: FAIL — `Cannot find module '../thread-list'`

**Step 7: Write ThreadList implementation**

```tsx
// src/components/chat/thread-list.tsx
/**
 * Thread rail component — displays a list of conversation threads.
 * Used in the sidebar to let users switch between threads.
 * @module components/chat/thread-list
 */
'use client';

import { Plus, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";

type ThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

interface ThreadListProps {
  threads: ThreadRow[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
}: ThreadListProps) {
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={onNewThread}
        aria-label="New thread"
      >
        <Plus className="h-3.5 w-3.5" />
        New Thread
      </Button>

      <div className="mt-1 flex flex-col gap-0.5">
        {threads.map((thread) => {
          const isActive = thread.thread_id === activeThreadId;
          return (
            <button
              key={thread.thread_id}
              data-active={isActive}
              onClick={() => onSelectThread(thread.thread_id)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                isActive ? "bg-muted/60 font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {thread.title ?? "New Thread"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 8: Run test to verify it passes**

```bash
npx vitest run src/components/chat/__tests__/thread-list.test.tsx
```

Expected: All 5 tests PASS

**Step 9: Run ALL tests to verify nothing is broken**

```bash
npx vitest run
```

Expected: All tests PASS (schemas, mock, threads, messages, hooks, component)

**Step 10: Commit**

```bash
git add src/hooks/use-client-id.ts src/hooks/__tests__/use-client-id.test.tsx \
        src/components/chat/thread-list.tsx src/components/chat/__tests__/thread-list.test.tsx
git commit -m "feat(pr3): add useClientId hook and ThreadList component for thread rail"
```

**Step 11: Wire ThreadList into app-sidebar.tsx**

This step modifies the existing sidebar to include the thread rail. The thread rail appears below the AGENT nav section when the user is on the `/chat` route.

Modify: `src/components/layout/app-sidebar.tsx`

Add imports:
```typescript
import { ThreadList } from "@/components/chat/thread-list";
import { useThreads, useCreateThread } from "@/hooks/use-threads";
import { useClientId } from "@/hooks/use-client-id";
```

Add thread rail state and logic inside `AppSidebar()`:
```typescript
const { data: clientId } = useClientId();
const { data: threads = [] } = useThreads(clientId ?? "");
const createThread = useCreateThread(clientId ?? "");

const handleNewThread = () => {
  createThread.mutate(null);
};

const handleSelectThread = (threadId: string) => {
  router.push(`/chat?thread=${threadId}`);
};
```

Add the ThreadList component inside `<SidebarContent>` after the AGENT section:
```tsx
{/* Thread rail — visible on chat route */}
{pathname.startsWith("/chat") && clientId && (
  <SidebarGroup className="py-1">
    <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold h-6">
      Threads
    </SidebarGroupLabel>
    <ThreadList
      threads={threads}
      activeThreadId={new URLSearchParams(window.location.search).get("thread") ?? ""}
      onSelectThread={handleSelectThread}
      onNewThread={handleNewThread}
    />
  </SidebarGroup>
)}
```

**Step 12: Wire chat page to persist messages**

This step modifies the chat page (from PR 2) to load messages from DB on mount and save messages after AI response completes. Since the exact PR 2 chat implementation isn't built yet, here's the integration pattern:

Modify: `app/(dashboard)/chat/page.tsx`

The key integration points with the PR 2 chat UI:
1. Read `thread` query param to determine active thread
2. If no thread param, create a new thread on first message
3. Load existing messages from DB via `useChatMessages(threadId)`
4. After AI streaming completes (`onFinish` callback of `useChat()`), save messages via `useSaveMessages`
5. Merge DB messages with streaming messages for display

```typescript
// Integration pattern (adapt to PR 2's exact chat component structure):
import { useChatMessages, useSaveMessages } from "@/hooks/use-chat-messages";
import { useClientId } from "@/hooks/use-client-id";
import { useCreateThread } from "@/hooks/use-threads";

// Inside the chat page component:
const { data: clientId } = useClientId();
const threadId = searchParams.get("thread") ?? "";
const { data: dbMessages = [] } = useChatMessages(threadId);
const saveMessages = useSaveMessages(threadId);

// In useChat's onFinish callback:
// saveMessages.mutate([
//   { role: "user", content: userMessage },
//   { role: "assistant", content: response.text, parts: response.parts },
// ]);
```

**Step 13: Commit**

```bash
git add src/components/layout/app-sidebar.tsx app/(dashboard)/chat/page.tsx
git commit -m "feat(pr3): wire thread rail into sidebar and chat message persistence"
```

**Step 14: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS

---

## Relevant Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/chat/schemas.ts` | Create | Zod validation schemas for all 4 tables + clients |
| `src/lib/chat/__tests__/schemas.test.ts` | Create | Schema validation tests |
| `supabase/migrations/20260301000000_create_clients_table.sql` | Create | clients table migration |
| `supabase/migrations/20260301000001_create_clients_trigger.sql` | Create | auth.users → clients trigger |
| `supabase/migrations/20260301000002_create_conversation_threads.sql` | Create | conversation_threads table |
| `supabase/migrations/20260301000003_create_conversation_messages.sql` | Create | conversation_messages table |
| `supabase/migrations/20260301000004_create_runs_table.sql` | Create | runs table with status enum |
| `supabase/migrations/20260301000005_add_rls_policies.sql` | Create | RLS policies + get_my_client_id() |
| `src/types/database.ts` | Modify | Add new table types + run_status enum |
| `src/test/mocks/supabase.ts` | Create | Reusable Supabase mock for tests |
| `src/test/__tests__/supabase-mock.test.ts` | Create | Mock helper tests |
| `src/lib/chat/client-resolver.ts` | Create | Server-side client_id resolution |
| `src/lib/chat/__tests__/client-resolver.test.ts` | Create | Client resolver tests |
| `src/lib/chat/threads.ts` | Create | Thread CRUD data access |
| `src/lib/chat/__tests__/threads.test.ts` | Create | Thread data access tests |
| `src/lib/chat/messages.ts` | Create | Message CRUD data access |
| `src/lib/chat/__tests__/messages.test.ts` | Create | Message data access tests |
| `src/hooks/use-threads.ts` | Create | TanStack Query hooks for threads |
| `src/hooks/__tests__/use-threads.test.tsx` | Create | Thread hook tests |
| `src/hooks/use-chat-messages.ts` | Create | TanStack Query hooks for messages |
| `src/hooks/__tests__/use-chat-messages.test.tsx` | Create | Message hook tests |
| `src/hooks/use-client-id.ts` | Create | Browser-side client_id resolution hook |
| `src/hooks/__tests__/use-client-id.test.tsx` | Create | Client ID hook tests |
| `src/components/chat/thread-list.tsx` | Create | Thread rail UI component |
| `src/components/chat/__tests__/thread-list.test.tsx` | Create | Thread rail component tests |
| `src/components/layout/app-sidebar.tsx` | Modify | Add thread rail to sidebar |
| `app/(dashboard)/chat/page.tsx` | Modify | Add message persistence |

---

## Verification Checklist

Before marking PR 3 complete:

- [ ] All 6 migration files created and syntactically valid
- [ ] `database.ts` updated with all new table types + `run_status` enum
- [ ] Zod schemas pass all validation tests
- [ ] Client resolution helper works with RPC + fallback
- [ ] Thread CRUD: list, create, get, updateTitle all tested
- [ ] Message CRUD: list, create, batch create all tested
- [ ] useThreads and useChatMessages hooks tested with TanStack Query
- [ ] useClientId hook resolves auth → client mapping
- [ ] ThreadList component renders threads, handles selection, new thread creation
- [ ] Thread rail wired into sidebar (visible on /chat route)
- [ ] Chat messages persist to DB after AI response completes
- [ ] All tests pass: `npx vitest run`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] **Manual test:** Create thread, send messages, refresh page — conversation persists

---

## Execution Handoff

Tasklist complete and saved to `docs/tasks/2026-03-01-pr3-clients-threads-messages-tasklist.md`.

Open a new session to do batch execution with checkpoint using:
```
do docs/tasks/2026-03-01-pr3-clients-threads-messages-tasklist.md
```
