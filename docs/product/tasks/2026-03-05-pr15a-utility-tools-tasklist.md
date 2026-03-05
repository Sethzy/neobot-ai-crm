# PR 15 Part A: Database Migrations + Utility Tools

**PR:** PR 15: Platform instructions + system-reminder + utility tools
**Part:** A of 2 — Database migrations, utility tools, runner wiring
**Decisions:** TOOL-02, RUNNER-09
**Goal:** Create `agent_todo` table, SQL helper functions, and implement 5 utility tools (`manage_todo`, `list_todo`, `rename_chat`, `run_agent_memory_sql`, `get_agent_db_schema`). `manage_todo` supports add/update/delete batches; `list_todo` supports optional ID filtering. Wire into runner.

**Architecture:** The `agent_todo` table uses Tasklet-parity minimal schema (binary state: exists or deleted) with thread-scoped operations. Utility tools live in `src/lib/runner/tools/utility/` with a factory that closes over `(supabase, clientId, threadId)`. SQL tools use Postgres functions with read-only enforcement, statement timeout, and query-shape guards.

**Tech Stack:** Supabase (Postgres + RLS), Vercel AI SDK v6, Vitest, Zod 4

**Prerequisite:** PR 14 (memory system) must be merged. PR 13 (memory bootstrap) already merged.

**Next:** After completing Part A, proceed to Part B (`2026-03-05-pr15b-context-assembly-tasklist.md`) for platform instructions, system-reminder, and 7-layer context assembly.

---

## Review Amendments (2026-03-05)

**Important:** This tasklist filename contains `pr15a`, but this file implements **PR 15 Part A** scope from the v2 implementation plan. Use PR 15 naming in commits and handoff notes.

The following decisions are agreed and **override conflicting snippets below**:

1. `manage_todo` scope is **add/update/delete** (batch supported). `list_todo` supports optional `ids` filtering.
2. `agent_todo.payload` is `JSONB NOT NULL DEFAULT '{}'::jsonb` (not nullable) and includes an RLS `UPDATE` policy.
3. Todo mutations must be strictly thread-scoped: `id + client_id + thread_id` predicates for update/delete.
4. `get_agent_db_schema` must include per-table `row_count` in addition to table/column metadata.
5. `run_readonly_sql` must reject non-read-only shapes before execution:
   - allow only `SELECT` or `WITH` queries
   - reject multi-statement SQL (for example semicolon-delimited chains)
6. `get_system_reminder_context` must enforce client ownership checks when using `SECURITY DEFINER`, and return a **real** `memory_file_count` (no hardcoded placeholder).
7. For minimal diff, manually patch `src/types/database.ts` with targeted additions (`agent_todo` table + new function signatures) instead of full file regeneration.
8. Runner wiring tests must update all files mocking `@/lib/runner/tools`, not only `run-agent.test.ts`:
   - `src/lib/runner/__tests__/run-agent.test.ts`
   - `src/lib/runner/__tests__/serialization.test.ts`
   - `src/lib/runner/__tests__/stale-cleanup.test.ts`
   - `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts`
9. Execute with strict TDD micro-cycles (red -> green -> refactor per behavior), not only per-module.

## Post-Review Fixes (2026-03-05)

The following fixes were applied after independent code review and should be treated as required behavior:

1. `rename_chat` must treat zero updated rows as failure and return a deterministic error (`Thread not found or access denied`) instead of returning success.
2. `run_agent_memory_sql` now performs local query-shape validation before RPC (reject non-`SELECT/WITH`, reject semicolon-delimited multi-statement payloads) as defense-in-depth.
3. Add DB-level assertive verification script at `supabase/verification/pr15a_sql_helpers_security_check.sql` to validate:
   - `run_readonly_sql` read-only guard behavior
   - `get_system_reminder_context` ownership enforcement under JWT-scoped context

---

## Relevant Files

### Create
- `supabase/migrations/20260305030000_create_agent_todo.sql`
- `supabase/migrations/20260305030001_create_sql_helper_functions.sql`
- `supabase/verification/pr15a_sql_helpers_security_check.sql`
- `src/lib/runner/tools/utility/todo.ts`
- `src/lib/runner/tools/utility/__tests__/todo.test.ts`
- `src/lib/runner/tools/utility/rename-chat.ts`
- `src/lib/runner/tools/utility/__tests__/rename-chat.test.ts`
- `src/lib/runner/tools/utility/sql.ts`
- `src/lib/runner/tools/utility/__tests__/sql.test.ts`
- `src/lib/runner/tools/utility/index.ts`
- `src/lib/runner/tools/utility/__tests__/index.test.ts`

### Modify
- `src/lib/runner/tools/index.ts` — add utility export
- `src/lib/runner/run-agent.ts` — wire utility tools, pass threadId
- `src/lib/runner/__tests__/run-agent.test.ts` — add utility tool mocks
- `src/lib/runner/__tests__/serialization.test.ts` — add utility tool mocks
- `src/lib/runner/__tests__/stale-cleanup.test.ts` — add utility tool mocks
- `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts` — add utility tool mocks
- `src/types/database.ts` — targeted manual updates (`agent_todo` + new function types)

### Reference (do not modify)
- `src/lib/runner/tools/storage/index.ts` — storage tool factory pattern reference
- `src/lib/runner/tools/crm/tasks.ts` — CRM tool factory pattern reference
- `src/lib/runner/tools/crm/index.ts` — barrel pattern reference
- `src/test/mocks/supabase.ts` — createMockSupabaseClient helper
- `supabase/migrations/20260301000005_add_rls_policies.sql` — RLS + get_my_client_id() pattern
- `supabase/migrations/20260301110003_create_crm_tasks.sql` — table creation pattern

---

## Task 1: Database Migration — agent_todo Table

**Files:**
- Create: `supabase/migrations/20260305030000_create_agent_todo.sql`

### Step 1: Write the agent_todo migration

Create `supabase/migrations/20260305030000_create_agent_todo.sql`:

```sql
-- PR15: agent_todo table for agent scratchpad / notes-to-future-self.
-- Decision refs: TOOL-02, RUNNER-09.
-- Binary state: rows exist or are deleted. No status lifecycle.
-- Thread-scoped: each todo belongs to a specific conversation thread.

CREATE TABLE public.agent_todo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_todo_thread ON public.agent_todo(thread_id);
CREATE INDEX idx_agent_todo_client ON public.agent_todo(client_id);

-- RLS: scope to own client
ALTER TABLE public.agent_todo ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_todo_select_own ON public.agent_todo
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY agent_todo_insert_own ON public.agent_todo
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY agent_todo_delete_own ON public.agent_todo
  FOR DELETE
  USING (client_id = public.get_my_client_id());

CREATE POLICY agent_todo_update_own ON public.agent_todo
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());
```

### Step 2: Verify migration syntax

```bash
npx supabase migration list 2>&1 | tail -5
```

Expected: migration file appears in list without syntax errors.

---

## Task 2: Database Migration — SQL Helper Functions

**Files:**
- Create: `supabase/migrations/20260305030001_create_sql_helper_functions.sql`

### Step 1: Write the SQL helper functions migration

Create `supabase/migrations/20260305030001_create_sql_helper_functions.sql`:

```sql
-- PR15: SQL helper functions for run_agent_memory_sql and get_agent_db_schema tools.
-- Decision refs: TOOL-02, RUNNER-09.
--
-- run_readonly_sql: Executes single-statement SELECT/CTE SQL with RLS enforced.
-- SECURITY INVOKER means the function runs as the calling user, so RLS
-- policies apply automatically — the agent can only see the client's own data.
--
-- get_client_accessible_schema: Returns curated table/column metadata for
-- tables the agent is allowed to query.

CREATE OR REPLACE FUNCTION public.run_readonly_sql(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET statement_timeout = '10s'
AS $$
DECLARE
  result JSONB;
  normalized_query TEXT;
BEGIN
  normalized_query := btrim(query_text);

  IF normalized_query = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  -- Reject multi-statement payloads and non-read-only entry points.
  IF normalized_query ~ ';' THEN
    RAISE EXCEPTION 'Only single-statement queries are allowed';
  END IF;

  IF normalized_query !~* '^(select|with)\s' THEN
    RAISE EXCEPTION 'Only SELECT/CTE queries are allowed';
  END IF;

  -- Enforce read-only at transaction level
  SET LOCAL transaction_read_only = on;

  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', normalized_query)
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.run_readonly_sql(TEXT) IS
  'Executes read-only SQL as the calling user (RLS enforced). 10s timeout.';


CREATE OR REPLACE FUNCTION public.get_client_accessible_schema()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'table', c.table_name,
      'row_count', CASE c.table_name
        WHEN 'contacts' THEN (SELECT count(*)::int FROM public.contacts)
        WHEN 'deals' THEN (SELECT count(*)::int FROM public.deals)
        WHEN 'deal_contacts' THEN (SELECT count(*)::int FROM public.deal_contacts)
        WHEN 'interactions' THEN (SELECT count(*)::int FROM public.interactions)
        WHEN 'crm_tasks' THEN (SELECT count(*)::int FROM public.crm_tasks)
        WHEN 'crm_config' THEN (SELECT count(*)::int FROM public.crm_config)
        WHEN 'conversation_threads' THEN (SELECT count(*)::int FROM public.conversation_threads)
        WHEN 'conversation_messages' THEN (SELECT count(*)::int FROM public.conversation_messages)
        WHEN 'agent_todo' THEN (SELECT count(*)::int FROM public.agent_todo)
        WHEN 'vault_files' THEN (SELECT count(*)::int FROM public.vault_files)
      END,
      'columns', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', col.column_name,
            'type', col.data_type,
            'nullable', col.is_nullable
          )
          ORDER BY col.ordinal_position
        )
        FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.table_name
      )
    )
    ORDER BY c.table_name
  )
  FROM (
    VALUES
      ('contacts'),
      ('deals'),
      ('deal_contacts'),
      ('interactions'),
      ('crm_tasks'),
      ('crm_config'),
      ('conversation_threads'),
      ('conversation_messages'),
      ('agent_todo'),
      ('vault_files')
  ) AS c(table_name)
$$;

COMMENT ON FUNCTION public.get_client_accessible_schema() IS
  'Returns curated schema metadata for tables the agent can query.';


-- System-reminder context: gathers user info, todo count, and memory file count
-- in a single RPC call to minimize round trips from the runner.
CREATE OR REPLACE FUNCTION public.get_system_reminder_context(
  p_client_id UUID,
  p_thread_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'display_name', c.display_name,
    'user_email', u.email,
    'days_since_signup', EXTRACT(DAY FROM now() - c.created_at)::int,
    'open_todo_count', (
      SELECT count(*)::int
      FROM public.agent_todo t
      WHERE t.client_id = p_client_id
        AND t.thread_id = p_thread_id
    ),
    'memory_file_count', (
      SELECT count(*)::int
      FROM storage.objects o
      WHERE o.bucket_id = 'agent-files'
        AND (
          o.name = p_client_id::text || '/SOUL.md'
          OR o.name = p_client_id::text || '/USER.md'
          OR o.name = p_client_id::text || '/MEMORY.md'
          OR o.name LIKE p_client_id::text || '/memory/%.md'
        )
    )
  )
  FROM public.clients c
  JOIN auth.users u ON u.id = c.user_id
  WHERE c.client_id = p_client_id
    AND p_client_id = public.get_my_client_id()
$$;

COMMENT ON FUNCTION public.get_system_reminder_context(UUID, UUID) IS
  'Gathers per-turn context for the system-reminder in a single round trip.';
```

### Step 2: Verify migration syntax

```bash
npx supabase migration list 2>&1 | tail -5
```

Expected: both new migrations appear without errors.

### Step 3: Regenerate TypeScript database types

**Preferred (minimal diff):** manually patch `src/types/database.ts` with targeted additions for `agent_todo` and new function signatures.

**Optional (higher diff risk):**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

If you regenerate types, verify the diff only contains expected schema changes.

The key type additions needed:

```typescript
// In Tables interface:
agent_todo: {
  Row: {
    id: string
    client_id: string
    thread_id: string
    title: string
    payload: Json
    created_at: string
  }
  Insert: {
    id?: string
    client_id: string
    thread_id: string
    title: string
    payload?: Json
    created_at?: string
  }
  Update: {
    id?: string
    client_id?: string
    thread_id?: string
    title?: string
    payload?: Json
    created_at?: string
  }
}
```

Also add function signatures under `public.Functions`:

```typescript
run_readonly_sql: {
  Args: { query_text: string }
  Returns: Json
}
get_client_accessible_schema: {
  Args: never
  Returns: Json
}
get_system_reminder_context: {
  Args: { p_client_id: string; p_thread_id: string }
  Returns: Json
}
```

---

## Task 3: Todo Tools (manage_todo + list_todo)

**Files:**
- Create: `src/lib/runner/tools/utility/__tests__/todo.test.ts`
- Create: `src/lib/runner/tools/utility/todo.ts`

**Scope update (supersedes conflicting snippets below):**
- `manage_todo` supports `add`, `update`, and `delete`.
- `list_todo` accepts optional `ids: string[]` to filter a subset.
- `update` and `delete` operations must scope to `thread_id` + `client_id`.

### Step 1: Write failing tests for todo tools

Create `src/lib/runner/tools/utility/__tests__/todo.test.ts`:

```typescript
/**
 * Tests for agent todo tools (manage_todo, list_todo).
 * @module lib/runner/tools/utility/__tests__/todo
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createTodoTools } from "../todo";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createTodoTools", () => {
  it("returns manage_todo and list_todo tools", () => {
    const supabase = createMockSupabaseClient();
    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);

    expect(tools).toHaveProperty("manage_todo");
    expect(tools).toHaveProperty("list_todo");
    expect(tools.manage_todo).toHaveProperty("execute");
    expect(tools.list_todo).toHaveProperty("execute");
  });
});

describe("list_todo", () => {
  let supabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns todos for the current thread", async () => {
    const mockTodos = [
      { id: "todo-1", client_id: CLIENT_ID, thread_id: THREAD_ID, title: "Follow up with John", payload: {}, created_at: "2026-03-05T10:00:00Z" },
      { id: "todo-2", client_id: CLIENT_ID, thread_id: THREAD_ID, title: "Check market data", payload: { note: "urgent" }, created_at: "2026-03-05T10:01:00Z" },
    ];

    supabase = createMockSupabaseClient({
      selectResult: { data: mockTodos, error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.list_todo.execute({}, { toolCallId: "call-1", messages: [], abortSignal: undefined as never });

    expect(result).toEqual({
      success: true,
      todos: mockTodos,
      count: 2,
    });
    expect(supabase.calls.from).toContain("agent_todo");
  });

  it("returns empty array when no todos exist", async () => {
    supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.list_todo.execute({}, { toolCallId: "call-1", messages: [], abortSignal: undefined as never });

    expect(result).toEqual({
      success: true,
      todos: [],
      count: 0,
    });
  });

  it("returns error on query failure", async () => {
    supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "connection refused" } },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.list_todo.execute({}, { toolCallId: "call-1", messages: [], abortSignal: undefined as never });

    expect(result).toEqual({
      success: false,
      error: "connection refused",
    });
  });
});

describe("manage_todo", () => {
  let supabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a todo with title only", async () => {
    const inserted = { id: "todo-new", client_id: CLIENT_ID, thread_id: THREAD_ID, title: "Draft email", payload: {}, created_at: "2026-03-05T12:00:00Z" };

    supabase = createMockSupabaseClient({
      insertResult: { data: [inserted], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      { operations: [{ op: "add", title: "Draft email" }] },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: true,
      results: [{ op: "add", success: true, todo: inserted }],
    });
  });

  it("adds a todo with payload", async () => {
    const inserted = { id: "todo-new", client_id: CLIENT_ID, thread_id: THREAD_ID, title: "Research", payload: { details: "HDB prices" }, created_at: "2026-03-05T12:00:00Z" };

    supabase = createMockSupabaseClient({
      insertResult: { data: [inserted], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      { operations: [{ op: "add", title: "Research", payload: { details: "HDB prices" } }] },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result.success).toBe(true);
    expect(result.results[0]).toEqual({ op: "add", success: true, todo: inserted });
  });

  it("deletes a todo by id", async () => {
    supabase = createMockSupabaseClient({
      deleteResult: { data: [{ id: "todo-1" }], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      { operations: [{ op: "delete", todo_id: "todo-1" }] },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: true,
      results: [{ op: "delete", success: true, todo_id: "todo-1" }],
    });
  });

  it("handles batch operations (add + delete in one call)", async () => {
    const inserted = { id: "todo-new", client_id: CLIENT_ID, thread_id: THREAD_ID, title: "New task", payload: {}, created_at: "2026-03-05T12:00:00Z" };

    supabase = createMockSupabaseClient({
      insertResult: { data: [inserted], error: null },
      deleteResult: { data: [{ id: "todo-old" }], error: null },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      {
        operations: [
          { op: "add", title: "New task" },
          { op: "delete", todo_id: "todo-old" },
        ],
      },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ op: "add", success: true, todo: inserted });
    expect(result.results[1]).toEqual({ op: "delete", success: true, todo_id: "todo-old" });
  });

  it("reports per-operation errors without failing the batch", async () => {
    supabase = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    const tools = createTodoTools(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tools.manage_todo.execute(
      { operations: [{ op: "add", title: "Will fail" }] },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result.success).toBe(true);
    expect(result.results[0]).toEqual({ op: "add", success: false, error: "insert failed" });
  });
});
```

Add two additional failing tests before implementation:
- `manage_todo` supports `update` and enforces `thread_id` scoping on updates/deletes.
- `list_todo` supports `{ ids: [...] }` filtering.

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/todo.test.ts
```

Expected: FAIL — module `../todo` does not exist.

### Step 3: Implement todo tools

Create `src/lib/runner/tools/utility/todo.ts`:

```typescript
/**
 * Agent todo tools for scratchpad / notes-to-future-self.
 * @module lib/runner/tools/utility/todo
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

const addOperationSchema = z.object({
  op: z.literal("add"),
  title: z.string().min(1).describe("Todo title."),
  payload: z.record(z.unknown()).optional().describe("Optional structured data to attach."),
});

const updateOperationSchema = z.object({
  op: z.literal("update"),
  todo_id: z.string().uuid().describe("UUID of the todo to update."),
  title: z.string().min(1).optional().describe("Updated title."),
  payload: z.record(z.unknown()).optional().describe("Updated structured payload."),
});

const deleteOperationSchema = z.object({
  op: z.literal("delete"),
  todo_id: z.string().uuid().describe("UUID of the todo to delete."),
});

const todoOperationSchema = z.discriminatedUnion("op", [
  addOperationSchema,
  updateOperationSchema,
  deleteOperationSchema,
]);

type TodoOperation = z.infer<typeof todoOperationSchema>;

type TodoOperationResult =
  | { op: "add"; success: true; todo: unknown }
  | { op: "add"; success: false; error: string }
  | { op: "update"; success: true; todo: unknown }
  | { op: "update"; success: false; error: string }
  | { op: "delete"; success: true; todo_id: string }
  | { op: "delete"; success: false; error: string };

/**
 * Creates agent todo tools scoped to a specific thread.
 *
 * Unlike CRM tools (clientId only), todo tools also close over threadId
 * because agent_todo rows are thread-scoped.
 */
export function createTodoTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  async function executeAdd(
    operation: z.infer<typeof addOperationSchema>,
  ): Promise<TodoOperationResult> {
    const { data, error } = await supabase
      .from("agent_todo")
      .insert({
        client_id: clientId,
        thread_id: threadId,
        title: operation.title,
        payload: operation.payload ?? {},
      })
      .select()
      .single();

    if (error) {
      return { op: "add", success: false, error: error.message };
    }

    return { op: "add", success: true, todo: data };
  }

  async function executeUpdate(
    operation: z.infer<typeof updateOperationSchema>,
  ): Promise<TodoOperationResult> {
    const updates = Object.fromEntries(
      Object.entries({
        title: operation.title,
        payload: operation.payload,
      }).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(updates).length === 0) {
      return { op: "update", success: false, error: "No fields to update" };
    }

    const { data, error } = await supabase
      .from("agent_todo")
      .update(updates)
      .eq("id", operation.todo_id)
      .eq("client_id", clientId)
      .eq("thread_id", threadId)
      .select()
      .single();

    if (error) {
      return { op: "update", success: false, error: error.message };
    }

    return { op: "update", success: true, todo: data };
  }

  async function executeDelete(
    operation: z.infer<typeof deleteOperationSchema>,
  ): Promise<TodoOperationResult> {
    const { error } = await supabase
      .from("agent_todo")
      .delete()
      .eq("id", operation.todo_id)
      .eq("client_id", clientId)
      .eq("thread_id", threadId);

    if (error) {
      return { op: "delete", success: false, error: error.message };
    }

    return { op: "delete", success: true, todo_id: operation.todo_id };
  }

  async function executeOperation(
    operation: TodoOperation,
  ): Promise<TodoOperationResult> {
    switch (operation.op) {
      case "add":
        return executeAdd(operation);
      case "update":
        return executeUpdate(operation);
      case "delete":
        return executeDelete(operation);
    }
  }

  const manage_todo = tool({
    description:
      "Manage your scratchpad todos for this thread. " +
      "Use this to remember what you need to do next, track multi-step work, " +
      "or leave notes for future runs. Supports batch add/update/delete operations.",
    inputSchema: z.object({
      operations: z.array(todoOperationSchema).min(1).max(20).describe(
        "Batch of add/update/delete operations. Each operation runs independently.",
      ),
    }),
    execute: async ({ operations }) => {
      const results: TodoOperationResult[] = [];
      for (const operation of operations) {
        const result = await executeOperation(operation);
        results.push(result);
      }
      return { success: true as const, results };
    },
  });

  const list_todo = tool({
    description:
      "List open todos for the current thread. " +
      "Use this at the start of a run to check for unfinished work from previous runs.",
    inputSchema: z.object({
      ids: z.array(z.string().uuid()).optional().describe("Optional todo IDs to fetch."),
    }),
    execute: async ({ ids }) => {
      let query = supabase
        .from("agent_todo")
        .select("*")
        .eq("thread_id", threadId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      if (ids && ids.length > 0) {
        query = query.in("id", ids);
      }

      const { data, error } = await query;

      if (error) {
        return { success: false as const, error: error.message };
      }

      const todos = data ?? [];
      return { success: true as const, todos, count: todos.length };
    },
  });

  return { manage_todo, list_todo };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/todo.test.ts
```

Expected: PASS — all todo tool tests green.

---

## Task 4: rename_chat Tool

**Files:**
- Create: `src/lib/runner/tools/utility/__tests__/rename-chat.test.ts`
- Create: `src/lib/runner/tools/utility/rename-chat.ts`

### Step 1: Write failing tests for rename_chat

Create `src/lib/runner/tools/utility/__tests__/rename-chat.test.ts`:

```typescript
/**
 * Tests for the rename_chat tool.
 * @module lib/runner/tools/utility/__tests__/rename-chat
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createRenameChatTool } from "../rename-chat";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("rename_chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a tool with execute function", () => {
    const supabase = createMockSupabaseClient();
    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);

    expect(tool).toHaveProperty("rename_chat");
    expect(tool.rename_chat).toHaveProperty("execute");
  });

  it("updates the thread title on success", async () => {
    const updatedThread = {
      thread_id: THREAD_ID,
      client_id: CLIENT_ID,
      title: "Market Analysis — Bishan",
      created_at: "2026-03-05T10:00:00Z",
      updated_at: "2026-03-05T12:00:00Z",
    };

    const supabase = createMockSupabaseClient({
      updateResult: { data: [updatedThread], error: null },
    });

    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tool.rename_chat.execute(
      { new_title: "Market Analysis — Bishan" },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: true,
      title: "Market Analysis — Bishan",
    });
    expect(supabase.calls.from).toContain("conversation_threads");
  });

  it("returns error on update failure", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: null, error: { message: "update failed" } },
    });

    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tool.rename_chat.execute(
      { new_title: "New Title" },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: false,
      error: "update failed",
    });
  });
});
```

Add one additional failing assertion: `get_agent_db_schema` result objects include `row_count`.

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/rename-chat.test.ts
```

Expected: FAIL — module `../rename-chat` does not exist.

### Step 3: Implement rename_chat tool

Create `src/lib/runner/tools/utility/rename-chat.ts`:

```typescript
/**
 * rename_chat tool — lets the agent auto-title conversation threads.
 * @module lib/runner/tools/utility/rename-chat
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Creates the rename_chat tool scoped to a specific thread.
 */
export function createRenameChatTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  const rename_chat = tool({
    description:
      "Rename the current conversation thread. " +
      "Use this after the first user message to give the thread a descriptive title.",
    inputSchema: z.object({
      new_title: z.string().min(1).max(200).describe("New title for this conversation."),
    }),
    execute: async ({ new_title }) => {
      const { error } = await supabase
        .from("conversation_threads")
        .update({ title: new_title })
        .eq("thread_id", threadId)
        .eq("client_id", clientId);

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, title: new_title };
    },
  });

  return { rename_chat };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/rename-chat.test.ts
```

Expected: PASS — all 3 tests green.

---

## Task 5: SQL Query Tools (run_agent_memory_sql + get_agent_db_schema)

**Files:**
- Create: `src/lib/runner/tools/utility/__tests__/sql.test.ts`
- Create: `src/lib/runner/tools/utility/sql.ts`

**Scope update (supersedes conflicting snippets below):**
- `get_agent_db_schema` responses must include `row_count` per table.
- `run_agent_memory_sql` relies on DB-side query-shape guards (`SELECT/WITH` only, single statement).

### Step 1: Write failing tests for SQL tools

Create `src/lib/runner/tools/utility/__tests__/sql.test.ts`:

```typescript
/**
 * Tests for SQL query tools (run_agent_memory_sql, get_agent_db_schema).
 * @module lib/runner/tools/utility/__tests__/sql
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createSqlTools } from "../sql";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createSqlTools", () => {
  it("returns run_agent_memory_sql and get_agent_db_schema tools", () => {
    const supabase = createMockSupabaseClient();
    const tools = createSqlTools(supabase as never, CLIENT_ID);

    expect(tools).toHaveProperty("run_agent_memory_sql");
    expect(tools).toHaveProperty("get_agent_db_schema");
    expect(tools.run_agent_memory_sql).toHaveProperty("execute");
    expect(tools.get_agent_db_schema).toHaveProperty("execute");
  });
});

describe("run_agent_memory_sql", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls run_readonly_sql RPC with the query", async () => {
    const mockRows = [
      { deal_id: "d1", title: "Bishan Condo", stage: "closed_won" },
      { deal_id: "d2", title: "Tampines HDB", stage: "closed_won" },
    ];

    const supabase = createMockSupabaseClient({
      rpcResults: {
        run_readonly_sql: { data: mockRows, error: null },
      },
    });

    const tools = createSqlTools(supabase as never, CLIENT_ID);
    const result = await tools.run_agent_memory_sql.execute(
      { query: "SELECT deal_id, title, stage FROM deals WHERE stage = 'closed_won'" },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: true,
      rows: mockRows,
    });
    expect(supabase.calls.rpc).toEqual([
      { fn: "run_readonly_sql", args: { query_text: "SELECT deal_id, title, stage FROM deals WHERE stage = 'closed_won'" } },
    ]);
  });

  it("returns error on RPC failure", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        run_readonly_sql: { data: null, error: { message: "statement timeout" } },
      },
    });

    const tools = createSqlTools(supabase as never, CLIENT_ID);
    const result = await tools.run_agent_memory_sql.execute(
      { query: "SELECT * FROM massive_table" },
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: false,
      error: "statement timeout",
    });
  });
});

describe("get_agent_db_schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls get_client_accessible_schema RPC", async () => {
    const mockSchema = [
      {
        table: "contacts",
        columns: [
          { name: "contact_id", type: "uuid", nullable: "NO" },
          { name: "name", type: "text", nullable: "NO" },
        ],
      },
    ];

    const supabase = createMockSupabaseClient({
      rpcResults: {
        get_client_accessible_schema: { data: mockSchema, error: null },
      },
    });

    const tools = createSqlTools(supabase as never, CLIENT_ID);
    const result = await tools.get_agent_db_schema.execute(
      {},
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: true,
      schema: mockSchema,
    });
    expect(supabase.calls.rpc).toEqual([
      { fn: "get_client_accessible_schema", args: undefined },
    ]);
  });

  it("returns error on RPC failure", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        get_client_accessible_schema: { data: null, error: { message: "function not found" } },
      },
    });

    const tools = createSqlTools(supabase as never, CLIENT_ID);
    const result = await tools.get_agent_db_schema.execute(
      {},
      { toolCallId: "call-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toEqual({
      success: false,
      error: "function not found",
    });
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/sql.test.ts
```

Expected: FAIL — module `../sql` does not exist.

### Step 3: Implement SQL tools

Create `src/lib/runner/tools/utility/sql.ts`:

```typescript
/**
 * SQL query tools for ad-hoc data exploration.
 * @module lib/runner/tools/utility/sql
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Creates SQL query tools.
 *
 * These tools call Postgres functions that enforce read-only mode and
 * RLS via SECURITY INVOKER. The agent can only see the client's own data.
 */
export function createSqlTools(
  supabase: SupabaseClient<Database>,
  _clientId: string,
) {
  const run_agent_memory_sql = tool({
    description:
      "Run a read-only SQL query against your CRM and agent database. " +
      "RLS is enforced — you can only see your own client data. " +
      "Use this for ad-hoc questions like 'how many deals closed this month?' " +
      "or 'which contacts have no interactions in the last 30 days?'. " +
      "Call get_agent_db_schema first to see available tables and columns.",
    inputSchema: z.object({
      query: z.string().min(1).describe("SQL SELECT query to execute."),
    }),
    execute: async ({ query }) => {
      const { data, error } = await supabase.rpc("run_readonly_sql", {
        query_text: query,
      });

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, rows: data };
    },
  });

  const get_agent_db_schema = tool({
    description:
      "Get the database schema for tables you can query. " +
      "Returns table names, column names, types, and nullability. " +
      "Call this before run_agent_memory_sql to write correct queries.",
    inputSchema: z.object({}),
    execute: async () => {
      const { data, error } = await supabase.rpc(
        "get_client_accessible_schema",
      );

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, schema: data };
    },
  });

  return { run_agent_memory_sql, get_agent_db_schema };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/sql.test.ts
```

Expected: PASS — all 5 tests green.

---

## Task 6: Utility Tool Barrel + Wire Into Runner

**Files:**
- Create: `src/lib/runner/tools/utility/index.ts`
- Create: `src/lib/runner/tools/utility/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`
- Modify: `src/lib/runner/__tests__/serialization.test.ts`
- Modify: `src/lib/runner/__tests__/stale-cleanup.test.ts`
- Modify: `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts`

### Step 1: Write failing tests for utility barrel

Create `src/lib/runner/tools/utility/__tests__/index.test.ts`:

```typescript
/**
 * Tests for the utility tool barrel.
 * @module lib/runner/tools/utility/__tests__/index
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createUtilityTools } from "../index";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createUtilityTools", () => {
  it("returns all 5 utility tools", () => {
    const supabase = createMockSupabaseClient();
    const tools = createUtilityTools(supabase as never, CLIENT_ID, THREAD_ID);

    expect(Object.keys(tools).sort()).toEqual([
      "get_agent_db_schema",
      "list_todo",
      "manage_todo",
      "rename_chat",
      "run_agent_memory_sql",
    ]);
  });

  it("each tool has an execute function", () => {
    const supabase = createMockSupabaseClient();
    const tools = createUtilityTools(supabase as never, CLIENT_ID, THREAD_ID);

    for (const [name, t] of Object.entries(tools)) {
      expect(t, `${name} should have execute`).toHaveProperty("execute");
    }
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts
```

Expected: FAIL — module `../index` does not exist.

### Step 3: Implement utility barrel

Create `src/lib/runner/tools/utility/index.ts`:

```typescript
/**
 * Utility tool factory barrel for the runner.
 * @module lib/runner/tools/utility
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createRenameChatTool } from "./rename-chat";
import { createSqlTools } from "./sql";
import { createTodoTools } from "./todo";

/**
 * Creates all utility tools for registration in `streamText({ tools })`.
 *
 * Unlike CRM tools (which only need clientId), utility tools also accept
 * threadId because agent_todo and rename_chat are thread-scoped.
 */
export function createUtilityTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  const todoTools = createTodoTools(supabase, clientId, threadId);
  const renameChatTool = createRenameChatTool(supabase, clientId, threadId);
  const sqlTools = createSqlTools(supabase, clientId);

  return {
    ...todoTools,
    ...renameChatTool,
    ...sqlTools,
  };
}
```

### Step 4: Run barrel tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts
```

Expected: PASS — all 2 tests green.

### Step 5: Write failing test for runner wiring

Update `src/lib/runner/__tests__/run-agent.test.ts`. Add `mockCreateUtilityTools` to the vi.hoisted block and update the mock and assertion:

Apply the same `createUtilityTools` mock export update to:
- `src/lib/runner/__tests__/serialization.test.ts`
- `src/lib/runner/__tests__/stale-cleanup.test.ts`
- `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts`

In the `vi.hoisted` block, add:
```typescript
mockCreateUtilityTools: vi.fn(),
```

Add a new `vi.mock` for the utility tools — update the existing tools mock:
```typescript
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createStorageTools: mockCreateStorageTools,
  createWebTools: mockCreateWebTools,
  createUtilityTools: mockCreateUtilityTools,
}));
```

In `beforeEach`, add:
```typescript
mockCreateUtilityTools.mockReturnValue({
  manage_todo: { description: "utility-tool" },
  list_todo: { description: "utility-tool" },
  rename_chat: { description: "utility-tool" },
  run_agent_memory_sql: { description: "utility-tool" },
  get_agent_db_schema: { description: "utility-tool" },
});
```

In the `"streams when lock is acquired"` test, update the `tools` assertion to include utility tools:
```typescript
tools: {
  search_contacts: { description: "tool" },
  create_contact: { description: "tool" },
  update_contact: { description: "tool" },
  search_deals: { description: "tool" },
  create_deal: { description: "tool" },
  update_deal: { description: "tool" },
  search_tasks: { description: "tool" },
  create_task: { description: "tool" },
  update_task: { description: "tool" },
  create_interaction: { description: "tool" },
  read_file: { description: "storage-tool" },
  write_file: { description: "storage-tool" },
  web_search: { description: "web-search-tool" },
  web_scrape: { description: "web-scrape-tool" },
  manage_todo: { description: "utility-tool" },
  list_todo: { description: "utility-tool" },
  rename_chat: { description: "utility-tool" },
  run_agent_memory_sql: { description: "utility-tool" },
  get_agent_db_schema: { description: "utility-tool" },
},
```

Add an assertion for createUtilityTools call args:
```typescript
expect(mockCreateUtilityTools).toHaveBeenCalledWith(
  "mock-supabase-client",
  validPayload.clientId,
  validPayload.threadId,
);
```

### Step 6: Run run-agent tests to verify they fail

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
npx vitest run src/lib/runner/__tests__/serialization.test.ts
npx vitest run src/lib/runner/__tests__/stale-cleanup.test.ts
npx vitest run src/lib/runner/__tests__/run-agent-tool-error-path.test.ts
```

Expected: FAIL — `createUtilityTools` not imported in run-agent.ts.

### Step 7: Wire utility tools into the runner

Update `src/lib/runner/tools/index.ts`:

Add to existing exports:
```typescript
export { createUtilityTools } from "./utility";
```

Update `src/lib/runner/run-agent.ts`:

Add `createUtilityTools` to the import:
```typescript
import { createCrmTools, createStorageTools, createUtilityTools, createWebTools } from "@/lib/runner/tools";
```

Update the `RunnerTools` type:
```typescript
type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createWebTools> &
  ReturnType<typeof createUtilityTools>;
```

Inside the `try` block, after `const webTools = createWebTools();`:
```typescript
const utilityTools = createUtilityTools(supabase, clientId, threadId);
```

Update the tools merge:
```typescript
const tools = {
  ...crmTools,
  ...storageTools,
  ...webTools,
  ...utilityTools,
};
```

### Step 8: Run run-agent tests to verify they pass

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
npx vitest run src/lib/runner/__tests__/serialization.test.ts
npx vitest run src/lib/runner/__tests__/stale-cleanup.test.ts
npx vitest run src/lib/runner/__tests__/run-agent-tool-error-path.test.ts
```

Expected: PASS — all existing tests green plus new utility tool assertions.

---

## Summary (Part A)

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | agent_todo migration | 1 SQL | — |
| 2 | SQL helper functions migration | 1 SQL | 1 TS (types) |
| 3 | Todo tools (manage_todo + list_todo) | 2 TS | — |
| 4 | rename_chat tool | 2 TS | — |
| 5 | SQL query tools | 2 TS | — |
| 6 | Utility barrel + runner wiring | 2 TS | 6 TS |

**Part A total: 10 new files, 7 modified files, 2 SQL migrations**

**Next:** Proceed to Part B (`2026-03-05-pr15b-context-assembly-tasklist.md`).
