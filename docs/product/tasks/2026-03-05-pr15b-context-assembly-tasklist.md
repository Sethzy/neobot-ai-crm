# PR 15 Part B: Context Assembly + Platform Instructions

**PR:** PR 15: Platform instructions + system-reminder + utility tools
**Part:** B of 2 — Platform instructions, system-reminder builder, 7-layer context assembly
**Decisions:** RUNNER-03, RUNNER-04, RUNNER-09
**Goal:** Implement platform instructions constant, per-turn system-reminder builder, and refactor context assembly to 7-layer order (platform instructions → SYSTEM_PROMPT → SOUL.md → USER.md → MEMORY.md → system-reminder).

**Architecture:** The system string follows a 7-layer order. Platform instructions are a new constant forked from Tasklet v2, adapted for Sunder (filesystem, SQL DB, tasks, state directory, thread-naming). System-reminder is a per-turn state snapshot (~130 tokens target) appended to the system string. The `get_system_reminder_context` RPC (created in Part A's migration) gathers user info, todo count, and memory file count in a single round trip.

**Tech Stack:** Supabase (Postgres + RLS), Vercel AI SDK v6, Next.js 15, Vitest, Zod 4

**Prerequisite:** Part A (`2026-03-05-pr15a-utility-tools-tasklist.md`) must be completed first. Part A provides the agent_todo table, SQL helper functions (including `get_system_reminder_context` RPC), utility tools, and runner wiring.

### Part A Contract (Required Before Starting Part B)

1. `manage_todo` supports add/update/delete and `list_todo` supports optional ID filtering.
2. `agent_todo` uses `payload JSONB NOT NULL DEFAULT '{}'::jsonb` with RLS update policy.
3. Todo mutations are thread-scoped (`id + client_id + thread_id`).
4. `get_agent_db_schema` includes per-table `row_count`.
5. `run_readonly_sql` enforces single-statement `SELECT/WITH` query shape.
6. `get_system_reminder_context` has client ownership checks and real `memory_file_count` (no hardcoded placeholder).
7. Runner test mocks for `createUtilityTools` are updated across all run-agent-related test files.

---

## Relevant Files

### Create
- `src/lib/ai/platform-instructions.ts`
- `src/lib/ai/__tests__/platform-instructions.test.ts`
- `src/lib/runner/system-reminder.ts`
- `src/lib/runner/__tests__/system-reminder.test.ts`

### Modify
- `src/lib/runner/context.ts` — 7-layer system string assembly
- `src/lib/runner/__tests__/context.test.ts` — update for platform instructions + system-reminder

### Reference (do not modify)
- `src/lib/ai/system-prompt.ts` — SYSTEM_PROMPT constant (position #2 in 7-layer order)
- `src/lib/memory/loader.ts` — loadMemoryContext (positions #3-5)
- `src/lib/memory/constants.ts` — MEMORY_BUCKET_ID, ROOT_MEMORY_FILE_PATHS
- `src/test/mocks/supabase.ts` — createMockSupabaseClient helper
- `supabase/migrations/20260305030001_create_sql_helper_functions.sql` — get_system_reminder_context RPC (from Part A)

---

## Task 7: Platform Instructions

**Files:**
- Create: `src/lib/ai/__tests__/platform-instructions.test.ts`
- Create: `src/lib/ai/platform-instructions.ts`

### Step 1: Write failing tests for platform instructions

Create `src/lib/ai/__tests__/platform-instructions.test.ts`:

```typescript
/**
 * Tests for platform instructions constant.
 * @module lib/ai/__tests__/platform-instructions
 */
import { describe, expect, it } from "vitest";

import { PLATFORM_INSTRUCTIONS } from "../platform-instructions";

describe("PLATFORM_INSTRUCTIONS", () => {
  it("is a non-empty string", () => {
    expect(typeof PLATFORM_INSTRUCTIONS).toBe("string");
    expect(PLATFORM_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it("contains filesystem guidance", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("filesystem");
  });

  it("contains SQL database guidance", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("sql");
  });

  it("contains tasks/todo guidance", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("todo");
  });

  it("contains state directory convention", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("state");
  });

  it("contains rename_chat instruction", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("rename_chat");
  });

  it("does not duplicate personality section from SYSTEM_PROMPT", () => {
    expect(PLATFORM_INSTRUCTIONS).not.toContain("<your-personality>");
  });

  it("does not duplicate tool-usage section from SYSTEM_PROMPT", () => {
    expect(PLATFORM_INSTRUCTIONS).not.toContain("<tool-usage>");
  });

  it("does not duplicate approval-required section from SYSTEM_PROMPT", () => {
    expect(PLATFORM_INSTRUCTIONS).not.toContain("<approval-required>");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/ai/__tests__/platform-instructions.test.ts
```

Expected: FAIL — module `../platform-instructions` does not exist.

### Step 3: Implement platform instructions

Create `src/lib/ai/platform-instructions.ts`:

```typescript
/**
 * Platform-level operational instructions for the runner.
 *
 * Position #1 in the 7-layer context assembly (before SYSTEM_PROMPT).
 * Covers workspace conventions that the agent must follow but that do not
 * belong in the personality/tool-usage prompt (SYSTEM_PROMPT).
 *
 * Forked from Tasklet v2 system prompt (TASKLET-01), adapted for Sunder.
 * Does NOT duplicate content already in SYSTEM_PROMPT (personality,
 * CRM tool-usage, approval rules, output guidance, memory auto-write rules).
 *
 * @module lib/ai/platform-instructions
 */
export const PLATFORM_INSTRUCTIONS = `<platform-instructions>
<filesystem>
You have a workspace of files accessible via read_file and write_file tools.

Layout:
- SOUL.md — your identity (read-only)
- USER.md — user profile (read+write)
- MEMORY.md — working notebook (read+write, first 200 lines loaded each run)
- memory/ — topic files for organized storage
- vault/ — user documents, indexed in Knowledge Base
- state/ — ephemeral working state for multi-step processes

Conventions:
- Use descriptive filenames with dates (e.g. "market-analysis-bishan-2026-03-05.md").
- Use state/ for intermediate work (draft emails, scraped data, analysis steps). Clean up when done.
- Never store secrets or credentials in files.
</filesystem>

<tasks>
You have a scratchpad todo list scoped to this conversation thread.

Use manage_todo to add items you need to remember or continue later.
Use list_todo at the start of a run to check for unfinished work.

Todos are simple notes-to-self, not user-facing tasks. For user-facing follow-ups and deadlines, use the CRM task tools (create_task, update_task, search_tasks) instead.

When you finish a todo item, delete it via manage_todo. Keep the list clean.
</tasks>

<sql-db>
You can run read-only SQL queries against the CRM database.

Use get_agent_db_schema to discover available tables and columns.
Use run_agent_memory_sql to execute SELECT queries.

The database enforces row-level security — you can only see data belonging to the current client. Queries have a 10-second timeout.

Use SQL for ad-hoc analysis the structured search tools can't handle:
- Aggregations: "How many deals closed this month?"
- Cross-table joins: "Which contacts have deals but no interactions in 30 days?"
- Date filtering: "Show tasks due this week"

Prefer the CRM search tools for simple lookups. Use SQL when you need aggregation, joins, or complex filtering.
</sql-db>

<state-directory>
Use the state/ directory for ephemeral working state during multi-step processes.

Examples:
- state/draft-email.md — email draft being refined with user feedback
- state/research-notes.md — scraped data being synthesized

Clean up state/ files when the process is complete. State files are not indexed in the Knowledge Base.
</state-directory>

<thread-naming>
After the first meaningful user message, use rename_chat to give this conversation a short descriptive title (under 60 characters). Do not rename if the thread already has a meaningful title.
</thread-naming>
</platform-instructions>`;
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/ai/__tests__/platform-instructions.test.ts
```

Expected: PASS — all 9 tests green.

---

## Task 8: System-Reminder Builder

**Files:**
- Create: `src/lib/runner/__tests__/system-reminder.test.ts`
- Create: `src/lib/runner/system-reminder.ts`

### Step 1: Write failing tests for system-reminder builder

Create `src/lib/runner/__tests__/system-reminder.test.ts`:

```typescript
/**
 * Tests for the per-turn system-reminder builder.
 * @module lib/runner/__tests__/system-reminder
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { buildSystemReminder } from "../system-reminder";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("buildSystemReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T14:30:00Z"));
  });

  it("returns a system-reminder XML block", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      rpcResults: {
        get_system_reminder_context: {
          data: {
            display_name: "John Tan",
            user_email: "john@example.com",
            days_since_signup: 5,
            open_todo_count: 0,
            memory_file_count: 7,
          },
          error: null,
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("<system-reminder>");
    expect(result).toContain("</system-reminder>");
  });

  it("includes current UTC time", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      rpcResults: {
        get_system_reminder_context: {
          data: {
            display_name: "John Tan",
            user_email: "john@example.com",
            days_since_signup: 5,
            open_todo_count: 0,
            memory_file_count: 7,
          },
          error: null,
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("2026-03-05");
  });

  it("includes user display name and email", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      rpcResults: {
        get_system_reminder_context: {
          data: {
            display_name: "Sarah Lee",
            user_email: "sarah@realty.sg",
            days_since_signup: 12,
            open_todo_count: 3,
            memory_file_count: 7,
          },
          error: null,
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Sarah Lee");
    expect(result).toContain("sarah@realty.sg");
  });

  it("includes open todo count for the thread", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      rpcResults: {
        get_system_reminder_context: {
          data: {
            display_name: "John Tan",
            user_email: "john@example.com",
            days_since_signup: 5,
            open_todo_count: 3,
            memory_file_count: 7,
          },
          error: null,
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Open todos: 3");
  });

  it("includes memory file count", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      rpcResults: {
        get_system_reminder_context: {
          data: {
            display_name: "John Tan",
            user_email: "john@example.com",
            days_since_signup: 5,
            open_todo_count: 0,
            memory_file_count: 7,
          },
          error: null,
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Memory files: 7");
  });

  it("includes days since signup", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      rpcResults: {
        get_system_reminder_context: {
          data: {
            display_name: "John Tan",
            user_email: "john@example.com",
            days_since_signup: 42,
            open_todo_count: 0,
            memory_file_count: 7,
          },
          error: null,
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Days since signup: 42");
  });

  it("falls back gracefully when RPC fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
      rpcResults: {
        get_system_reminder_context: {
          data: null,
          error: { message: "function not found" },
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("<system-reminder>");
    expect(result).toContain("2026-03-05");
    // Should still return a valid reminder with available data
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: FAIL — module `../system-reminder` does not exist.

### Step 3: Implement system-reminder builder

Create `src/lib/runner/system-reminder.ts`:

```typescript
/**
 * Builds the per-turn system-reminder injected at the end of the system string.
 *
 * The system-reminder is a compact state snapshot (~30 tokens) that gives
 * the agent awareness of current time, user identity, and workspace state
 * without consuming excessive context.
 *
 * @module lib/runner/system-reminder
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

interface SystemReminderContext {
  display_name: string | null;
  user_email: string | null;
  days_since_signup: number | null;
  open_todo_count: number;
  memory_file_count: number;
}

const FALLBACK_CONTEXT: SystemReminderContext = {
  display_name: null,
  user_email: null,
  days_since_signup: null,
  open_todo_count: 0,
  memory_file_count: 0,
};

/**
 * Fetches system-reminder context from the database.
 *
 * Uses a single RPC call to minimize round trips. Falls back to defaults
 * on failure so the runner never crashes due to reminder assembly.
 */
async function fetchReminderContext(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
): Promise<SystemReminderContext> {
  const { data, error } = await supabase.rpc("get_system_reminder_context", {
    p_client_id: clientId,
    p_thread_id: threadId,
  });

  if (error || !data) {
    return FALLBACK_CONTEXT;
  }

  const context = data as unknown as SystemReminderContext;

  return {
    display_name: context.display_name ?? null,
    user_email: context.user_email ?? null,
    days_since_signup: context.days_since_signup ?? null,
    open_todo_count: context.open_todo_count ?? 0,
    memory_file_count: context.memory_file_count ?? 0,
  };
}

/**
 * Builds the system-reminder XML string for the current turn.
 *
 * This is appended to the end of the system string in context assembly.
 */
export async function buildSystemReminder(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
): Promise<string> {
  const context = await fetchReminderContext(supabase, clientId, threadId);

  const now = new Date();
  const currentTime = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const lines: string[] = [];
  lines.push(`Current time: ${currentTime}`);

  if (context.display_name) {
    lines.push(`User: ${context.display_name}${context.user_email ? ` (${context.user_email})` : ""}`);
  } else if (context.user_email) {
    lines.push(`User: ${context.user_email}`);
  }

  lines.push(`Open todos: ${context.open_todo_count}`);
  lines.push(`Memory files: ${context.memory_file_count}`);

  if (context.days_since_signup !== null) {
    lines.push(`Days since signup: ${context.days_since_signup}`);
  }

  return `<system-reminder>\n${lines.join("\n")}\n</system-reminder>`;
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: PASS — all 7 tests green.

---

## Task 9: Context Assembly Refactor (7-Layer Order)

**Files:**
- Modify: `src/lib/runner/__tests__/context.test.ts`
- Modify: `src/lib/runner/context.ts`

### Step 1: Write failing tests for 7-layer context assembly

Update `src/lib/runner/__tests__/context.test.ts`. Add mocks for the new dependencies and update existing assertions:

Add to the `vi.hoisted` block:
```typescript
const { mockBootstrapMemoryFiles, mockLoadMemoryContext, mockBuildSystemReminder } = vi.hoisted(() => ({
  mockBootstrapMemoryFiles: vi.fn().mockResolvedValue(undefined),
  mockLoadMemoryContext: vi.fn().mockResolvedValue({
    soul: "soul-content",
    user: "user-content",
    memory: "memory-content",
  }),
  mockBuildSystemReminder: vi.fn().mockResolvedValue("<system-reminder>\nCurrent time: 2026-03-05 14:30:00 UTC\nOpen todos: 0\n</system-reminder>"),
}));
```

Add the system-reminder mock:
```typescript
vi.mock("@/lib/runner/system-reminder", () => ({
  buildSystemReminder: mockBuildSystemReminder,
}));
```

Add the new tests:

```typescript
it("includes platform instructions before system prompt when clientId is provided", async () => {
  const supabase = createMockSupabaseClient({
    selectResult: { data: [], error: null },
  });

  const result = await assembleContext({
    supabase: supabase as never,
    threadId: "thread-1",
    currentMessage: "Hello!",
    clientId: "client-123",
  });

  // Platform instructions should appear before SYSTEM_PROMPT content
  const platformIndex = result.system.indexOf("<platform-instructions>");
  const systemPromptIndex = result.system.indexOf("You are Sunder");
  expect(platformIndex).toBeGreaterThanOrEqual(0);
  expect(systemPromptIndex).toBeGreaterThan(platformIndex);
});

it("includes system-reminder at the end of the system string when clientId is provided", async () => {
  const supabase = createMockSupabaseClient({
    selectResult: { data: [], error: null },
  });

  const result = await assembleContext({
    supabase: supabase as never,
    threadId: "thread-1",
    currentMessage: "Hello!",
    clientId: "client-123",
  });

  expect(result.system).toContain("<system-reminder>");
  // System-reminder should be at the very end
  const reminderIndex = result.system.indexOf("<system-reminder>");
  const memoryIndex = result.system.indexOf("<working-memory>");
  expect(reminderIndex).toBeGreaterThan(memoryIndex);
});

it("passes clientId and threadId to buildSystemReminder", async () => {
  const supabase = createMockSupabaseClient({
    selectResult: { data: [], error: null },
  });

  await assembleContext({
    supabase: supabase as never,
    threadId: "thread-1",
    currentMessage: "Hello!",
    clientId: "client-123",
  });

  expect(mockBuildSystemReminder).toHaveBeenCalledWith(
    expect.anything(),
    "client-123",
    "thread-1",
  );
});

it("does not include platform instructions or system-reminder when clientId is omitted", async () => {
  const supabase = createMockSupabaseClient({
    selectResult: { data: [], error: null },
  });

  const result = await assembleContext({
    supabase: supabase as never,
    threadId: "thread-1",
    currentMessage: "Hello!",
  });

  expect(result.system).not.toContain("<platform-instructions>");
  expect(result.system).not.toContain("<system-reminder>");
  expect(mockBuildSystemReminder).not.toHaveBeenCalled();
});
```

Update the existing `"injects memory sections when clientId is provided"` test to also check 7-layer order:

```typescript
it("assembles system string in 7-layer order when clientId is provided", async () => {
  const supabase = createMockSupabaseClient({
    selectResult: { data: [], error: null },
  });

  const result = await assembleContext({
    supabase: supabase as never,
    threadId: "thread-1",
    currentMessage: "Hello!",
    clientId: "client-123",
  });

  // Verify order: platform instructions → system prompt → soul → user → memory → system-reminder
  const platformIdx = result.system.indexOf("<platform-instructions>");
  const sunderIdx = result.system.indexOf("You are Sunder");
  const soulIdx = result.system.indexOf("<soul>");
  const userIdx = result.system.indexOf("<user-profile>");
  const memoryIdx = result.system.indexOf("<working-memory>");
  const reminderIdx = result.system.indexOf("<system-reminder>");

  expect(platformIdx).toBeLessThan(sunderIdx);
  expect(sunderIdx).toBeLessThan(soulIdx);
  expect(soulIdx).toBeLessThan(userIdx);
  expect(userIdx).toBeLessThan(memoryIdx);
  expect(memoryIdx).toBeLessThan(reminderIdx);
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: FAIL — platform instructions not in system string, system-reminder not in system string.

### Step 3: Refactor context assembly for 7-layer order

Update `src/lib/runner/context.ts`:

Add imports:
```typescript
import { PLATFORM_INSTRUCTIONS } from "@/lib/ai/platform-instructions";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
```

Replace the `buildSystemPrompt` function with a new version that accepts the system-reminder:

```typescript
function buildSystemPrompt(
  memory?: MemoryContext,
  systemReminder?: string,
): string {
  if (!memory) {
    return SYSTEM_PROMPT;
  }

  const sections: string[] = [];

  // Layer 1: Platform instructions
  sections.push(PLATFORM_INSTRUCTIONS);

  // Layer 2: System prompt (personality, tool-usage, approval, output, memory)
  sections.push(SYSTEM_PROMPT);

  // Layer 3: SOUL.md
  if (memory.soul.length > 0) {
    sections.push(`<soul>\n${memory.soul}\n</soul>`);
  }

  // Layer 4: USER.md
  if (memory.user.length > 0) {
    sections.push(`<user-profile>\n${memory.user}\n</user-profile>`);
  }

  // Layer 5: MEMORY.md (capped to 200 lines)
  if (memory.memory.length > 0) {
    sections.push(`<working-memory>\n${memory.memory}\n</working-memory>`);
  }

  // Layer 6: System-reminder (per-turn state snapshot)
  if (systemReminder) {
    sections.push(systemReminder);
  }

  return sections.join("\n\n");
}
```

Update `assembleContext` to build the system-reminder:

```typescript
export async function assembleContext({
  supabase,
  threadId,
  currentMessage,
  clientId,
}: AssembleContextParams): Promise<AssembledContext> {
  let memoryContext: MemoryContext | undefined;
  let systemReminder: string | undefined;

  if (clientId) {
    await bootstrapMemoryFiles(supabase, clientId);
    [memoryContext, systemReminder] = await Promise.all([
      loadMemoryContext(supabase, clientId),
      buildSystemReminder(supabase, clientId, threadId),
    ]);
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .select("role, content, parts")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load thread history: ${error.message}`);
  }

  const historyMessages: ModelMessage[] = ((data as HistoryRow[] | null) ?? []).map((row) => ({
    role: normalizeRole(row.role),
    content: row.content ?? getTextFromParts(row.parts),
  }));

  const trimmedCurrentMessage = currentMessage.trim();
  const currentMessageTurn = trimmedCurrentMessage.length > 0
    ? [{
      role: "user" as const,
      content: trimmedCurrentMessage,
    }]
    : [];

  return {
    system: buildSystemPrompt(memoryContext, systemReminder),
    messages: [
      ...historyMessages,
      ...currentMessageTurn,
    ],
  };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: PASS — all tests green (existing + new 7-layer tests).

### Step 5: Run all runner tests to check for regressions

```bash
npx vitest run src/lib/runner/__tests__/
```

Expected: PASS — all runner tests green.

---

## Task 10: Final Verification

### Step 1: Run all project tests

```bash
npx vitest run
```

Expected: All tests pass with no errors or warnings.

### Step 2: TypeScript type check

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 3: Lint check

```bash
npx next lint
```

Expected: No lint errors in new files.

### Step 4: Verify test criteria from v2 plan

Review each test criterion:

1. **Agent knows current time and user context without being told** — system-reminder injects current time, user name/email, days since signup on every turn.
2. **Agent can run ad-hoc SQL queries like "how many deals closed this month?"** — run_agent_memory_sql calls run_readonly_sql RPC with RLS enforcement.
3. **Agent auto-titles threads after first exchange** — rename_chat tool + platform instructions `<thread-naming>` section tells agent when to rename.
4. **Agent creates todo via manage_todo, next trigger run reads via list_todo** — both tools implemented, thread-scoped, system-reminder shows open todo count.
5. **manage_todo batch: add 3 + delete 1 in single call** — batch operations array with per-operation error reporting.
6. **System-reminder shows accurate "Open todos: N" scoped to thread** — get_system_reminder_context RPC counts agent_todo rows for the specific thread.

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 7 | Platform instructions | 2 TS | — |
| 8 | System-reminder builder | 2 TS | — |
| 9 | Context assembly refactor | — | 2 TS |
| 10 | Final verification | — | — |

**Total: 4 new files, 2 modified files**
