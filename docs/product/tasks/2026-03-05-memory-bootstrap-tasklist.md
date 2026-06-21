# Storage Layout + SOUL.md + USER.md + MEMORY.md Implementation Plan

**PR:** PR 13: Storage layout + SOUL.md + USER.md + MEMORY.md
**Decisions:** MEM-01, MEM-02, MEM-03, DATA-04
**Goal:** Bootstrap per-client memory files on first run and inject them into the runner's context assembly so the agent has personality, user profile, and working memory every conversation.

**Architecture:** Memory lives as markdown files in Supabase Storage under `/{clientId}/`. Three files are loaded every run: `SOUL.md` (personality, position #1, agent read-only), `USER.md` (profile, position #2, agent read+write), and `MEMORY.md` (working notebook, position #3, first 200 lines only). Files are bootstrapped lazily on first run — if `SOUL.md` doesn't exist, all three are created with default content. No new DB tables; this uses the existing `agent-files` Supabase Storage bucket and `createAgentFileClient` helper.

**Tech Stack:** Supabase Storage, Vitest, existing `createAgentFileClient` (`src/lib/storage/agent-files.ts`), runner context assembly (`src/lib/runner/context.ts`)

---

## Relevant Files

### Create
- `src/lib/memory/templates.ts` — default content for SOUL.md, USER.md, MEMORY.md
- `src/lib/memory/bootstrap.ts` — `bootstrapMemoryFiles()` function
- `src/lib/memory/loader.ts` — `loadMemoryContext()` function
- `src/lib/memory/__tests__/templates.test.ts`
- `src/lib/memory/__tests__/bootstrap.test.ts`
- `src/lib/memory/__tests__/loader.test.ts`

### Modify
- `src/lib/runner/context.ts` — inject memory into context assembly
- `src/lib/runner/__tests__/context.test.ts` — update tests for memory injection

### Reference (read, don't modify)
- `src/lib/storage/agent-files.ts` — `createAgentFileClient` API
- `src/lib/storage/__tests__/agent-files.test.ts` — test patterns for storage mocks
- `src/lib/ai/system-prompt.ts` — existing `SYSTEM_PROMPT` constant
- `src/lib/runner/run-agent.ts` — runner entrypoint (passes `clientId` to context)
- `src/test/mocks/supabase.ts` — `createMockSupabaseClient` helper
- `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` — MEM-01, MEM-02, MEM-03, DATA-04
- `roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md` — §8 Memory System

---

## Background: How Existing Code Works

### Storage Client (`src/lib/storage/agent-files.ts`)
```typescript
// Creates a client-scoped file interface over the `agent-files` bucket
const fileClient = createAgentFileClient(supabase, clientId);

// Read a file:
const content = await fileClient.downloadFile("SOUL.md");
// → downloads from bucket path: `{clientId}/SOUL.md`

// Write a file:
await fileClient.uploadFile("USER.md", "Name: Seth\nTimezone: SGT");
// → upserts to bucket path: `{clientId}/USER.md`

// List a directory:
const tree = await fileClient.listDirectory("memory");
// → lists `{clientId}/memory/` recursively

// SOUL.md is write-protected:
await fileClient.uploadFile("SOUL.md", "x"); // → throws "read-only"
```

### Context Assembly (`src/lib/runner/context.ts`)
```typescript
// Currently returns { system: SYSTEM_PROMPT, messages: [...history] }
// PR 13 changes it to prepend SOUL.md + USER.md + MEMORY.md to the system string
```

### Test Mock Pattern (`src/lib/storage/__tests__/agent-files.test.ts`)
```typescript
// Storage tests mock supabase.storage.from() directly:
const mockDownload = vi.fn();
const mockUpload = vi.fn();
const mockFrom = vi.fn(() => ({ download: mockDownload, upload: mockUpload, ... }));
const client = { storage: { from: mockFrom } } as unknown as SupabaseClient;
```

### Runner Mock Pattern (`src/lib/runner/__tests__/context.test.ts`)
```typescript
// Context tests use createMockSupabaseClient from src/test/mocks/supabase.ts:
const supabase = createMockSupabaseClient({
  selectResult: { data: [...], error: null },
});
const result = await assembleContext({ supabase: supabase as never, threadId: "t-1", currentMessage: "" });
```

---

## Task 1: Default Memory File Templates

**Files:**
- Create: `src/lib/memory/templates.ts`
- Test: `src/lib/memory/__tests__/templates.test.ts`

**Context:** These are the string constants that get written to storage on first run. SOUL.md is the agent personality (MEM-01). USER.md is the user profile — starts nearly empty, agent populates organically (MEM-02). MEMORY.md is the working notebook — starts empty (MEM-03). All are Markdown.

### Step 1: Write the failing test for SOUL.md template

Create the test file. We test that the template exists, is non-empty, and contains expected personality markers from the system prompt.

```typescript
// src/lib/memory/__tests__/templates.test.ts
/**
 * Tests for default memory file templates.
 * @module lib/memory/__tests__/templates
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from "../templates";

describe("DEFAULT_SOUL_MD", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_SOUL_MD).toBe("string");
    expect(DEFAULT_SOUL_MD.length).toBeGreaterThan(0);
  });

  it("contains personality directives", () => {
    expect(DEFAULT_SOUL_MD).toContain("Sunder");
    expect(DEFAULT_SOUL_MD).toContain("real estate");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/memory/__tests__/templates.test.ts
```

Expected: FAIL — module `../templates` does not exist.

### Step 3: Write the SOUL.md template

```typescript
// src/lib/memory/templates.ts
/**
 * Default content for per-client memory files bootstrapped on first run.
 * @module lib/memory/templates
 */

/**
 * Default SOUL.md personality template (MEM-01).
 *
 * Agent read-only. User edits from settings UI.
 * Loaded at context position #1 every run.
 */
export const DEFAULT_SOUL_MD = `# Personality

You are NeoBot, a sharp and reliable AI assistant built for solo real estate agents in Singapore.

## Tone
- Concise, practical, action-oriented.
- Skip preambles — do the work first, explain after.
- One follow-up question at a time. Never dump a list of clarifying questions.

## Style
- Use Singapore English conventions (property terms, SGD currency, local formatting).
- Keep responses short. Lead with the answer, not the reasoning.
- Use Markdown for structured output (tables, bullet points) when it helps readability.

## Principles
- Search before creating — never make duplicates.
- When information is uncertain, say so clearly.
- Before multi-step work, briefly tell the user what you're about to do.
- Never mention tool names or internal details. Say "I'll look that up" not "I'll call search_contacts".
`;
```

### Step 4: Run test to verify SOUL.md passes

```bash
npx vitest run src/lib/memory/__tests__/templates.test.ts
```

Expected: 2 tests pass for `DEFAULT_SOUL_MD`. Others fail (not yet defined).

### Step 5: Add failing tests for USER.md and MEMORY.md templates

Add to the same test file:

```typescript
describe("DEFAULT_USER_MD", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_USER_MD).toBe("string");
    expect(DEFAULT_USER_MD.length).toBeGreaterThan(0);
  });

  it("contains a header and placeholder prompts", () => {
    expect(DEFAULT_USER_MD).toContain("# User Profile");
  });
});

describe("DEFAULT_MEMORY_MD", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_MEMORY_MD).toBe("string");
    expect(DEFAULT_MEMORY_MD.length).toBeGreaterThan(0);
  });

  it("contains a header", () => {
    expect(DEFAULT_MEMORY_MD).toContain("# Working Memory");
  });
});
```

### Step 6: Run test to verify they fail

```bash
npx vitest run src/lib/memory/__tests__/templates.test.ts
```

Expected: FAIL — `DEFAULT_USER_MD` and `DEFAULT_MEMORY_MD` not exported.

### Step 7: Write USER.md and MEMORY.md templates

Add to `src/lib/memory/templates.ts`:

```typescript
/**
 * Default USER.md profile template (MEM-02).
 *
 * Agent read+write. User can review/edit from settings.
 * Populated organically as agent learns about the user.
 * Loaded at context position #2 every run.
 */
export const DEFAULT_USER_MD = `# User Profile

<!-- Sunder populates this file as it learns about you during conversations. -->
<!-- You can also edit this directly from Settings. -->
`;

/**
 * Default MEMORY.md working notebook template (MEM-03).
 *
 * Agent read+write. First 200 lines loaded every run at context position #3.
 * Agent writes working notes here. As it grows toward the 200-line cap,
 * agent moves detail to topic files in memory/ and leaves pointers.
 */
export const DEFAULT_MEMORY_MD = `# Working Memory

<!-- Sunder writes working notes here during conversations. -->
<!-- First 200 lines are loaded into every conversation automatically. -->
<!-- When this file gets long, Sunder moves details to memory/*.md topic files. -->
`;
```

### Step 8: Run all template tests to verify they pass

```bash
npx vitest run src/lib/memory/__tests__/templates.test.ts
```

Expected: All 6 tests PASS.

### Step 9: Commit

```bash
git add src/lib/memory/templates.ts src/lib/memory/__tests__/templates.test.ts
git commit -m "feat(pr13): add default SOUL.md, USER.md, MEMORY.md templates"
```

---

## Task 2: Bootstrap Memory Files

**Files:**
- Create: `src/lib/memory/bootstrap.ts`
- Test: `src/lib/memory/__tests__/bootstrap.test.ts`

**Context:** `bootstrapMemoryFiles(supabase, clientId)` checks if SOUL.md exists in storage. If missing, it creates all three files with default content. This is idempotent — safe to call every run. Uses `createAgentFileClient` from `src/lib/storage/agent-files.ts`. The function needs to bypass the SOUL.md write protection since it's the bootstrap (not an agent write). It uploads directly via supabase storage instead of using the agent file client for SOUL.md.

### Step 1: Write the failing test — bootstraps when files don't exist

```typescript
// src/lib/memory/__tests__/bootstrap.test.ts
/**
 * Tests for memory file bootstrapping.
 * @module lib/memory/__tests__/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from "../templates";
import { bootstrapMemoryFiles } from "../bootstrap";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function createMockStorage() {
  const mockDownload = vi.fn();
  const mockUpload = vi.fn();

  const mockFrom = vi.fn(() => ({
    download: mockDownload,
    upload: mockUpload,
  }));

  return {
    client: { storage: { from: mockFrom } } as unknown as SupabaseClient,
    mockFrom,
    mockDownload,
    mockUpload,
  };
}

describe("bootstrapMemoryFiles", () => {
  let mock: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockStorage();
  });

  it("creates all three files when SOUL.md does not exist", async () => {
    // SOUL.md download fails → files don't exist yet
    mock.mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });
    mock.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    expect(mock.mockUpload).toHaveBeenCalledTimes(3);
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/SOUL.md`,
      DEFAULT_SOUL_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/USER.md`,
      DEFAULT_USER_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/MEMORY.md`,
      DEFAULT_MEMORY_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: FAIL — module `../bootstrap` does not exist.

### Step 3: Write the bootstrap function

```typescript
// src/lib/memory/bootstrap.ts
/**
 * Bootstraps per-client memory files in Supabase Storage on first run.
 * @module lib/memory/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from "./templates";

const BUCKET_ID = "agent-files";

/**
 * Seeds SOUL.md, USER.md, and MEMORY.md if they don't already exist.
 *
 * Idempotent — checks for SOUL.md existence as a sentinel.
 * If SOUL.md is missing, all three files are created with defaults.
 * Uses upsert: false so existing files are never overwritten.
 *
 * @param supabase - Authenticated Supabase client.
 * @param clientId - Tenant identifier (storage prefix).
 */
export async function bootstrapMemoryFiles(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const { error: checkError } = await supabase.storage
    .from(BUCKET_ID)
    .download(`${clientId}/SOUL.md`);

  if (!checkError) {
    return; // Files already exist
  }

  const files = [
    { path: `${clientId}/SOUL.md`, content: DEFAULT_SOUL_MD },
    { path: `${clientId}/USER.md`, content: DEFAULT_USER_MD },
    { path: `${clientId}/MEMORY.md`, content: DEFAULT_MEMORY_MD },
  ];

  await Promise.all(
    files.map(({ path, content }) =>
      supabase.storage.from(BUCKET_ID).upload(path, content, {
        upsert: false,
        contentType: "text/plain; charset=utf-8",
      }),
    ),
  );
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: PASS.

### Step 5: Add failing test — skips bootstrap when SOUL.md already exists

Add to the same test file:

```typescript
  it("does not upload when SOUL.md already exists", async () => {
    // SOUL.md download succeeds → files exist
    mock.mockDownload.mockResolvedValue({
      data: new Blob(["existing"]),
      error: null,
    });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    expect(mock.mockUpload).not.toHaveBeenCalled();
  });
```

### Step 6: Run test to verify it passes (code already handles this)

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: PASS — the early return in bootstrap already handles this case.

### Step 7: Add failing test — uses upsert: false to avoid overwriting

Add to the same test file:

```typescript
  it("uses upsert: false to avoid overwriting existing files", async () => {
    mock.mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });
    mock.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    for (const call of mock.mockUpload.mock.calls) {
      const options = call[2] as { upsert: boolean };
      expect(options.upsert).toBe(false);
    }
  });
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: PASS.

### Step 9: Commit

```bash
git add src/lib/memory/bootstrap.ts src/lib/memory/__tests__/bootstrap.test.ts
git commit -m "feat(pr13): add bootstrapMemoryFiles for first-run file seeding"
```

---

## Task 3: Memory Context Loader

**Files:**
- Create: `src/lib/memory/loader.ts`
- Test: `src/lib/memory/__tests__/loader.test.ts`

**Context:** `loadMemoryContext(supabase, clientId)` reads SOUL.md, USER.md, and MEMORY.md (first 200 lines) from storage. Returns a structured object with each file's content. Used by context assembly to inject memory into the system prompt. If a file fails to load (shouldn't happen after bootstrap), returns empty string for that slot — never crashes the run.

### Step 1: Write the failing test — loads all three files

```typescript
// src/lib/memory/__tests__/loader.test.ts
/**
 * Tests for memory context loader.
 * @module lib/memory/__tests__/loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadMemoryContext } from "../loader";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function createDownloadPayload(content: string) {
  return { text: vi.fn().mockResolvedValue(content) };
}

function createMockStorage() {
  const mockDownload = vi.fn();
  const mockFrom = vi.fn(() => ({ download: mockDownload }));

  return {
    client: { storage: { from: mockFrom } } as unknown as SupabaseClient,
    mockFrom,
    mockDownload,
  };
}

describe("loadMemoryContext", () => {
  let mock: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockStorage();
  });

  it("loads SOUL.md, USER.md, and MEMORY.md content", async () => {
    mock.mockDownload
      .mockResolvedValueOnce({ data: createDownloadPayload("soul content"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload("user content"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload("memory content"), error: null });

    const result = await loadMemoryContext(mock.client, CLIENT_ID);

    expect(result.soul).toBe("soul content");
    expect(result.user).toBe("user content");
    expect(result.memory).toBe("memory content");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts
```

Expected: FAIL — module `../loader` does not exist.

### Step 3: Write the loader

```typescript
// src/lib/memory/loader.ts
/**
 * Loads per-client memory files for runner context injection.
 * @module lib/memory/loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET_ID = "agent-files";
const MEMORY_LINE_CAP = 200;

export interface MemoryContext {
  /** SOUL.md personality content (MEM-01). */
  soul: string;
  /** USER.md profile content (MEM-02). */
  user: string;
  /** MEMORY.md first 200 lines (MEM-03). */
  memory: string;
}

/**
 * Downloads a text file from storage, returning empty string on failure.
 */
async function safeDownload(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_ID).download(path);

  if (error || !data) {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof (data as { text?: () => Promise<string> }).text === "function") {
    return (data as { text: () => Promise<string> }).text();
  }

  return "";
}

/**
 * Truncates text to the first N lines.
 */
function truncateToLines(content: string, maxLines: number): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) {
    return content;
  }
  return lines.slice(0, maxLines).join("\n");
}

/**
 * Reads SOUL.md, USER.md, and MEMORY.md (first 200 lines) from storage.
 *
 * Never throws — returns empty strings for any file that fails to load.
 * Called during context assembly before every runner invocation.
 *
 * @param supabase - Authenticated Supabase client.
 * @param clientId - Tenant identifier (storage prefix).
 */
export async function loadMemoryContext(
  supabase: SupabaseClient,
  clientId: string,
): Promise<MemoryContext> {
  const [soul, user, memoryRaw] = await Promise.all([
    safeDownload(supabase, `${clientId}/SOUL.md`),
    safeDownload(supabase, `${clientId}/USER.md`),
    safeDownload(supabase, `${clientId}/MEMORY.md`),
  ]);

  return {
    soul,
    user,
    memory: truncateToLines(memoryRaw, MEMORY_LINE_CAP),
  };
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts
```

Expected: PASS.

### Step 5: Add failing test — truncates MEMORY.md to 200 lines

```typescript
  it("truncates MEMORY.md to the first 200 lines", async () => {
    const longContent = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}`).join("\n");
    mock.mockDownload
      .mockResolvedValueOnce({ data: createDownloadPayload("soul"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload("user"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload(longContent), error: null });

    const result = await loadMemoryContext(mock.client, CLIENT_ID);

    const lines = result.memory.split("\n");
    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe("Line 1");
    expect(lines[199]).toBe("Line 200");
  });
```

### Step 6: Run test to verify it passes

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts
```

Expected: PASS — `truncateToLines` already handles this.

### Step 7: Add failing test — returns empty strings on download failure

```typescript
  it("returns empty strings when files fail to download", async () => {
    mock.mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const result = await loadMemoryContext(mock.client, CLIENT_ID);

    expect(result.soul).toBe("");
    expect(result.user).toBe("");
    expect(result.memory).toBe("");
  });
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts
```

Expected: PASS — `safeDownload` returns empty string on error.

### Step 9: Add failing test — does not truncate MEMORY.md under 200 lines

```typescript
  it("does not truncate MEMORY.md when under 200 lines", async () => {
    const shortContent = "Line 1\nLine 2\nLine 3";
    mock.mockDownload
      .mockResolvedValueOnce({ data: createDownloadPayload("soul"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload("user"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload(shortContent), error: null });

    const result = await loadMemoryContext(mock.client, CLIENT_ID);

    expect(result.memory).toBe(shortContent);
  });
```

### Step 10: Run test to verify it passes

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts
```

Expected: PASS.

### Step 11: Add failing test — downloads from correct paths

```typescript
  it("downloads from correct client-scoped paths", async () => {
    mock.mockDownload.mockResolvedValue({
      data: createDownloadPayload(""),
      error: null,
    });

    await loadMemoryContext(mock.client, CLIENT_ID);

    expect(mock.mockDownload).toHaveBeenCalledTimes(3);
    expect(mock.mockDownload).toHaveBeenCalledWith(`${CLIENT_ID}/SOUL.md`);
    expect(mock.mockDownload).toHaveBeenCalledWith(`${CLIENT_ID}/USER.md`);
    expect(mock.mockDownload).toHaveBeenCalledWith(`${CLIENT_ID}/MEMORY.md`);
  });
```

### Step 12: Run test to verify it passes

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts
```

Expected: PASS.

### Step 13: Commit

```bash
git add src/lib/memory/loader.ts src/lib/memory/__tests__/loader.test.ts
git commit -m "feat(pr13): add loadMemoryContext for reading memory files into runner context"
```

---

## Task 4: Wire Memory Into Context Assembly

**Files:**
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/runner/__tests__/context.test.ts`
- Modify: `src/lib/runner/run-agent.ts` — pass `clientId` to `assembleContext`

**Context:** Currently `assembleContext` returns `{ system: SYSTEM_PROMPT, messages }`. After this task, it calls `bootstrapMemoryFiles` (idempotent), then `loadMemoryContext`, and builds the system string as: `SYSTEM_PROMPT + "\n\n" + SOUL.md + "\n\n" + USER.md + "\n\n" + MEMORY.md`. The `assembleContext` function needs `clientId` added to its params so it can call bootstrap and loader.

### Step 1: Write the failing test — context includes memory in system string

Add new tests to `src/lib/runner/__tests__/context.test.ts`. These will fail because `assembleContext` doesn't accept `clientId` yet and doesn't inject memory.

```typescript
// Add these imports at the top of the file:
import { vi } from "vitest";

// Add these mocks BEFORE the describe block:
vi.mock("@/lib/memory/bootstrap", () => ({
  bootstrapMemoryFiles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/memory/loader", () => ({
  loadMemoryContext: vi.fn().mockResolvedValue({
    soul: "soul-content",
    user: "user-content",
    memory: "memory-content",
  }),
}));

// Add this test inside the existing describe("assembleContext") block:
  it("includes memory context in the system string when clientId is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("soul-content");
    expect(result.system).toContain("user-content");
    expect(result.system).toContain("memory-content");
  });
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: FAIL — `clientId` is not a valid property in `AssembleContextParams`.

### Step 3: Update context assembly to accept clientId and inject memory

Modify `src/lib/runner/context.ts`:

1. Add `clientId?: string` to `AssembleContextParams` interface.
2. Import and call `bootstrapMemoryFiles` and `loadMemoryContext`.
3. Build system string with memory layers when clientId is present.

```typescript
// src/lib/runner/context.ts — updated version
/**
 * Context assembly for the runner engine.
 * @module lib/runner/context
 */
import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { bootstrapMemoryFiles } from "@/lib/memory/bootstrap";
import { loadMemoryContext } from "@/lib/memory/loader";
import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type MessageRole = "system" | "user" | "assistant";

interface AssembleContextParams {
  supabase: ChatSupabaseClient;
  threadId: string;
  currentMessage: string;
  /** Tenant ID for loading memory files. When provided, SOUL.md/USER.md/MEMORY.md are injected into the system prompt. */
  clientId?: string;
}

// ... (keep AssembledContext, HistoryRow, allowedRoles, normalizeRole, getTextFromParts unchanged)

/**
 * Builds the system prompt string with optional memory layers.
 *
 * Context load order (RUNNER-03):
 *   0. System prompt (identity, tools, instructions)
 *   1. SOUL.md (personality — MEM-01)
 *   2. USER.md (profile — MEM-02)
 *   3. MEMORY.md first 200 lines (working memory — MEM-03)
 */
function buildSystemPrompt(memory?: { soul: string; user: string; memory: string }): string {
  if (!memory) {
    return SYSTEM_PROMPT;
  }

  const sections = [SYSTEM_PROMPT];

  if (memory.soul) {
    sections.push(`<soul>\n${memory.soul}\n</soul>`);
  }

  if (memory.user) {
    sections.push(`<user-profile>\n${memory.user}\n</user-profile>`);
  }

  if (memory.memory) {
    sections.push(`<working-memory>\n${memory.memory}\n</working-memory>`);
  }

  return sections.join("\n\n");
}

/**
 * Builds the runner context from persisted thread history plus the inbound message.
 */
export async function assembleContext({
  supabase,
  threadId,
  currentMessage,
  clientId,
}: AssembleContextParams): Promise<AssembledContext> {
  // Bootstrap + load memory files if clientId is available
  let memoryContext: { soul: string; user: string; memory: string } | undefined;
  if (clientId) {
    await bootstrapMemoryFiles(supabase, clientId);
    memoryContext = await loadMemoryContext(supabase, clientId);
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
    system: buildSystemPrompt(memoryContext),
    messages: [
      ...historyMessages,
      ...currentMessageTurn,
    ],
  };
}
```

### Step 4: Run test to verify the new test passes

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: New test PASSES. Check that existing tests still pass too (they should — `clientId` is optional, and the mocks are set up at module level so they affect all tests, but the existing tests don't pass `clientId` so memory won't be injected).

### Step 5: Add failing test — existing tests still work without clientId

Verify that the existing test "returns the system prompt and current message when no history exists" still passes without `clientId`. The mock for `loadMemoryContext` shouldn't be called when `clientId` is absent.

```typescript
  it("does not load memory when clientId is not provided", async () => {
    const { loadMemoryContext } = await import("@/lib/memory/loader");
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
    });

    expect(loadMemoryContext).not.toHaveBeenCalled();
  });
```

### Step 6: Run test to verify it passes

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: PASS — `clientId` is undefined, so memory loading is skipped.

### Step 7: Add failing test — memory wraps in XML tags

```typescript
  it("wraps memory sections in XML tags for LLM context separation", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("<soul>");
    expect(result.system).toContain("</soul>");
    expect(result.system).toContain("<user-profile>");
    expect(result.system).toContain("</user-profile>");
    expect(result.system).toContain("<working-memory>");
    expect(result.system).toContain("</working-memory>");
  });
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: PASS.

### Step 9: Add failing test — calls bootstrapMemoryFiles before loading

```typescript
  it("calls bootstrapMemoryFiles before loadMemoryContext", async () => {
    const { bootstrapMemoryFiles } = await import("@/lib/memory/bootstrap");
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(bootstrapMemoryFiles).toHaveBeenCalledWith(expect.anything(), "client-123");
  });
```

### Step 10: Run test to verify it passes

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: PASS.

### Step 11: Commit

```bash
git add src/lib/runner/context.ts src/lib/runner/__tests__/context.test.ts
git commit -m "feat(pr13): inject SOUL.md, USER.md, MEMORY.md into runner context assembly"
```

---

## Task 5: Pass clientId From Runner to Context Assembly

**Files:**
- Modify: `src/lib/runner/run-agent.ts:67-71` — add `clientId` to `assembleContext` call

**Context:** The runner already has `clientId` from `payload.clientId`. Currently `assembleContext` is called without `clientId`. We just add the parameter. No new tests needed — the integration is covered by the context assembly tests above and by the existing `run-agent.test.ts` which mocks `assembleContext`.

### Step 1: Verify current run-agent.test.ts still passes before changes

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: PASS — baseline.

### Step 2: Update run-agent.ts to pass clientId

In `src/lib/runner/run-agent.ts`, change the `assembleContext` call (around line 67):

```typescript
// Before:
const { system, messages } = await assembleContext({
  supabase,
  threadId,
  currentMessage: "",
});

// After:
const { system, messages } = await assembleContext({
  supabase,
  threadId,
  currentMessage: "",
  clientId,
});
```

### Step 3: Run run-agent tests to verify nothing breaks

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: PASS — `assembleContext` is already mocked in these tests.

### Step 4: Run the full test suite to verify no regressions

```bash
npx vitest run
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add src/lib/runner/run-agent.ts
git commit -m "feat(pr13): pass clientId to assembleContext for memory loading"
```

---

## Task 6: Add buildSystemPrompt Unit Tests

**Files:**
- Modify: `src/lib/runner/context.ts` — export `buildSystemPrompt` for testing
- Create: `src/lib/runner/__tests__/build-system-prompt.test.ts`

**Context:** The `buildSystemPrompt` helper does the XML tag wrapping and concatenation. It deserves its own unit tests to verify edge cases: empty fields, all fields populated, no memory context.

### Step 1: Export buildSystemPrompt

In `src/lib/runner/context.ts`, change `function buildSystemPrompt` to `export function buildSystemPrompt`.

### Step 2: Write failing tests

```typescript
// src/lib/runner/__tests__/build-system-prompt.test.ts
/**
 * Tests for buildSystemPrompt helper.
 * @module lib/runner/__tests__/build-system-prompt
 */
import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

import { buildSystemPrompt } from "../context";

describe("buildSystemPrompt", () => {
  it("returns plain system prompt when memory is undefined", () => {
    const result = buildSystemPrompt(undefined);
    expect(result).toBe(SYSTEM_PROMPT);
  });

  it("includes all three memory sections when populated", () => {
    const result = buildSystemPrompt({
      soul: "Be kind",
      user: "Name: Seth",
      memory: "Met John today",
    });

    expect(result).toContain(SYSTEM_PROMPT);
    expect(result).toContain("<soul>\nBe kind\n</soul>");
    expect(result).toContain("<user-profile>\nName: Seth\n</user-profile>");
    expect(result).toContain("<working-memory>\nMet John today\n</working-memory>");
  });

  it("omits empty memory sections", () => {
    const result = buildSystemPrompt({
      soul: "Be kind",
      user: "",
      memory: "",
    });

    expect(result).toContain("<soul>");
    expect(result).not.toContain("<user-profile>");
    expect(result).not.toContain("<working-memory>");
  });

  it("preserves section order: system prompt, soul, user, memory", () => {
    const result = buildSystemPrompt({
      soul: "SOUL_MARKER",
      user: "USER_MARKER",
      memory: "MEMORY_MARKER",
    });

    const soulIndex = result.indexOf("SOUL_MARKER");
    const userIndex = result.indexOf("USER_MARKER");
    const memoryIndex = result.indexOf("MEMORY_MARKER");
    const systemIndex = result.indexOf(SYSTEM_PROMPT.slice(0, 20));

    expect(systemIndex).toBeLessThan(soulIndex);
    expect(soulIndex).toBeLessThan(userIndex);
    expect(userIndex).toBeLessThan(memoryIndex);
  });
});
```

### Step 3: Run tests to verify they pass (buildSystemPrompt is already implemented)

```bash
npx vitest run src/lib/runner/__tests__/build-system-prompt.test.ts
```

Expected: PASS — all tests should pass against the implementation from Task 4.

### Step 4: Commit

```bash
git add src/lib/runner/context.ts src/lib/runner/__tests__/build-system-prompt.test.ts
git commit -m "test(pr13): add unit tests for buildSystemPrompt helper"
```

---

## Task 7: Full Integration Smoke Test

**Files:**
- No new files. Run the full test suite.

**Context:** Final verification that all tasks integrate correctly and nothing is broken.

### Step 1: Run the full test suite

```bash
npx vitest run
```

Expected: All tests PASS with zero errors and zero warnings.

### Step 2: Verify file structure is correct

```bash
ls -la src/lib/memory/
ls -la src/lib/memory/__tests__/
```

Expected:
```
src/lib/memory/
  templates.ts
  bootstrap.ts
  loader.ts
  __tests__/
    templates.test.ts
    bootstrap.test.ts
    loader.test.ts
```

### Step 3: Final commit with all changes

If any files were missed in earlier commits:

```bash
git status
# If clean, skip. Otherwise:
git add -A
git commit -m "chore(pr13): final cleanup for memory bootstrap PR"
```

---

## Notes

### What This PR Does NOT Do
- **Memory topic files** (`memory/preferences.md`, etc.) — that's PR 14.
- **Full 7-layer context assembly** (platform instructions, system-reminder) — that's PR 15.
- **Memory auto-write rules** — that's PR 14.
- **Memory page UI** (`/memory`) — that's PR 14.
- The system prompt is NOT modified. Memory context is appended after it.

### How to Manually Test (After Automated Tests Pass)
1. Start the dev server: `npm run dev`
2. Log in and open a new chat thread.
3. Check Supabase Storage → `agent-files` bucket → your `{clientId}/` folder.
4. Verify `SOUL.md`, `USER.md`, `MEMORY.md` were created with default content.
5. Send a message in chat. The agent's response should reflect the SOUL.md personality (concise, practical, Singapore English conventions).
6. Manually edit `USER.md` in Supabase Storage to add `Name: Test User`. Start a new conversation — the agent should know the user's name.

### Architecture Decision References
- **MEM-01:** SOUL.md is agent read-only, user-editable. Default seeded on first run. Loaded position #1.
- **MEM-02:** USER.md is agent read+write. Empty by default, populated organically. Loaded position #2.
- **MEM-03:** MEMORY.md is a working notebook. First 200 lines loaded position #3. Agent writes directly.
- **DATA-04:** Per-client storage layout: `/{clientId}/SOUL.md`, `USER.md`, `MEMORY.md`, `memory/`, etc.
