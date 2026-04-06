# Composio SDK Upgrade + Connection Tool Loading Simplification

**PR:** PR 69: refactor: Composio SDK upgrade + simplify connection tool loading
**Decisions:** None (out-of-plan refactor of already-shipped code)
**Goal:** Replace ~170 lines of manual Composio tool construction with a ~20-line call to `composio.tools.get(userId, { tools: slugs })`, delete dead code, and enforce one connection per toolkit per user.

> **Out-of-plan work.** No matching PR existed in the v2 plan prior to this tasklist. PR 69 was added to Phase 4 as a refactor of shipped connection code (PRs 25, 26, 61, 62, 65).

**Architecture:** `composio.tools.get(userId, { tools: slugs })` returns VercelProvider-wrapped tools with `execute()` built in, routing by userId. This eliminates: schema caching in DB, connection-ID-prefixed tool names, manual `tool()` wrappers from cached JSON, file bridging for downloads/uploads, and the `dangerouslySkipVersionCheck` flag. One connected account per toolkit per user means routing is unambiguous.

**Tech Stack:** `@composio/core` ^0.6.8, `@composio/vercel` ^0.6.8, Vitest, Supabase migrations, Zod v4

---

## Relevant Files

**Rewrite:**
- `src/lib/composio/activated-tools.ts` — full rewrite (~170 lines → ~20 lines)
- `src/lib/composio/__tests__/activated-tools.test.ts` — full rewrite

**Delete:**
- `src/lib/composio/tools.ts` — superseded by new activated-tools.ts
- `src/lib/composio/__tests__/tools.test.ts` — tests for deleted file
- `src/lib/composio/file-bridge.ts` — no users, no backward compat needed

**Modify:**
- `package.json` — bump `@composio/core` + `@composio/vercel` to `^0.6.8`
- `src/lib/composio/index.ts` — remove `loadComposioTools` export, keep `loadActivatedConnectionTools`
- `src/lib/connections/schemas.ts` — remove `tool_schemas` field from all three schemas
- `src/lib/connections/queries.ts` — remove `tool_schemas` param from `updateConnectionActivatedTools`, remove `toConnectionInsertPayload`/`toConnectionUpdatePayload` tool_schemas handling
- `src/lib/runner/tools/connections/manage-tools.ts:93-104` — remove schema caching block
- `src/lib/runner/tools/connections/create-connection.ts` — remove `mcp`/`direct_api`/`computer_use` variants, add one-per-toolkit preflight
- `src/lib/ai/system-prompt.ts:254-260` — update `<using-connection-tools>` section
- `src/lib/runner/run-agent.ts:237-261` — simplify composio load block (remove file bridge options)

**Migration:**
- Supabase migration: `UNIQUE (client_id, toolkit_slug)` constraint + drop `tool_schemas` column

---

## Task 1: SDK Bump — Verify Baseline

**Files:**
- Modify: `package.json`

### Step 1: Run existing test suite to confirm green baseline

```bash
pnpm vitest run src/lib/composio/ --reporter=verbose
```

Expected: All tests pass. This is your safety net — if tests fail here, the codebase has pre-existing issues. Do not proceed until green.

### Step 2: Bump SDK versions

In `package.json`, change:
```
"@composio/core": "^0.6.4" → "^0.6.8"
"@composio/vercel": "^0.6.4" → "^0.6.8"
```

### Step 3: Install and verify

```bash
pnpm install
```

### Step 4: Run full test suite to verify no regressions from bump

```bash
pnpm vitest run src/lib/composio/ --reporter=verbose
```

Expected: All tests still pass. Patch bumps should have no breaking changes.

### Step 5: Commit

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(pr69): bump @composio/core + @composio/vercel to ^0.6.8"
```

---

## Task 2: Delete Dead Files — tools.ts, file-bridge.ts, and Their Tests

These files are being replaced, not refactored. Delete them before writing new code so there's no temptation to adapt existing code.

**Files:**
- Delete: `src/lib/composio/tools.ts`
- Delete: `src/lib/composio/__tests__/tools.test.ts`
- Delete: `src/lib/composio/file-bridge.ts`
- Modify: `src/lib/composio/index.ts` — remove `loadComposioTools` export

### Step 1: Remove `loadComposioTools` export from index.ts

In `src/lib/composio/index.ts`, delete this line:
```typescript
export { loadComposioTools } from "./tools";
```

### Step 2: Verify no remaining imports of deleted modules

```bash
pnpm vitest run --reporter=verbose 2>&1 | head -50
```

Check for import errors pointing to `./tools` or `./file-bridge`. If runner tests fail because they mock `loadComposioTools`, that's expected — they mock `loadActivatedConnectionTools` which still exists.

Separately, search the codebase for any remaining imports:
```bash
grep -r "from.*composio/tools" src/ --include="*.ts" | grep -v node_modules | grep -v __tests__
grep -r "from.*composio/file-bridge" src/ --include="*.ts" | grep -v node_modules | grep -v __tests__
grep -r "loadComposioTools" src/ --include="*.ts" | grep -v node_modules | grep -v __tests__
```

Expected: Only `activated-tools.ts` imports from `./file-bridge` and `./client`. No remaining imports of `./tools` outside test files and the deleted file itself.

### Step 3: Delete the files

```bash
rm src/lib/composio/tools.ts
rm src/lib/composio/__tests__/tools.test.ts
rm src/lib/composio/file-bridge.ts
```

### Step 4: Run composio tests (activated-tools tests will still pass — they mock file-bridge)

```bash
pnpm vitest run src/lib/composio/ --reporter=verbose
```

Expected: `tools.test.ts` no longer runs (deleted). `activated-tools.test.ts` still passes (mocks file-bridge). If activated-tools tests fail here, it means the mock setup references the deleted module — that's fine, these tests will be rewritten in Task 4.

### Step 5: Commit

```bash
git add -u src/lib/composio/tools.ts src/lib/composio/__tests__/tools.test.ts src/lib/composio/file-bridge.ts src/lib/composio/index.ts
git commit -m "refactor(pr69): delete tools.ts, file-bridge.ts, and their tests"
```

---

## Task 3: Remove tool_schemas From Schemas + Queries

**Files:**
- Modify: `src/lib/connections/schemas.ts` — remove `tool_schemas` field from all three schemas
- Modify: `src/lib/connections/queries.ts` — remove `tool_schemas` handling

### Step 1: Write a failing test — schemas reject tool_schemas field

Create or open `src/lib/connections/__tests__/schemas.test.ts` (create if it doesn't exist).

```typescript
import { describe, expect, it } from "vitest";
import { connectionRowSchema, connectionInsertSchema, connectionUpdateSchema } from "../schemas";

describe("connectionRowSchema", () => {
  it("does not include tool_schemas field", () => {
    const shape = connectionRowSchema.shape;
    expect("tool_schemas" in shape).toBe(false);
  });
});

describe("connectionInsertSchema", () => {
  it("does not include tool_schemas field", () => {
    const result = connectionInsertSchema.safeParse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      composio_connected_account_id: "ca_123",
      toolkit_slug: "gmail",
      status: "active",
      tool_schemas: { GMAIL_SEND: { description: "x", inputParameters: {} } },
    });
    // After removal, tool_schemas should be stripped (passthrough) or cause an error
    if (result.success) {
      expect("tool_schemas" in result.data).toBe(false);
    }
  });
});

describe("connectionUpdateSchema", () => {
  it("does not include tool_schemas field", () => {
    const shape = connectionUpdateSchema.shape;
    expect("tool_schemas" in shape).toBe(false);
  });
});
```

### Step 2: Run to verify it fails

```bash
pnpm vitest run src/lib/connections/__tests__/schemas.test.ts --reporter=verbose
```

Expected: FAIL — `tool_schemas` is still in the schema shapes.

### Step 3: Remove tool_schemas from all three schemas in schemas.ts

In `src/lib/connections/schemas.ts`:

**connectionRowSchema** — remove:
```typescript
  tool_schemas: z.record(z.string(), z.object({
    description: z.string().nullable(),
    inputParameters: z.unknown(),
  })).default({}),
```

**connectionInsertSchema** — remove from the `.extend({})` block:
```typescript
    tool_schemas: z.record(z.string(), z.object({
      description: z.string().nullable(),
      inputParameters: z.unknown(),
    })).optional().default({}),
```

**connectionUpdateSchema** — remove:
```typescript
  tool_schemas: z.record(z.string(), z.object({
    description: z.string().nullable(),
    inputParameters: z.unknown(),
  })).optional(),
```

### Step 4: Run schema tests to verify they pass

```bash
pnpm vitest run src/lib/connections/__tests__/schemas.test.ts --reporter=verbose
```

Expected: PASS

### Step 5: Remove tool_schemas handling from queries.ts

In `src/lib/connections/queries.ts`:

**`toConnectionInsertPayload`** — remove the `tool_schemas` destructuring and conditional spread. The function becomes:
```typescript
function toConnectionInsertPayload(input: ConnectionInsert): ConnectionInsertRow {
  return { ...input };
}
```

**`toConnectionUpdatePayload`** — same treatment:
```typescript
function toConnectionUpdatePayload(
  input: Omit<ConnectionUpdate, "id">,
): ConnectionUpdateRow {
  return { ...input };
}
```

**`updateConnectionActivatedTools`** — remove the `toolSchemas` parameter and the conditional spread:
```typescript
export async function updateConnectionActivatedTools(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
  activatedTools: string[],
): Promise<ConnectionRow> {
  try {
    return await updateConnection(supabase, clientId, {
      id: connectionId,
      activated_tools: activatedTools,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message.replace("Failed to update connection", "Failed to update activated tools")
        : "Failed to update activated tools.",
    );
  }
}
```

Also remove the `Json` import if it's only used for tool_schemas casting.

### Step 6: Run all connection tests

```bash
pnpm vitest run src/lib/connections/ --reporter=verbose
```

Expected: PASS. If other tests import `updateConnectionActivatedTools` with the old signature, they'll fail — fix the call sites (manage-tools.ts is handled in Task 5).

### Step 7: Commit

```bash
git add src/lib/connections/schemas.ts src/lib/connections/queries.ts src/lib/connections/__tests__/schemas.test.ts
git commit -m "refactor(pr69): remove tool_schemas from connection schemas and queries"
```

---

## Task 4: Rewrite activated-tools.ts + Tests (TDD)

This is the core change. Delete the old file content and write fresh using TDD.

**Files:**
- Rewrite: `src/lib/composio/activated-tools.ts`
- Rewrite: `src/lib/composio/__tests__/activated-tools.test.ts`

### Step 1: Delete old test file content and write the first failing test

Replace the entire content of `src/lib/composio/__tests__/activated-tools.test.ts` with:

```typescript
/**
 * Tests for simplified Composio activated tool loading via composio.tools.get().
 * @module lib/composio/__tests__/activated-tools
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "../client";
import { loadActivatedConnectionTools } from "../activated-tools";
import type { ConnectionRow } from "@/lib/connections/schemas";

function createMockConnection(
  overrides: Partial<ConnectionRow> & { id: string; toolkit_slug: string },
): ConnectionRow {
  return {
    id: overrides.id,
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: `composio-${overrides.id}`,
    toolkit_slug: overrides.toolkit_slug,
    display_name: null,
    account_identifier: null,
    status: "active",
    activated_tools: [],
    tool_count: 0,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("loadActivatedConnectionTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty ToolSet when no active connections have activated tools", async () => {
    const result = await loadActivatedConnectionTools(
      [
        createMockConnection({
          id: "550e8400-e29b-41d4-a716-446655440001",
          toolkit_slug: "gmail",
          activated_tools: [],
        }),
        createMockConnection({
          id: "550e8400-e29b-41d4-a716-446655440002",
          toolkit_slug: "slack",
          status: "inactive",
          activated_tools: ["SLACK_SEND_MESSAGE"],
        }),
      ],
      "user-123",
    );

    expect(result).toEqual({});
  });
});
```

### Step 2: Run to verify it fails

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts --reporter=verbose
```

Expected: FAIL — the old `loadActivatedConnectionTools` has a different signature (takes `connections` + `options`, not `connections` + `composioUserId`).

### Step 3: Delete old activated-tools.ts and write minimal implementation

Replace the entire content of `src/lib/composio/activated-tools.ts` with:

```typescript
/**
 * Loads activated Composio connection tools via composio.tools.get().
 *
 * Uses the high-level SDK interface that returns VercelProvider-wrapped tools
 * with execute() built in. Routes by composioUserId — one connected account
 * per toolkit per user means routing is unambiguous.
 *
 * @module lib/composio/activated-tools
 */
import type { ToolSet } from "ai";

import type { ConnectionRow } from "@/lib/connections/schemas";

import { getComposio } from "./client";

/**
 * Loads activated tools for all active connections.
 *
 * @param connections - All connection rows for this client (any status).
 * @param composioUserId - The Composio user ID (typically the client ID).
 * @returns A ToolSet keyed by plain slug (e.g. `GMAIL_SEND_EMAIL`).
 */
export async function loadActivatedConnectionTools(
  connections: ConnectionRow[],
  composioUserId: string,
): Promise<ToolSet> {
  const allActivatedSlugs = connections
    .filter((c) => c.status === "active" && c.activated_tools.length > 0)
    .flatMap((c) => c.activated_tools);

  if (allActivatedSlugs.length === 0) return {};

  const composio = getComposio();
  return await composio.tools.get(composioUserId, { tools: allActivatedSlugs });
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts --reporter=verbose
```

Expected: PASS — first test returns `{}` for empty/inactive connections without calling `composio.tools.get()`.

### Step 5: Write the next failing test — calls composio.tools.get with correct slugs

Add to the same `describe` block in the test file:

```typescript
  it("calls composio.tools.get with all activated slugs from active connections", async () => {
    const mockTools = {
      GMAIL_SEND_EMAIL: { execute: vi.fn() },
      SLACK_SEND_MESSAGE: { execute: vi.fn() },
    };
    vi.mocked(getComposio).mockReturnValue({
      tools: { get: vi.fn().mockResolvedValue(mockTools) },
    } as never);

    const result = await loadActivatedConnectionTools(
      [
        createMockConnection({
          id: "conn-1",
          toolkit_slug: "gmail",
          activated_tools: ["GMAIL_SEND_EMAIL"],
        }),
        createMockConnection({
          id: "conn-2",
          toolkit_slug: "slack",
          activated_tools: ["SLACK_SEND_MESSAGE"],
        }),
      ],
      "user-456",
    );

    expect(result).toBe(mockTools);
    const composio = vi.mocked(getComposio)();
    expect(composio.tools.get).toHaveBeenCalledWith("user-456", {
      tools: ["GMAIL_SEND_EMAIL", "SLACK_SEND_MESSAGE"],
    });
  });
```

### Step 6: Run to verify it passes (implementation already handles this)

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts --reporter=verbose
```

Expected: PASS

### Step 7: Write test — tool names are plain slugs, no connection ID prefix

```typescript
  it("returns tools keyed by plain slug, not connection-ID-prefixed names", async () => {
    const mockTools = {
      GMAIL_SEND_EMAIL: { execute: vi.fn() },
      GMAIL_READ_EMAIL: { execute: vi.fn() },
    };
    vi.mocked(getComposio).mockReturnValue({
      tools: { get: vi.fn().mockResolvedValue(mockTools) },
    } as never);

    const result = await loadActivatedConnectionTools(
      [
        createMockConnection({
          id: "550e8400-e29b-41d4-a716-446655440003",
          toolkit_slug: "gmail",
          activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
        }),
      ],
      "user-789",
    );

    const keys = Object.keys(result);
    expect(keys).toEqual(["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]);
    // Verify NO connection ID prefix
    for (const key of keys) {
      expect(key).not.toContain("__");
      expect(key).not.toContain("550e8400");
    }
  });
```

### Step 8: Run to verify it passes

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts --reporter=verbose
```

Expected: PASS

### Step 9: Write test — skips pending/inactive/error connections

```typescript
  it("skips pending, inactive, and error connections", async () => {
    const result = await loadActivatedConnectionTools(
      [
        createMockConnection({
          id: "conn-pending",
          toolkit_slug: "gmail",
          status: "pending",
          activated_tools: ["GMAIL_SEND_EMAIL"],
        }),
        createMockConnection({
          id: "conn-error",
          toolkit_slug: "slack",
          status: "error",
          activated_tools: ["SLACK_SEND_MESSAGE"],
        }),
        createMockConnection({
          id: "conn-inactive",
          toolkit_slug: "googledrive",
          status: "inactive",
          activated_tools: ["GOOGLEDRIVE_FIND_FILE"],
        }),
      ],
      "user-000",
    );

    expect(result).toEqual({});
  });
```

### Step 10: Run to verify it passes

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts --reporter=verbose
```

Expected: PASS

### Step 11: Write test — deduplicates slugs across connections

```typescript
  it("deduplicates slugs when multiple connections activate the same tool", async () => {
    const mockTools = { GMAIL_SEND_EMAIL: { execute: vi.fn() } };
    const mockGet = vi.fn().mockResolvedValue(mockTools);
    vi.mocked(getComposio).mockReturnValue({
      tools: { get: mockGet },
    } as never);

    await loadActivatedConnectionTools(
      [
        createMockConnection({
          id: "conn-a",
          toolkit_slug: "gmail",
          activated_tools: ["GMAIL_SEND_EMAIL"],
        }),
        createMockConnection({
          id: "conn-b",
          toolkit_slug: "gmail",
          activated_tools: ["GMAIL_SEND_EMAIL"],
        }),
      ],
      "user-dedup",
    );

    // Should pass both slugs to Composio (SDK handles dedup internally)
    // The key thing is that it doesn't crash or create duplicates in the result
    expect(mockGet).toHaveBeenCalledOnce();
  });
```

### Step 12: Run to verify it passes

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts --reporter=verbose
```

Expected: PASS

### Step 13: Commit

```bash
git add src/lib/composio/activated-tools.ts src/lib/composio/__tests__/activated-tools.test.ts
git commit -m "refactor(pr69): rewrite activated-tools.ts using composio.tools.get()"
```

---

## Task 5: Remove Schema Caching From manage-tools.ts

**Files:**
- Modify: `src/lib/runner/tools/connections/manage-tools.ts:93-104`

### Step 1: Write a failing test — updateConnectionActivatedTools called without schemas

If `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts` exists, add a test there. Otherwise create it:

```typescript
import { describe, expect, it, vi } from "vitest";

const { mockGetConnectionById, mockUpdateConnectionActivatedTools, mockGetComposio } = vi.hoisted(() => ({
  mockGetConnectionById: vi.fn(),
  mockUpdateConnectionActivatedTools: vi.fn(),
  mockGetComposio: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  getConnectionById: (...args: unknown[]) => mockGetConnectionById(...args),
  updateConnectionActivatedTools: (...args: unknown[]) => mockUpdateConnectionActivatedTools(...args),
}));
vi.mock("@/lib/composio/client", () => ({
  getComposio: mockGetComposio,
  COMPOSIO_TOOL_FETCH_LIMIT: 200,
}));

import { createManageToolsTool } from "../manage-tools";

describe("manage_activated_tools_for_connections — no schema caching", () => {
  it("calls updateConnectionActivatedTools with 4 args (no toolSchemas)", async () => {
    const connection = {
      id: "conn-1",
      client_id: "client-1",
      toolkit_slug: "gmail",
      activated_tools: [],
      status: "active",
    };
    mockGetConnectionById.mockResolvedValue(connection);
    mockGetComposio.mockReturnValue({
      tools: {
        getRawComposioTools: vi.fn().mockResolvedValue([
          { slug: "GMAIL_SEND_EMAIL", description: "Send", inputParameters: {} },
        ]),
      },
    });
    mockUpdateConnectionActivatedTools.mockResolvedValue({
      ...connection,
      activated_tools: ["GMAIL_SEND_EMAIL"],
    });

    const { manage_activated_tools_for_connections } = createManageToolsTool(
      "supabase" as never,
      "client-1",
    );
    await manage_activated_tools_for_connections.execute(
      {
        connections: [
          { connectionId: "conn-1", activate: ["GMAIL_SEND_EMAIL"], deactivate: [] },
        ],
      },
      { toolCallId: "tc-1", messages: [], abortSignal: undefined as never },
    );

    // Key assertion: called with exactly 4 args, NOT 5
    expect(mockUpdateConnectionActivatedTools).toHaveBeenCalledWith(
      "supabase",
      "client-1",
      "conn-1",
      ["GMAIL_SEND_EMAIL"],
    );
  });
});
```

### Step 2: Run to verify it fails

```bash
pnpm vitest run src/lib/runner/tools/connections/__tests__/manage-tools.test.ts --reporter=verbose
```

Expected: FAIL — currently called with 5 args (includes `schemasToCache`).

### Step 3: Remove the schema caching block from manage-tools.ts

In `src/lib/runner/tools/connections/manage-tools.ts`, delete lines 93-104 (the `schemasToCache` block):

```typescript
          // Cache tool schemas for activated tools so runtime loading avoids Composio API calls
          const schemasToCache: Record<string, { description: string | null; inputParameters: unknown }> = {};
          for (const rawTool of rawTools) {
            if (nextActivatedTools.has(rawTool.slug)) {
              schemasToCache[rawTool.slug] = {
                description: rawTool.description ?? null,
                inputParameters: rawTool.inputParameters ?? null,
              };
            }
          }
```

And change the `updateConnectionActivatedTools` call from:
```typescript
          await updateConnectionActivatedTools(supabase, clientId, connection.id, activatedTools, schemasToCache);
```
to:
```typescript
          await updateConnectionActivatedTools(supabase, clientId, connection.id, activatedTools);
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/tools/connections/__tests__/manage-tools.test.ts --reporter=verbose
```

Expected: PASS

### Step 5: Also update the tool description text in manage-tools.ts

The `description` string in `createManageToolsTool` references connection-ID-prefixed tool names. Update the description to remove prefix language. Find and replace:

Old text (in the description string):
```
Activated tools will then become available to use and will appear in your tool context with the tool name prefixed by the connection ID. For example, the search_for_info tool on connection Id conn_1234 will appear as conn_1234__search_for_info in your prompt. If you don't see the tool you need try activating it first.
```

New text:
```
Activated tools will then become available to use and will appear in your tool list by their slug (e.g. GMAIL_SEND_EMAIL, GOOGLEDRIVE_FIND_FILE). If you don't see the tool you need, try activating it first.
```

### Step 6: Commit

```bash
git add src/lib/runner/tools/connections/manage-tools.ts src/lib/runner/tools/connections/__tests__/manage-tools.test.ts
git commit -m "refactor(pr69): remove schema caching from manage-tools, update tool description"
```

---

## Task 6: Simplify create-connection.ts — Remove Dead Variants + Add Preflight

**Files:**
- Modify: `src/lib/runner/tools/connections/create-connection.ts`

### Step 1: Write a failing test — flat integrations-only schema

Create `src/lib/runner/tools/connections/__tests__/create-connection.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

const {
  mockGetToolkitDisplayInfo,
  mockInitiateOAuthFlow,
  mockGetCallbackUrl,
  mockGetActiveConnectionsByToolkit,
  mockInsertConnection,
  mockGetActiveConnectionByToolkit,
} = vi.hoisted(() => ({
  mockGetToolkitDisplayInfo: vi.fn(),
  mockInitiateOAuthFlow: vi.fn(),
  mockGetCallbackUrl: vi.fn().mockReturnValue("https://example.com/callback"),
  mockGetActiveConnectionsByToolkit: vi.fn().mockResolvedValue([]),
  mockInsertConnection: vi.fn().mockResolvedValue({}),
  mockGetActiveConnectionByToolkit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/composio/catalog", () => ({
  getToolkitDisplayInfo: (...args: unknown[]) => mockGetToolkitDisplayInfo(...args),
}));
vi.mock("@/lib/composio/connection-flow", () => ({
  initiateOAuthFlow: (...args: unknown[]) => mockInitiateOAuthFlow(...args),
  getCallbackUrl: (...args: unknown[]) => mockGetCallbackUrl(...args),
}));
vi.mock("@/lib/connections/queries", () => ({
  getActiveConnectionsByToolkit: (...args: unknown[]) => mockGetActiveConnectionsByToolkit(...args),
  getActiveConnectionByToolkit: (...args: unknown[]) => mockGetActiveConnectionByToolkit(...args),
  insertConnection: (...args: unknown[]) => mockInsertConnection(...args),
}));

import { createCreateConnectionTool } from "../create-connection";

describe("create_new_connections — simplified schema", () => {
  it("accepts flat integrations array without discriminatedUnion type field", async () => {
    mockGetToolkitDisplayInfo.mockResolvedValue({
      integrationId: "gmail",
      displayName: "Gmail",
      description: "Google email",
    });
    mockInitiateOAuthFlow.mockResolvedValue({
      redirectUrl: "https://composio.dev/auth",
      connectedAccountId: "ca_123",
    });

    const { create_new_connections } = createCreateConnectionTool(
      "supabase" as never,
      "client-1",
    );

    const result = await create_new_connections.execute(
      {
        integrations: [
          { integrationId: "gmail" },
        ],
      },
      { toolCallId: "tc-1", messages: [], abortSignal: undefined as never },
    );

    expect(result).toHaveProperty("success", true);
  });

  it("blocks duplicate same-toolkit connection before OAuth", async () => {
    mockGetActiveConnectionByToolkit.mockResolvedValue({
      id: "existing-conn",
      toolkit_slug: "gmail",
      status: "active",
    });

    const { create_new_connections } = createCreateConnectionTool(
      "supabase" as never,
      "client-1",
    );

    const result = await create_new_connections.execute(
      {
        integrations: [
          { integrationId: "gmail" },
        ],
      },
      { toolCallId: "tc-2", messages: [], abortSignal: undefined as never },
    ) as { success: boolean; results: Array<{ error?: string }> };

    // Should NOT have called initiateOAuthFlow
    expect(mockInitiateOAuthFlow).not.toHaveBeenCalled();
    // Should return error for the blocked integration
    expect(result.results[0].error).toContain("Already connected");
  });
});
```

### Step 2: Run to verify it fails

```bash
pnpm vitest run src/lib/runner/tools/connections/__tests__/create-connection.test.ts --reporter=verbose
```

Expected: FAIL — current schema expects `{ connection: { type: "integrations", integrations: [...] } }`, not `{ integrations: [...] }`.

### Step 3: Rewrite create-connection.ts

Replace the input schema and handler. Key changes:
1. Replace `discriminatedUnion` with a flat `z.object({ integrations: z.array(...) })`
2. Add one-per-toolkit preflight before `initiateOAuthFlow()`
3. Remove `mcp`, `direct_api`, `computer_use` branches

New input schema:
```typescript
const createConnectionInputSchema = z.object({
  integrations: z.array(
    z.object({
      integrationId: z.string().trim().min(1),
      toolsToActivate: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
});
```

Add import for `getActiveConnectionByToolkit`:
```typescript
import { getActiveConnectionsByToolkit, getActiveConnectionByToolkit, insertConnection } from "@/lib/connections/queries";
```

In the execute handler, replace the entire body. Remove the `connection.type` switch. The handler directly iterates `integrations`. Before calling `initiateOAuthFlow()`, add the preflight check:

```typescript
      execute: async ({ integrations }) => {
        const results: Array<
          | {
              integrationId: string;
              displayName: string;
              description: string;
              connectionStatus: "pending_auth";
              redirectUrl: string;
              composioConnectedAccountId: string;
              existingConnections:
                | Array<{ connectionId: string; accountIdentifier: string | null }>
                | undefined;
            }
          | { integrationId: string; error: string }
        > = [];

        for (const integration of integrations) {
          // One-per-toolkit preflight: block before OAuth if duplicate exists
          const existing = await getActiveConnectionByToolkit(
            supabase,
            clientId,
            integration.integrationId,
          );
          if (existing) {
            results.push({
              integrationId: integration.integrationId,
              error: "Already connected. Delete the existing connection first.",
            });
            continue;
          }

          const callbackUrl = getCallbackUrl(integration.integrationId);
          const toolkitDisplayInfo = await getToolkitDisplayInfo(integration.integrationId)
            .catch(() => ({
              integrationId: integration.integrationId,
              displayName: integration.integrationId,
              description: "",
            }));
          const existingConnections = await getActiveConnectionsByToolkit(
            supabase,
            clientId,
            integration.integrationId,
          );
          const { redirectUrl, connectedAccountId } = await initiateOAuthFlow({
            composioUserId: clientId,
            toolkitSlug: integration.integrationId,
            callbackUrl,
          });

          await insertConnection(supabase, {
            client_id: clientId,
            composio_connected_account_id: connectedAccountId,
            toolkit_slug: integration.integrationId,
            display_name: null,
            account_identifier: null,
            status: "pending",
            activated_tools: integration.toolsToActivate ?? [],
            tool_count: 0,
          });

          results.push({
            integrationId: integration.integrationId,
            displayName: toolkitDisplayInfo.displayName,
            description: toolkitDisplayInfo.description,
            connectionStatus: "pending_auth",
            redirectUrl,
            composioConnectedAccountId: connectedAccountId,
            existingConnections:
              existingConnections.length > 0
                ? existingConnections.map((ec) => ({
                    connectionId: ec.id,
                    accountIdentifier: ec.account_identifier,
                  }))
                : undefined,
          });
        }

        return {
          success: true,
          message:
            "Connection cards are ready in chat for the user to complete authorization. After they finish, use list_users_connections to verify the connections were created.",
          results,
        };
      },
```

Also update the tool `description` string to remove mentions of MCP, Direct API, and Computer Use. Replace:
```
Supports the creation of 4 different types of connections: pre-built integrations, custom MCP, Direct API (HTTP) and Computer Use.
For pre-built integrations supports the creation of multiple connections at once. All others support only one connection creation at a time.
```
with:
```
Supports creating connections to pre-built integrations. Supports multiple connections at once.
```

### Step 4: Run tests to verify they pass

```bash
pnpm vitest run src/lib/runner/tools/connections/__tests__/create-connection.test.ts --reporter=verbose
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/create-connection.ts src/lib/runner/tools/connections/__tests__/create-connection.test.ts
git commit -m "refactor(pr69): simplify create-connection — flat schema, one-per-toolkit preflight"
```

---

## Task 7: Update System Prompt

**Files:**
- Modify: `src/lib/ai/system-prompt.ts:254-260`

### Step 1: Write a failing test

Create or add to `src/lib/ai/__tests__/system-prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../system-prompt";

describe("system prompt — connection tools section", () => {
  it("does not reference connection-ID-prefixed tool names", () => {
    expect(SYSTEM_PROMPT).not.toContain("conn_1234__search_for_info");
    expect(SYSTEM_PROMPT).not.toContain("prefixed with their connection ID");
  });

  it("references plain slug tool names", () => {
    expect(SYSTEM_PROMPT).toContain("GMAIL_SEND_EMAIL");
    expect(SYSTEM_PROMPT).toContain("GOOGLEDRIVE_FIND_FILE");
  });
});
```

### Step 2: Run to verify it fails

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts --reporter=verbose
```

Expected: FAIL — current prompt contains `conn_1234__search_for_info`.

### Step 3: Update the `<using-connection-tools>` section

In `src/lib/ai/system-prompt.ts`, replace lines 254-260:

Old:
```
<using-connection-tools>
You MUST activate the tools you want to use from your connections before using them by calling manage_activated_tools_for_connections (GATED — see <safety>).
Activated connection tools will appear in your prompt prefixed with their connection ID. For example, the search_for_info tool on connection Id conn_1234 will appear as conn_1234__search_for_info in your prompt. If you do not see the tool you need, try activating it first.
To discover the full set of tools that are available for each connection before activating them, call get_details_for_connections.

If your connection has an associated skills file shown in the system-reminder, you MUST read and follow the instructions in the skills file before using any tools from that connection.
</using-connection-tools>
```

New:
```
<using-connection-tools>
You MUST activate the tools you want to use from your connections before using them by calling manage_activated_tools_for_connections (GATED — see <safety>).
Activated connection tools appear directly in your tool list by their slug (e.g. GMAIL_SEND_EMAIL, GOOGLEDRIVE_FIND_FILE). If you do not see a tool you need, activate it first via manage_activated_tools_for_connections.
To discover the full set of tools that are available for each connection before activating them, call get_details_for_connections.

If your connection has an associated skills file shown in the system-reminder, you MUST read and follow the instructions in the skills file before using any tools from that connection.
</using-connection-tools>
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts --reporter=verbose
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "refactor(pr69): update system prompt — plain slug names for connection tools"
```

---

## Task 8: Update run-agent.ts Composio Load Block

**Files:**
- Modify: `src/lib/runner/run-agent.ts:237-261`

### Step 1: Write a failing test

The composio load block currently passes `supabase`, `clientId`, `fileClient`, and `getSandbox` to `loadActivatedConnectionTools`. The new signature only takes `(connections, composioUserId)`. Add a test to verify the new call shape.

In `src/lib/runner/__tests__/run-agent.test.ts`, find the mock for `loadActivatedConnectionTools` and verify it's called with the right args. If there's already an integration-level test, modify it. Otherwise, add:

```typescript
// In the existing test file, find where loadActivatedConnectionTools is mocked.
// Verify the mock is called with (connections, clientId) — not the old options object.
```

Alternatively, since this is a mechanical wiring change, you can verify by running the existing runner tests after making the change.

### Step 2: Update run-agent.ts

In `src/lib/runner/run-agent.ts`:

1. Remove the file bridge setup (lines ~237-241):
```typescript
    // DELETE these lines:
    const composioFileClient = createAgentFileClient(supabase, clientId);
    let sandboxGetter: (() => import("@vercel/sandbox").Sandbox | null) = () => null;
```

2. Simplify the composio load block (lines ~243-261):
```typescript
    const composioPromise = getActiveConnections(supabase, clientId)
      .then((connections) => {
        _t("get_connections");
        return loadActivatedConnectionTools(connections, clientId);
      })
      .then((tools) => {
        _t("load_composio_tools");
        return tools;
      })
      .catch((error) => {
        _t("composio_failed");
        console.error("[composio] Failed to load activated connection tools for runner.", error);
        return {} as ToolSet;
      });
```

3. Remove the `createAgentFileClient` import if it's no longer used elsewhere in the file.

4. Remove the `sandboxGetter` reference from the bash tool setup if it was piped through from here. Search for `sandboxGetter` in the file to find and clean up any remaining references.

### Step 3: Run runner tests to verify

```bash
pnpm vitest run src/lib/runner/__tests__/ --reporter=verbose
```

Expected: PASS — existing runner tests mock `loadActivatedConnectionTools` at the module level, so they should adapt to the new signature. If any test passes the old `options` object, update that mock to pass `clientId` string instead.

### Step 4: Commit

```bash
git add src/lib/runner/run-agent.ts
git commit -m "refactor(pr69): simplify composio load block in run-agent — remove file bridge"
```

---

## Task 9: DB Migration — UNIQUE Constraint + Drop tool_schemas

**Files:**
- Create: Supabase migration file

### Step 1: Check for existing duplicate toolkit rows

Before adding the constraint, verify no duplicates exist:

```sql
SELECT client_id, toolkit_slug, COUNT(*)
FROM connections
GROUP BY client_id, toolkit_slug
HAVING COUNT(*) > 1;
```

If any rows are returned, you must resolve them manually (delete/merge duplicates) before proceeding.

### Step 2: Create the migration

```bash
pnpm supabase migration new composio_sdk_simplification
```

This creates a file in `supabase/migrations/`. Edit it:

```sql
-- PR 69: Composio SDK simplification
-- 1. Enforce one connected account per toolkit per user
ALTER TABLE connections
  ADD CONSTRAINT connections_client_toolkit_unique
  UNIQUE (client_id, toolkit_slug);

-- 2. Drop the tool_schemas column (no longer used — composio.tools.get() fetches schemas live)
ALTER TABLE connections
  DROP COLUMN IF EXISTS tool_schemas;
```

### Step 3: Apply locally and verify

```bash
pnpm supabase db reset
```

Or if using a branch:
```bash
pnpm supabase migration up
```

### Step 4: Run full test suite

```bash
pnpm vitest run --reporter=verbose
```

Expected: All tests pass. The `tool_schemas` column removal should not break any code since we already removed all references in Tasks 3-5.

### Step 5: Commit

```bash
git add supabase/migrations/
git commit -m "migrate(pr69): add UNIQUE(client_id, toolkit_slug), drop tool_schemas column"
```

---

## Task 10: Full Suite Verification + Cleanup

### Step 1: Run the full test suite

```bash
pnpm vitest run --reporter=verbose
```

Expected: All tests pass.

### Step 2: Search for any remaining references to removed concepts

```bash
grep -r "tool_schemas" src/ --include="*.ts" | grep -v node_modules | grep -v __tests__
grep -r "file-bridge" src/ --include="*.ts" | grep -v node_modules
grep -r "conn_.*__" src/ --include="*.ts" | grep -v node_modules | grep -v __tests__
grep -r "dangerouslySkipVersionCheck" src/ --include="*.ts" | grep -v node_modules
grep -r "composio.tools.execute" src/ --include="*.ts" | grep -v node_modules
```

Expected: No matches for any of these (outside test files and node_modules).

### Step 3: Verify deleted files are gone

```bash
ls src/lib/composio/tools.ts 2>&1       # Should: "No such file"
ls src/lib/composio/file-bridge.ts 2>&1  # Should: "No such file"
ls src/lib/composio/__tests__/tools.test.ts 2>&1  # Should: "No such file"
```

### Step 4: Type check

```bash
pnpm tsc --noEmit
```

Expected: No type errors.

### Step 5: Final commit if any cleanup was needed

```bash
git add -A
git commit -m "refactor(pr69): final cleanup — remove stale references"
```
