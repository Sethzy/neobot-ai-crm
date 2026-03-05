# Memory System Implementation Plan

**PR:** PR 14: Memory system
**Decisions:** MEM-03, MEM-04, MEM-05, MEM-06, DATA-06
**Goal:** Seed topic files, add auto-write instructions, and build a memory page for viewing/editing all memory files.

**Architecture:** Memory lives as markdown files in Supabase Storage under `/{clientId}/memory/`. Four topic files seeded on bootstrap alongside SOUL.md/USER.md/MEMORY.md (MEM-04). Agent reads/writes via existing `read_file`/`write_file` tools — no separate memory tools (MEM-03). Auto-write rules encoded in system prompt (MEM-05). Memory shared across all threads for same client (MEM-06). Discovery via directory listing, no DB index (DATA-06).

**Tech Stack:** Supabase Storage, Next.js 15 App Router, TanStack Query, React 19, ShadCN UI, Tailwind 4, Vitest

**Prerequisite:** PR 13 (memory bootstrap) must be merged before starting implementation.

## Decision Lock (2026-03-05)

These execution decisions were explicitly approved and override any ambiguous implementation details below:

1. **B** — Keep root-file typing strict; use a separate generic existence check for topic files.
2. **B** — Enforce API path allowlist (`SOUL.md`, `USER.md`, `MEMORY.md`, `memory/**`) for memory routes.
3. **A** — Keep one-level memory listing for PR 14 (`memory/*.md` only). No recursive listing in this PR.
4. **B** — Add API route tests, query hook tests, and memory page behavior tests.
5. **B** — Guard viewer/editor state to prevent data loss on file switches and failed saves.
6. **B** — Implement mobile-responsive memory page layout (stacked/toggle behavior on small screens).
7. **B** — Add shared constants + Zod schemas at memory API boundaries.
8. **A** — Keep prompt contract tests as substring-presence checks (avoid brittle structural assertions).
9. **B** — Final result should be one clean PR14 commit (local checkpoints during implementation are fine).

---

## Relevant Files

### Create
- `src/lib/memory/__tests__/list-memory-files.test.ts`
- `src/lib/ai/__tests__/system-prompt.test.ts`
- `app/api/memory/files/route.ts`
- `app/api/memory/file/route.ts`
- `src/lib/memory/queries.ts`
- `src/components/memory/memory-file-list.tsx`
- `src/components/memory/memory-file-viewer.tsx`

### Modify
- `src/lib/memory/templates.ts`
- `src/lib/memory/__tests__/templates.test.ts`
- `src/lib/memory/bootstrap.ts`
- `src/lib/memory/__tests__/bootstrap.test.ts`
- `src/lib/memory/loader.ts`
- `src/lib/ai/system-prompt.ts`
- `app/(dashboard)/memory/page.tsx`

### Reference (do not modify)
- `src/lib/storage/agent-files.ts` — agent file client API
- `src/lib/runner/tools/storage/index.ts` — read_file/write_file tools (already support memory paths)
- `src/lib/runner/run-agent.ts` — runner (already passes clientId)
- `src/lib/runner/context.ts` — context assembly (already loads SOUL/USER/MEMORY.md)
- `src/lib/chat/client-id.ts` — `resolveClientId()` helper for API routes

---

## Task 1: Memory Topic File Templates

**Files:**
- Modify: `src/lib/memory/templates.ts`
- Modify: `src/lib/memory/__tests__/templates.test.ts`

### Step 1: Write failing tests for topic file templates

Add to `src/lib/memory/__tests__/templates.test.ts`:

```typescript
import {
  DEFAULT_PREFERENCES_MD,
  DEFAULT_GROWTH_PLAN_MD,
  DEFAULT_PATTERNS_MD,
  DEFAULT_KEY_DECISIONS_MD,
} from "../templates";

describe("DEFAULT_PREFERENCES_MD", () => {
  it("starts with a preferences header", () => {
    expect(DEFAULT_PREFERENCES_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_PREFERENCES_MD).toContain("# Preferences");
  });
});

describe("DEFAULT_GROWTH_PLAN_MD", () => {
  it("starts with a growth plan header", () => {
    expect(DEFAULT_GROWTH_PLAN_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_GROWTH_PLAN_MD).toContain("# Growth Plan");
  });
});

describe("DEFAULT_PATTERNS_MD", () => {
  it("starts with a patterns header", () => {
    expect(DEFAULT_PATTERNS_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_PATTERNS_MD).toContain("# Patterns");
  });
});

describe("DEFAULT_KEY_DECISIONS_MD", () => {
  it("starts with a key decisions header", () => {
    expect(DEFAULT_KEY_DECISIONS_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_KEY_DECISIONS_MD).toContain("# Key Decisions");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/memory/__tests__/templates.test.ts
```

Expected: FAIL — imports don't exist yet.

### Step 3: Implement the topic file templates

Add to `src/lib/memory/templates.ts`:

```typescript
/**
 * Default memory/preferences.md content.
 *
 * Agent writes here immediately when user states a lasting preference.
 * Do NOT write transient requests. (MEM-05)
 */
export const DEFAULT_PREFERENCES_MD = `# Preferences

Working style, communication preferences, and tool preferences.
`;

/**
 * Default memory/growth-plan.md content.
 *
 * Agent writes when user explicitly requests or when a confirmed pattern
 * seems actionable. (MEM-04)
 */
export const DEFAULT_GROWTH_PLAN_MD = `# Growth Plan

Skill-building roadmap.
`;

/**
 * Default memory/patterns.md content.
 *
 * Agent writes after 3+ instances of same behavior.
 * Include evidence dates. (MEM-05)
 */
export const DEFAULT_PATTERNS_MD = `# Patterns

Recurring behaviors with evidence dates.
`;

/**
 * Default memory/key-decisions.md content.
 *
 * Agent writes when a significant, hard-to-reverse decision is made.
 * Include reasoning. For major decisions, agent may create dedicated files
 * like memory/key-decisions/2026-02-26-pricing.md. (MEM-04, MEM-05)
 */
export const DEFAULT_KEY_DECISIONS_MD = `# Key Decisions

Significant decisions with reasoning.
`;
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/memory/__tests__/templates.test.ts
```

Expected: All PASS.

### Step 5: Commit

```bash
git add src/lib/memory/templates.ts src/lib/memory/__tests__/templates.test.ts
git commit -m "feat(pr14): add memory topic file templates"
```

---

## Task 2: Extend Bootstrap for Topic Files

**Files:**
- Modify: `src/lib/memory/bootstrap.ts`
- Modify: `src/lib/memory/__tests__/bootstrap.test.ts`

**Context:** The current bootstrap checks each root file independently (SOUL.md, USER.md, MEMORY.md) and creates missing ones. We extend it to also check and create the 4 topic files under `memory/`. The `MemoryFileTemplate.path` type must be widened from the union literal to `string` to accept topic file paths like `"memory/preferences.md"`.

### Step 1: Write failing test — bootstrap creates topic files when missing

Add a new test to `src/lib/memory/__tests__/bootstrap.test.ts`. The existing `createMockStorage()` helper returns `{ client, mockDownload, mockUpload, mockFrom }`.

```typescript
import {
  DEFAULT_PREFERENCES_MD,
  DEFAULT_GROWTH_PLAN_MD,
  DEFAULT_PATTERNS_MD,
  DEFAULT_KEY_DECISIONS_MD,
} from "../templates";

// Add inside the existing describe("bootstrapMemoryFiles") block:

it("creates topic files when root files exist but topic files are missing", async () => {
  // Root files exist (3 downloads succeed)
  // Topic files missing (4 downloads fail)
  mock.mockDownload
    .mockResolvedValueOnce({ data: createDownloadPayload("soul"), error: null })
    .mockResolvedValueOnce({ data: createDownloadPayload("user"), error: null })
    .mockResolvedValueOnce({ data: createDownloadPayload("memory"), error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "Object not found" } })
    .mockResolvedValueOnce({ data: null, error: { message: "Object not found" } })
    .mockResolvedValueOnce({ data: null, error: { message: "Object not found" } })
    .mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
  mock.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });

  await bootstrapMemoryFiles(mock.client, CLIENT_ID);

  expect(mock.mockUpload).toHaveBeenCalledTimes(4);
  expect(mock.mockUpload).toHaveBeenCalledWith(
    `${CLIENT_ID}/memory/preferences.md`,
    DEFAULT_PREFERENCES_MD,
    { upsert: false, contentType: "text/plain; charset=utf-8" },
  );
  expect(mock.mockUpload).toHaveBeenCalledWith(
    `${CLIENT_ID}/memory/growth-plan.md`,
    DEFAULT_GROWTH_PLAN_MD,
    { upsert: false, contentType: "text/plain; charset=utf-8" },
  );
  expect(mock.mockUpload).toHaveBeenCalledWith(
    `${CLIENT_ID}/memory/patterns.md`,
    DEFAULT_PATTERNS_MD,
    { upsert: false, contentType: "text/plain; charset=utf-8" },
  );
  expect(mock.mockUpload).toHaveBeenCalledWith(
    `${CLIENT_ID}/memory/key-decisions.md`,
    DEFAULT_KEY_DECISIONS_MD,
    { upsert: false, contentType: "text/plain; charset=utf-8" },
  );
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: FAIL — bootstrap only checks 3 files, not 7.

### Step 3: Write failing test — all 7 files exist means nothing created

```typescript
it("does nothing when all root and topic files exist", async () => {
  // All 7 downloads succeed
  for (let i = 0; i < 7; i++) {
    mock.mockDownload.mockResolvedValueOnce({
      data: createDownloadPayload("existing"),
      error: null,
    });
  }

  await bootstrapMemoryFiles(mock.client, CLIENT_ID);

  expect(mock.mockUpload).not.toHaveBeenCalled();
});
```

### Step 4: Run test to verify it fails

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: FAIL — bootstrap only checks 3 files.

### Step 5: Update bootstrap to include topic files

In `src/lib/memory/bootstrap.ts`:

1. Import the new templates:

```typescript
import {
  DEFAULT_MEMORY_MD,
  DEFAULT_SOUL_MD,
  DEFAULT_USER_MD,
  DEFAULT_PREFERENCES_MD,
  DEFAULT_GROWTH_PLAN_MD,
  DEFAULT_PATTERNS_MD,
  DEFAULT_KEY_DECISIONS_MD,
} from "./templates";
```

2. Widen the `MemoryFileTemplate.path` type and add topic files:

```typescript
interface MemoryFileTemplate {
  path: string;
  content: string;
}

const REQUIRED_MEMORY_FILES: MemoryFileTemplate[] = [
  { path: "SOUL.md", content: DEFAULT_SOUL_MD },
  { path: "USER.md", content: DEFAULT_USER_MD },
  { path: "MEMORY.md", content: DEFAULT_MEMORY_MD },
  { path: "memory/preferences.md", content: DEFAULT_PREFERENCES_MD },
  { path: "memory/growth-plan.md", content: DEFAULT_GROWTH_PLAN_MD },
  { path: "memory/patterns.md", content: DEFAULT_PATTERNS_MD },
  { path: "memory/key-decisions.md", content: DEFAULT_KEY_DECISIONS_MD },
];
```

No other changes needed — the existing loop already iterates `REQUIRED_MEMORY_FILES` and checks each file independently.

### Step 6: Run tests to verify they pass

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: All PASS. Verify the existing tests still pass too (the "creates only files that are missing" test with 3 root files will need its mock setup updated to account for 7 download calls instead of 3).

### Step 7: Fix any existing tests broken by the new file count

The existing test "creates only files that are missing" mocks exactly 3 downloads. With 7 files now checked, it needs 7 mock download responses. Update the existing test's mock setup so the first 3 match their original behavior and the remaining 4 (topic files) return either existing or not-found as appropriate.

Similarly, "does nothing when all required files already exist" needs 7 successful downloads instead of 3.

Run the full test suite to confirm:

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: All PASS.

### Step 8: Commit

```bash
git add src/lib/memory/bootstrap.ts src/lib/memory/__tests__/bootstrap.test.ts
git commit -m "feat(pr14): seed memory topic files in bootstrap"
```

---

## Task 3: Memory File Listing Helper

**Files:**
- Modify: `src/lib/memory/loader.ts`
- Create: `src/lib/memory/__tests__/list-memory-files.test.ts`

**Context:** We need a helper that lists all memory-related files for a client — used by the memory page API and by PR 15's system-reminder (memory file count). Uses `supabase.storage.from().list()` directly (not the agent file client) because it needs raw file metadata (updated_at). Returns root files (SOUL.md, USER.md, MEMORY.md) + topic files (memory/*.md).

### Step 1: Write failing test — lists root and topic files

Create `src/lib/memory/__tests__/list-memory-files.test.ts`:

```typescript
/**
 * Tests for memory file listing helper.
 * @module lib/memory/__tests__/list-memory-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listMemoryFiles } from "../loader";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function createMockStorageList() {
  const mockList = vi.fn();
  const mockFrom = vi.fn(() => ({ list: mockList }));

  return {
    client: { storage: { from: mockFrom } } as unknown as SupabaseClient,
    mockList,
    mockFrom,
  };
}

describe("listMemoryFiles", () => {
  let mock: ReturnType<typeof createMockStorageList>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockStorageList();
  });

  it("returns root memory files and topic files", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [
          { id: "1", name: "SOUL.md", updated_at: "2026-03-05T00:00:00Z" },
          { id: "2", name: "USER.md", updated_at: "2026-03-05T01:00:00Z" },
          { id: "3", name: "MEMORY.md", updated_at: "2026-03-05T02:00:00Z" },
          { id: null, name: "memory" },
          { id: "99", name: "some-other-file.txt", updated_at: "2026-01-01T00:00:00Z" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { id: "4", name: "preferences.md", updated_at: "2026-03-05T03:00:00Z" },
          { id: "5", name: "growth-plan.md", updated_at: "2026-03-05T04:00:00Z" },
          { id: "6", name: "patterns.md", updated_at: "2026-03-05T05:00:00Z" },
          { id: "7", name: "key-decisions.md", updated_at: "2026-03-05T06:00:00Z" },
        ],
        error: null,
      });

    const result = await listMemoryFiles(mock.client, CLIENT_ID);

    expect(result).toEqual([
      { name: "SOUL.md", path: "SOUL.md", updatedAt: "2026-03-05T00:00:00Z" },
      { name: "USER.md", path: "USER.md", updatedAt: "2026-03-05T01:00:00Z" },
      { name: "MEMORY.md", path: "MEMORY.md", updatedAt: "2026-03-05T02:00:00Z" },
      { name: "preferences.md", path: "memory/preferences.md", updatedAt: "2026-03-05T03:00:00Z" },
      { name: "growth-plan.md", path: "memory/growth-plan.md", updatedAt: "2026-03-05T04:00:00Z" },
      { name: "patterns.md", path: "memory/patterns.md", updatedAt: "2026-03-05T05:00:00Z" },
      { name: "key-decisions.md", path: "memory/key-decisions.md", updatedAt: "2026-03-05T06:00:00Z" },
    ]);

    // Verify correct storage paths
    expect(mock.mockFrom).toHaveBeenCalledWith("agent-files");
    expect(mock.mockList).toHaveBeenCalledWith(CLIENT_ID, expect.any(Object));
    expect(mock.mockList).toHaveBeenCalledWith(`${CLIENT_ID}/memory`, expect.any(Object));
  });

  it("filters out non-memory root files and directory entries", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [
          { id: "1", name: "SOUL.md", updated_at: "2026-03-05T00:00:00Z" },
          { id: "99", name: "random.txt", updated_at: "2026-01-01T00:00:00Z" },
          { id: null, name: "memory" },
          { id: null, name: "vault" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await listMemoryFiles(mock.client, CLIENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("SOUL.md");
  });

  it("returns empty array when no files exist", async () => {
    mock.mockList
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await listMemoryFiles(mock.client, CLIENT_ID);

    expect(result).toEqual([]);
  });

  it("throws when root listing fails", async () => {
    mock.mockList.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(listMemoryFiles(mock.client, CLIENT_ID)).rejects.toThrow(
      "permission denied",
    );
  });

  it("throws when topic listing fails", async () => {
    mock.mockList
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "bucket not found" },
      });

    await expect(listMemoryFiles(mock.client, CLIENT_ID)).rejects.toThrow(
      "bucket not found",
    );
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/memory/__tests__/list-memory-files.test.ts
```

Expected: FAIL — `listMemoryFiles` is not exported from `loader.ts`.

### Step 3: Implement listMemoryFiles

Add to `src/lib/memory/loader.ts`:

```typescript
const BUCKET_ID = "agent-files";
const ROOT_MEMORY_FILES = new Set(["SOUL.md", "USER.md", "MEMORY.md"]);

/** Metadata about a single memory file in storage. */
export interface MemoryFileInfo {
  /** Display name (e.g. "SOUL.md" or "preferences.md"). */
  name: string;
  /** Workspace-relative path (e.g. "SOUL.md" or "memory/preferences.md"). */
  path: string;
  /** ISO timestamp of last modification, or null if unavailable. */
  updatedAt: string | null;
}

/**
 * Lists all memory-related files for a client.
 *
 * Returns root files (SOUL.md, USER.md, MEMORY.md) plus all topic files
 * under memory/. Non-memory files in the workspace root are excluded.
 * Used by the memory page API and system-reminder (file count).
 */
export async function listMemoryFiles(
  supabase: SupabaseClient,
  clientId: string,
): Promise<MemoryFileInfo[]> {
  const bucket = supabase.storage.from(BUCKET_ID);

  const { data: rootData, error: rootError } = await bucket.list(clientId, {
    sortBy: { column: "name", order: "asc" },
  });

  if (rootError) {
    throw new Error(`Failed to list root files: ${rootError.message}`);
  }

  const rootFiles: MemoryFileInfo[] = (rootData ?? [])
    .filter((item) => item.id !== null && ROOT_MEMORY_FILES.has(item.name))
    .map((item) => ({
      name: item.name,
      path: item.name,
      updatedAt: item.updated_at ?? null,
    }));

  const { data: topicData, error: topicError } = await bucket.list(
    `${clientId}/memory`,
    { sortBy: { column: "name", order: "asc" } },
  );

  if (topicError) {
    throw new Error(`Failed to list memory directory: ${topicError.message}`);
  }

  const topicFiles: MemoryFileInfo[] = (topicData ?? [])
    .filter((item) => item.id !== null)
    .map((item) => ({
      name: item.name,
      path: `memory/${item.name}`,
      updatedAt: item.updated_at ?? null,
    }));

  return [...rootFiles, ...topicFiles];
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/memory/__tests__/list-memory-files.test.ts
```

Expected: All PASS.

### Step 5: Run existing loader tests to confirm no regressions

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts
```

Expected: All PASS (new function is additive, existing functions unchanged).

### Step 6: Commit

```bash
git add src/lib/memory/loader.ts src/lib/memory/__tests__/list-memory-files.test.ts
git commit -m "feat(pr14): add listMemoryFiles helper for memory page and system-reminder"
```

---

## Task 4: Memory Instructions in System Prompt

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Create: `src/lib/ai/__tests__/system-prompt.test.ts`

**Context:** The agent needs to know about the memory system — what files exist, when to write, what NOT to save. These instructions go in the `SYSTEM_PROMPT` constant as a `<memory-system>` section. PR 15 will later move this to the platform instructions layer (position #0 in the 7-layer context). For now, it lives in the base system prompt.

### Step 1: Write failing contract tests

Create `src/lib/ai/__tests__/system-prompt.test.ts`:

```typescript
/**
 * Contract tests for system prompt content.
 * @module lib/ai/__tests__/system-prompt
 */
import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "../system-prompt";

describe("SYSTEM_PROMPT memory instructions", () => {
  it("contains a memory-system section", () => {
    expect(SYSTEM_PROMPT).toContain("<memory-system>");
    expect(SYSTEM_PROMPT).toContain("</memory-system>");
  });

  it("documents all root memory files", () => {
    expect(SYSTEM_PROMPT).toContain("SOUL.md");
    expect(SYSTEM_PROMPT).toContain("USER.md");
    expect(SYSTEM_PROMPT).toContain("MEMORY.md");
  });

  it("documents all topic files", () => {
    expect(SYSTEM_PROMPT).toContain("memory/preferences.md");
    expect(SYSTEM_PROMPT).toContain("memory/growth-plan.md");
    expect(SYSTEM_PROMPT).toContain("memory/patterns.md");
    expect(SYSTEM_PROMPT).toContain("memory/key-decisions.md");
  });

  it("includes auto-write rules", () => {
    expect(SYSTEM_PROMPT).toContain("lasting preference");
    expect(SYSTEM_PROMPT).toContain("3+");
  });

  it("includes what NOT to save", () => {
    expect(SYSTEM_PROMPT).toContain("NOT");
    expect(SYSTEM_PROMPT).toContain("already in CRM");
  });

  it("mentions SOUL.md is read-only for the agent", () => {
    expect(SYSTEM_PROMPT).toMatch(/SOUL\.md.*read.only/is);
  });

  it("mentions the 200-line cap on MEMORY.md", () => {
    expect(SYSTEM_PROMPT).toContain("200");
  });

  it("documents how to discover topic files", () => {
    expect(SYSTEM_PROMPT).toContain('read_file("memory/")');
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — no `<memory-system>` section exists.

### Step 3: Add memory instructions to system prompt

Add the following section to the `SYSTEM_PROMPT` constant in `src/lib/ai/system-prompt.ts`, after the `</output-guidance>` closing tag:

```typescript
<memory-system>
You have a persistent memory system stored as files. Three files are loaded into your context every run:
- SOUL.md — your personality and identity (read-only, do not attempt to modify)
- USER.md — user profile (read+write, update as you learn about the user)
- MEMORY.md — your working notebook (read+write, first 200 lines loaded each run)

You also have topic files under memory/ for organized long-term storage:
- memory/preferences.md — lasting user preferences and working style
- memory/growth-plan.md — skill-building roadmap
- memory/patterns.md — recurring behaviors with evidence dates
- memory/key-decisions.md — significant decisions with reasoning

Browse all topic files: read_file("memory/")

Auto-write rules:
- preferences.md — write immediately when user states a lasting preference ("never cold-call sellers", "prefers text over email"). Do NOT write transient requests ("send it now").
- patterns.md — write after 3+ instances of same behavior. Include evidence dates.
- key-decisions.md — write on significant, hard-to-reverse decisions. Include reasoning.
- MEMORY.md — default destination for observations that don't clearly fit a topic file.
- New files — create via write_file when observation doesn't fit existing files.

Do NOT save: session-specific context, information already in CRM database, speculative conclusions from a single instance.

As MEMORY.md approaches 200 lines, move detailed content to topic files and leave pointers behind.
</memory-system>
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: All PASS.

### Step 5: Run existing context assembly tests to confirm no regressions

```bash
npx vitest run src/lib/runner/__tests__/
```

Expected: All PASS (system prompt content changed but no structural changes).

### Step 6: Commit

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(pr14): add memory auto-write instructions to system prompt"
```

---

## Task 5: Memory File API Routes

**Files:**
- Create: `app/api/memory/files/route.ts`
- Create: `app/api/memory/file/route.ts`

**Context:** Two API routes serve the memory page. Both follow the same auth pattern: `createClient()` → `resolveClientId()` → storage operation. The routes use direct Supabase Storage calls (not the agent file client) because the user is allowed to edit SOUL.md (which the agent file client blocks). Path validation rejects `..` traversal.

### Step 1: Create the files list endpoint

Create `app/api/memory/files/route.ts`:

```typescript
/**
 * Lists all memory files for the authenticated user.
 * @module app/api/memory/files/route
 */
import { resolveClientId } from "@/lib/chat/client-id";
import { listMemoryFiles } from "@/lib/memory/loader";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clientId = await resolveClientId(supabase);
    const files = await listMemoryFiles(supabase, clientId);

    return Response.json({ files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json({ error: message }, { status: 500 });
  }
}
```

### Step 2: Verify the endpoint compiles

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 3: Create the file read/write endpoint

Create `app/api/memory/file/route.ts`:

```typescript
/**
 * Reads or writes a single memory file for the authenticated user.
 * @module app/api/memory/file/route
 */
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

const BUCKET_ID = "agent-files";

function isValidPath(path: string): boolean {
  return path.length > 0 && !path.includes("..") && !path.startsWith("/");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path || !isValidPath(path)) {
    return Response.json({ error: "Valid path query parameter required" }, { status: 400 });
  }

  try {
    const clientId = await resolveClientId(supabase);
    const { data, error } = await supabase.storage
      .from(BUCKET_ID)
      .download(`${clientId}/${path}`);

    if (error || !data) {
      return Response.json({ error: `File not found: ${path}` }, { status: 404 });
    }

    const content = await data.text();

    return Response.json({ path, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { path?: string; content?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { path, content } = body;

  if (!path || !isValidPath(path) || typeof content !== "string") {
    return Response.json({ error: "path (string) and content (string) required" }, { status: 400 });
  }

  try {
    const clientId = await resolveClientId(supabase);
    const { error } = await supabase.storage
      .from(BUCKET_ID)
      .upload(`${clientId}/${path}`, content, {
        upsert: true,
        contentType: "text/plain; charset=utf-8",
      });

    if (error) {
      return Response.json({ error: `Failed to write: ${error.message}` }, { status: 500 });
    }

    return Response.json({ success: true, path });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json({ error: message }, { status: 500 });
  }
}
```

### Step 4: Verify both routes compile

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 5: Commit

```bash
git add app/api/memory/files/route.ts app/api/memory/file/route.ts
git commit -m "feat(pr14): add memory file API routes for memory page"
```

---

## Task 6: TanStack Query Hooks for Memory Data

**Files:**
- Create: `src/lib/memory/queries.ts`

**Context:** The memory page uses TanStack Query for data fetching (per tech stack convention). Three hooks: list files, read file, update file. These are thin fetch wrappers — the business logic lives in the API routes and helpers.

### Step 1: Create the query hooks

Create `src/lib/memory/queries.ts`:

```typescript
/**
 * TanStack Query hooks for memory file operations.
 * @module lib/memory/queries
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MemoryFileInfo } from "./loader";

/** Fetches the list of all memory files for the current user. */
export function useMemoryFiles() {
  return useQuery({
    queryKey: ["memory", "files"],
    queryFn: async (): Promise<MemoryFileInfo[]> => {
      const response = await fetch("/api/memory/files");

      if (!response.ok) {
        throw new Error("Failed to load memory files");
      }

      const data = await response.json();

      return data.files;
    },
  });
}

/** Fetches the content of a single memory file. */
export function useMemoryFile(path: string | null) {
  return useQuery({
    queryKey: ["memory", "file", path],
    queryFn: async (): Promise<string> => {
      const response = await fetch(
        `/api/memory/file?path=${encodeURIComponent(path!)}`,
      );

      if (!response.ok) {
        throw new Error("Failed to load file");
      }

      const data = await response.json();

      return data.content;
    },
    enabled: !!path,
  });
}

/** Mutation hook for updating a memory file's content. */
export function useUpdateMemoryFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const response = await fetch("/api/memory/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });

      if (!response.ok) {
        throw new Error("Failed to save file");
      }

      return response.json();
    },
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: ["memory", "file", path] });
      queryClient.invalidateQueries({ queryKey: ["memory", "files"] });
    },
  });
}
```

### Step 2: Verify it compiles

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 3: Commit

```bash
git add src/lib/memory/queries.ts
git commit -m "feat(pr14): add TanStack Query hooks for memory data"
```

---

## Task 7: Memory Page UI

**Files:**
- Create: `src/components/memory/memory-file-list.tsx`
- Create: `src/components/memory/memory-file-viewer.tsx`
- Modify: `app/(dashboard)/memory/page.tsx`

**Context:** The memory page replaces the current stub. It has a file list sidebar (left) and a file viewer/editor (right). The user can select a file to view its content, click Edit to switch to a textarea, and Save to persist changes. SOUL.md shows an "Agent Read-Only" badge (the user can still edit it — the badge indicates the agent cannot).

**ShadCN components available:** Button, Badge, ScrollArea, Skeleton, Textarea, Separator.

### Step 1: Create the file list component

Create `src/components/memory/memory-file-list.tsx`:

```tsx
/**
 * Sidebar file browser for the memory page.
 * @module components/memory/memory-file-list
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemoryFileInfo } from "@/lib/memory/loader";
import { cn } from "@/lib/utils";

interface MemoryFileListProps {
  files: MemoryFileInfo[] | undefined;
  isLoading: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

const ROOT_FILE_PATHS = new Set(["SOUL.md", "USER.md", "MEMORY.md"]);

export function MemoryFileList({
  files,
  isLoading,
  selectedPath,
  onSelect,
}: MemoryFileListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const rootFiles = (files ?? []).filter((f) => ROOT_FILE_PATHS.has(f.path));
  const topicFiles = (files ?? []).filter((f) => !ROOT_FILE_PATHS.has(f.path));

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-4">
        {rootFiles.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => onSelect(file.path)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-accent",
              selectedPath === file.path && "bg-accent",
            )}
          >
            <span className="truncate">{file.name}</span>
            {file.path === "SOUL.md" && (
              <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                Agent Read-Only
              </Badge>
            )}
          </button>
        ))}

        {topicFiles.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Topic Files
            </div>
            {topicFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelect(file.path)}
                className={cn(
                  "flex w-full items-center rounded-md px-3 py-2 text-sm text-left hover:bg-accent",
                  selectedPath === file.path && "bg-accent",
                )}
              >
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
```

### Step 2: Create the file viewer/editor component

Create `src/components/memory/memory-file-viewer.tsx`:

```tsx
/**
 * Content viewer and inline editor for a single memory file.
 * @module components/memory/memory-file-viewer
 */
"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface MemoryFileViewerProps {
  path: string;
  content: string | undefined;
  isLoading: boolean;
  onSave: (content: string) => void;
  isSaving: boolean;
}

export function MemoryFileViewer({
  path,
  content,
  isLoading,
  onSave,
  isSaving,
}: MemoryFileViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  function handleEdit() {
    setEditContent(content ?? "");
    setIsEditing(true);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditContent("");
  }

  function handleSave() {
    onSave(editContent);
    setIsEditing(false);
  }

  const isAgentReadOnly = path === "SOUL.md";

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">{path}</h2>
          {isAgentReadOnly && (
            <Badge variant="outline" className="text-xs">
              Agent Read-Only
            </Badge>
          )}
        </div>
        {!isEditing ? (
          <Button variant="outline" size="sm" onClick={handleEdit}>
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving\u2026" : "Save"}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="flex-1 resize-none font-mono text-sm"
          rows={20}
        />
      ) : (
        <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-sm">
          {content}
        </pre>
      )}
    </div>
  );
}
```

### Step 3: Replace the memory page stub

Replace `app/(dashboard)/memory/page.tsx`:

```tsx
/**
 * Memory page — view and edit all memory files.
 * @module app/(dashboard)/memory/page
 */
"use client";

import { useState } from "react";

import { MemoryFileList } from "@/components/memory/memory-file-list";
import { MemoryFileViewer } from "@/components/memory/memory-file-viewer";
import {
  useMemoryFile,
  useMemoryFiles,
  useUpdateMemoryFile,
} from "@/lib/memory/queries";

export default function MemoryPage() {
  const [selectedPath, setSelectedPath] = useState<string | null>("SOUL.md");
  const { data: files, isLoading: filesLoading } = useMemoryFiles();
  const { data: content, isLoading: contentLoading } = useMemoryFile(selectedPath);
  const updateFile = useUpdateMemoryFile();

  function handleSave(newContent: string) {
    if (!selectedPath) return;
    updateFile.mutate({ path: selectedPath, content: newContent });
  }

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-r">
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold">Memory</h1>
        </div>
        <MemoryFileList
          files={files}
          isLoading={filesLoading}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
        />
      </div>
      <div className="min-w-0 flex-1">
        {selectedPath ? (
          <MemoryFileViewer
            path={selectedPath}
            content={content}
            isLoading={contentLoading}
            onSave={handleSave}
            isSaving={updateFile.isPending}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a file to view its contents
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 4: Verify compilation

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 5: Manual smoke test

1. Start dev server: `npm run dev`
2. Log in and navigate to `/memory`
3. Verify: file list shows SOUL.md, USER.md, MEMORY.md, and 4 topic files
4. Verify: clicking a file shows its content in the viewer
5. Verify: click Edit → textarea appears with current content
6. Verify: modify content → click Save → content persists (reload page to confirm)
7. Verify: SOUL.md shows "Agent Read-Only" badge but is still editable by the user
8. Verify: Cancel discards edits and returns to view mode

### Step 6: Commit

```bash
git add src/components/memory/ app/\(dashboard\)/memory/page.tsx src/lib/memory/queries.ts
git commit -m "feat(pr14): build memory page with file viewer and inline editor"
```

---

## Task 8: Final Verification + Commit

### Step 1: Run the full test suite

```bash
npx vitest run
```

Expected: All tests PASS. No regressions.

### Step 2: Type check

```bash
npx tsc --noEmit
```

Expected: No errors.

### Step 3: Lint check

```bash
npm run lint
```

Expected: No errors. Fix any lint issues before proceeding.

### Step 4: Final manual verification

Verify both PR 14 test criteria:

1. **"Agent writes a preference to memory, next session it remembers"**
   - Open chat, tell the agent a lasting preference (e.g. "I never cold-call sellers")
   - Check the memory page — MEMORY.md or preferences.md should contain the preference
   - Start a new chat thread — the agent should reference the preference without being told

2. **"User can view and edit memory files at /memory"**
   - Navigate to /memory
   - View all files (SOUL.md, USER.md, MEMORY.md, 4 topic files)
   - Edit a file and save — changes persist

### Step 5: Final commit (if any fixes were needed)

```bash
git add -A
git commit -m "feat(pr14): memory system — topic files, auto-write instructions, memory page"
```
