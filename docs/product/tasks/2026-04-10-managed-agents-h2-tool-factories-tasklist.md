# Managed Agents Migration — H2 Custom Tool Factories — TDD Tasklist

**Plan:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md`
**Decisions:** `D8` (run_sql / get_agent_db_schema are chat-only custom tools), `D9` (all tools ported as custom tools, no MCP)
**Prerequisite:** H1 must be merged (schema migration, agent + environment created, `src/lib/memory/` deleted, `crmMode` removed, SOUL.md/USER.md data migrated to `clients.client_profile` / `clients.user_preferences`).

**Goal:** Port all 38 Sunder tool factories from `src/lib/runner/tools/*` to `src/lib/managed-agents/tools/*` in a new dispatch-friendly shape, with unit tests and a CI lint that enforces the explicit `client_id` filter — without wiring the new factories into any production code path.

**Architecture:** The managed-agents dispatcher (built in H3) will import a registry of `ManagedAgentTool` objects from `src/lib/managed-agents/tools/index.ts` and call each tool's `execute(input, context)` method with a Supabase client injected per request. The chat path passes a **user-authenticated** Supabase client (RLS enforced + explicit filters = double layer per D9). The trigger path passes a **service-role** client (explicit filters are the single layer, protected by a CI lint). Two tools (`run_sql`, `get_agent_db_schema`) set `chatOnly: true`; the H3 dispatcher will auto-reject them in trigger context.

**Tech Stack:** Zod 4 schemas (reused from runner), Vitest + reusable `src/test/mocks/supabase.ts` for unit tests, `ts-morph` for the CI AST lint, Supabase `SupabaseClient<Database>` typing, Composio SDK (`@composio/core`) for the two new dispatch tools.

**Non-negotiables:**
1. **Do NOT delete `src/lib/runner/tools/*`.** Legacy runner is still live; H4 removes the originals in the cutover PR.
2. **Do NOT wire the new tools into any adapter, chat route, or cron.** They are dead code until H3 + H4 ship.
3. **Do NOT change tool input schemas, query logic, or result shapes.** Port, not refactor.
4. **Every `supabase.from("<table>")` chain on a tenant-scoped table MUST include `.eq("client_id", context.clientId)`.** The lint enforces this.
5. **`chatOnly: true`** is set on exactly two tools: `run_sql` and `get_agent_db_schema`. Nothing else.
6. **Composio is two dispatch tools**, not N per-app tools. Don't try to port `gmail_send`, `gcal_create` as individual tools.
7. **`execute(input, context)`** — the second parameter is a `ToolContext`, not the Vercel AI SDK `ToolExecuteOptions`. Do **not** import from `"ai"`.
8. **Own the types.** Define a minimal `ManagedAgentTool` interface in this package. Do not pull in `@anthropic-ai/sdk` types.

**Out of scope:**
- Building the dispatcher (`src/lib/managed-agents/dispatcher.ts`) — that's H3.
- Wiring the adapter, chat route swap, Telegram approval routing — those are H3 and H4.
- Deleting legacy runner code — H4.
- Composio session caching / Redis — future optimization.
- JSON-Schema conversion from Zod for agent creation — the `scripts/managed-agents/create-agent.ts` in H1 already handles that. Your tools just hold Zod schemas.

---

## Relevant Files

### Create (new H2 surface)

**Types / registry:**
- `src/lib/managed-agents/tools/types.ts`
- `src/lib/managed-agents/tools/index.ts`

**CRM (13 tools):**
- `src/lib/managed-agents/tools/crm/search.ts`
- `src/lib/managed-agents/tools/crm/create-record.ts`
- `src/lib/managed-agents/tools/crm/update-record.ts`
- `src/lib/managed-agents/tools/crm/delete-records.ts`
- `src/lib/managed-agents/tools/crm/link-records.ts`
- `src/lib/managed-agents/tools/crm/interactions.ts`  _(exports `createInteractionTool`)_
- `src/lib/managed-agents/tools/crm/tasks.ts`  _(exports `createTaskTool`, `updateTaskTool`)_
- `src/lib/managed-agents/tools/crm/configure-crm.ts`
- `src/lib/managed-agents/tools/crm/attach-file.ts`
- `src/lib/managed-agents/tools/crm/list-attachments.ts`
- `src/lib/managed-agents/tools/crm/delete-attachment.ts`
- `src/lib/managed-agents/tools/crm/manage-views.ts`
- `src/lib/managed-agents/tools/crm/index.ts`  _(barrel — ONLY re-exports)_

**Search (3):**
- `src/lib/managed-agents/tools/web/search.ts`
- `src/lib/managed-agents/tools/web/scrape.ts`
- `src/lib/managed-agents/tools/web/drive-time.ts`
- `src/lib/managed-agents/tools/web/index.ts`

**Storage (2):**
- `src/lib/managed-agents/tools/storage/storage-read.ts`
- `src/lib/managed-agents/tools/storage/storage-write.ts`
- `src/lib/managed-agents/tools/storage/index.ts`

**Messaging (1):**
- `src/lib/managed-agents/tools/messaging/send-message.ts`
- `src/lib/managed-agents/tools/messaging/index.ts`

**Triggers (3):**
- `src/lib/managed-agents/tools/triggers/setup-trigger.ts`
- `src/lib/managed-agents/tools/triggers/manage-active-triggers.ts`
- `src/lib/managed-agents/tools/triggers/search-triggers.ts`
- `src/lib/managed-agents/tools/triggers/index.ts`

**Browser (3):**
- `src/lib/managed-agents/tools/browser/browse-website.ts`
- `src/lib/managed-agents/tools/browser/search-99co.ts`
- `src/lib/managed-agents/tools/browser/search-propertyguru.ts`
- `src/lib/managed-agents/tools/browser/index.ts`

**Meetings (1):**
- `src/lib/managed-agents/tools/meetings/search-meetings.ts`
- `src/lib/managed-agents/tools/meetings/index.ts`

**Market (1):**
- `src/lib/managed-agents/tools/market/search-market-data.ts`
- `src/lib/managed-agents/tools/market/index.ts`

**Utility (5):**
- `src/lib/managed-agents/tools/utility/rename-chat.ts`
- `src/lib/managed-agents/tools/utility/manage-todo.ts`
- `src/lib/managed-agents/tools/utility/list-todo.ts`
- `src/lib/managed-agents/tools/utility/run-sql.ts`  _(`chatOnly: true`)_
- `src/lib/managed-agents/tools/utility/get-agent-db-schema.ts`  _(`chatOnly: true`)_
- `src/lib/managed-agents/tools/utility/index.ts`

**Composio management (6):**
- `src/lib/managed-agents/tools/connections/list-connections.ts`
- `src/lib/managed-agents/tools/connections/get-connection-details.ts`
- `src/lib/managed-agents/tools/connections/search-integrations.ts`
- `src/lib/managed-agents/tools/connections/get-integration-capabilities.ts`
- `src/lib/managed-agents/tools/connections/manage-activated-tools.ts`
- `src/lib/managed-agents/tools/connections/delete-connection.ts`
- `src/lib/managed-agents/tools/connections/index.ts`

**Composio dispatch (2 — NEW per D9, not a 1:1 port):**
- `src/lib/managed-agents/tools/connections/list-composio-tools.ts`
- `src/lib/managed-agents/tools/connections/execute-composio-tool.ts`

**Browser-side (3):**
- `src/lib/managed-agents/tools/browser-side/ask-user-question.ts`
- `src/lib/managed-agents/tools/browser-side/create-connection.ts`
- `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts`
- `src/lib/managed-agents/tools/browser-side/index.ts`

**Unit tests:** one `__tests__/*.test.ts` per tool file (~38 tests). Colocated under each subdirectory.

**CI lint:**
- `scripts/lint-tool-tenant-filter.ts`
- `scripts/__tests__/lint-tool-tenant-filter.test.ts`
- `scripts/__fixtures__/lint-tool-tenant-filter/good-tool.ts`
- `scripts/__fixtures__/lint-tool-tenant-filter/bad-tool.ts`
- `scripts/__fixtures__/lint-tool-tenant-filter/tenant-neutral-tool.ts`

### Modify
- `package.json` — add `ts-morph` devDependency, add `lint:tenant-filter` npm script
- (Optionally) `.github/workflows/*.yml` — add the lint step alongside typecheck/test if one exists

### Reference only (DO NOT MODIFY)
- `src/lib/runner/tool-registry.ts` — wiring reference
- `src/lib/runner/tools/crm/**` — 13 factories to port
- `src/lib/runner/tools/web/**` — 3 factories
- `src/lib/runner/tools/storage/index.ts` — 2 factories (read_file, write_file → storage_read, storage_write)
- `src/lib/runner/tools/utility/*.ts` — 5 factories
- `src/lib/runner/tools/meetings/**` — 1 factory
- `src/lib/runner/tools/market/**` — 1 factory
- `src/lib/runner/tools/triggers/**` — 3 factories
- `src/lib/runner/tools/browser/**` — 3 factories
- `src/lib/runner/tools/connections/**` — 6 management + 2 browser-side existing factories (`create-connection.ts`, `reauthorize-connection.ts`)
- `src/lib/composio/client.ts`, `src/lib/composio/catalog.ts` — reused from dispatch tools
- `src/test/mocks/supabase.ts`, `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` — reusable mocks

---

## Task 1: Define `ManagedAgentTool` interface and `ToolContext`

**Goal:** Create the minimal types the entire H2 surface depends on. This is the **contract with H3's dispatcher**: if the shape changes later, H3 has to adapt.

**Files:**
- Create: `src/lib/managed-agents/tools/types.ts`

### Step 1: Create the types file

Create `src/lib/managed-agents/tools/types.ts`:

```typescript
/**
 * Core types for the managed-agents custom tool layer.
 *
 * Tools in this package are dispatch-friendly: each tool exports a plain object
 * with `execute(input, context)`. The dispatcher (H3) supplies the correct
 * Supabase client per request (user-authenticated for chat, service-role for
 * triggers). Do NOT depend on `"ai"` or `@anthropic-ai/sdk` in this module —
 * the dispatcher translates to the Anthropic wire format.
 *
 * @module lib/managed-agents/tools/types
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import type { CrmVocabConfig } from "@/lib/crm/config";
import type { Database } from "@/types/database";

/**
 * Runtime context injected into every tool `execute` call.
 * The dispatcher constructs this per request.
 */
export interface ToolContext {
  /** Supabase client. User-authenticated for chat, service-role for triggers. */
  supabase: SupabaseClient<Database>;
  /** The owning tenant for the current session. Used in explicit `.eq("client_id", ...)` filters. */
  clientId: string;
  /** The thread this run belongs to. Used by thread-scoped tools (todo, triggers, connections). */
  threadId?: string;
  /**
   * True in the chat adapter path, false in polling-cron trigger runs.
   * The dispatcher uses this to auto-reject `chatOnly` tools in trigger context.
   */
  isChatContext: boolean;
  /** Runtime CRM vocabulary/custom-field config. Injected per client. */
  crmConfig?: CrmVocabConfig;
}

/**
 * Standard tool result shape.
 * Tools must return exactly this discriminated union.
 */
export type ToolResult<TData = Record<string, unknown>> =
  | ({ success: true } & TData)
  | { success: false; error: string };

/**
 * A managed-agents custom tool definition.
 *
 * The dispatcher converts `inputSchema` → JSON Schema at agent-creation time
 * and matches `name` to incoming `agent.custom_tool_use` events at runtime.
 */
export interface ManagedAgentTool<TInput = unknown, TOutput = ToolResult> {
  /** Tool name as exposed to the Anthropic agent (snake_case). */
  name: string;
  /** Model-facing description. Copy verbatim from the runner tool. */
  description: string;
  /** Zod schema for input validation + JSON-Schema generation. */
  inputSchema: z.ZodType<TInput>;
  /** Set to true for tools that require the chat adapter's user auth (run_sql, get_agent_db_schema). */
  chatOnly?: boolean;
  /** Tool handler. Receives validated input and per-request context. */
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}
```

### Step 2: Run typecheck to verify the file compiles in isolation

```bash
pnpm exec tsc --noEmit
```

Expected: PASS. No references yet, nothing to break.

### Step 3: Commit

```bash
git add src/lib/managed-agents/tools/types.ts
git commit -m "feat(h2): define ManagedAgentTool interface and ToolContext"
```

---

## Task 2: CI lint for explicit `client_id` filters

**Goal:** Ship the AST check BEFORE porting any tool. Every subsequent task then writes code that must pass this lint. Writing the lint first is a TDD-style forcing function.

**Files:**
- Create: `scripts/lint-tool-tenant-filter.ts`
- Create: `scripts/__tests__/lint-tool-tenant-filter.test.ts`
- Create: `scripts/__fixtures__/lint-tool-tenant-filter/good-tool.ts`
- Create: `scripts/__fixtures__/lint-tool-tenant-filter/bad-tool.ts`
- Create: `scripts/__fixtures__/lint-tool-tenant-filter/tenant-neutral-tool.ts`
- Modify: `package.json` (add `ts-morph` devDep, `lint:tenant-filter` script)

### Step 1: Install ts-morph

```bash
pnpm add -D ts-morph
```

### Step 2: Create fixture files

Create `scripts/__fixtures__/lint-tool-tenant-filter/good-tool.ts`:

```typescript
import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function good(ctx: ToolContext) {
  return ctx.supabase
    .from("contacts")
    .select("*")
    .eq("client_id", ctx.clientId)
    .limit(10);
}
```

Create `scripts/__fixtures__/lint-tool-tenant-filter/bad-tool.ts`:

```typescript
import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function bad(ctx: ToolContext) {
  // Missing .eq("client_id", ...) — this file should fail the lint.
  return ctx.supabase
    .from("contacts")
    .select("*")
    .limit(10);
}
```

Create `scripts/__fixtures__/lint-tool-tenant-filter/tenant-neutral-tool.ts`:

```typescript
import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function neutral(ctx: ToolContext) {
  // @tenant-neutral: composio_catalog is a global reference table with no client_id column.
  return ctx.supabase.from("composio_catalog").select("*").limit(10);
}
```

### Step 3: Write failing tests for the lint

Create `scripts/__tests__/lint-tool-tenant-filter.test.ts`:

```typescript
import path from "node:path";
import { describe, expect, it } from "vitest";

import { lintToolTenantFilter } from "../lint-tool-tenant-filter";

const FIXTURES = path.join(__dirname, "..", "__fixtures__", "lint-tool-tenant-filter");

describe("lintToolTenantFilter", () => {
  it("accepts a tool with an explicit .eq('client_id', ...) filter", () => {
    const violations = lintToolTenantFilter([path.join(FIXTURES, "good-tool.ts")]);
    expect(violations).toEqual([]);
  });

  it("flags a tool that omits the client_id filter", () => {
    const violations = lintToolTenantFilter([path.join(FIXTURES, "bad-tool.ts")]);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toContain("bad-tool.ts");
    expect(violations[0].table).toBe("contacts");
    expect(violations[0].line).toBeGreaterThan(0);
  });

  it("accepts a @tenant-neutral annotated .from() call", () => {
    const violations = lintToolTenantFilter([
      path.join(FIXTURES, "tenant-neutral-tool.ts"),
    ]);
    expect(violations).toEqual([]);
  });
});
```

### Step 4: Run test to verify it fails

```bash
pnpm vitest run scripts/__tests__/lint-tool-tenant-filter.test.ts
```

Expected: FAIL — `lintToolTenantFilter` does not exist.

### Step 5: Implement the lint

Create `scripts/lint-tool-tenant-filter.ts`:

```typescript
/**
 * AST-level check that every Supabase query builder chain in the managed-agents
 * tool directory includes an explicit `.eq("client_id", ...)` filter.
 *
 * The chat path has RLS as a second layer; the trigger path (service role)
 * does not — so the explicit filter is the primary defense. A regression here
 * could leak cross-tenant data under trigger runs.
 *
 * Opt-out: a `// @tenant-neutral` comment on the line preceding `.from(...)` marks
 * a call as intentionally unfiltered (e.g., global reference tables).
 *
 * @module scripts/lint-tool-tenant-filter
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Node, Project, SyntaxKind } from "ts-morph";

export interface TenantFilterViolation {
  file: string;
  line: number;
  table: string;
  reason: string;
}

/**
 * Checks a call-chain expression for `.eq("client_id", ...)`.
 */
function chainHasClientIdEq(fromCall: Node): boolean {
  let node: Node | undefined = fromCall;
  // Walk upward through the chain: .from(...).select(...).eq(...)...
  while (node) {
    const parent = node.getParent();
    if (!parent || !Node.isPropertyAccessExpression(parent)) break;
    const next = parent.getParent();
    if (!next || !Node.isCallExpression(next)) break;
    if (parent.getName() === "eq") {
      const args = next.getArguments();
      const firstArg = args[0];
      if (firstArg && Node.isStringLiteral(firstArg) && firstArg.getLiteralValue() === "client_id") {
        return true;
      }
    }
    node = next;
  }
  return false;
}

function hasNeutralComment(fromCall: Node): boolean {
  const leadingComments = fromCall.getLeadingCommentRanges();
  for (const comment of leadingComments) {
    if (comment.getText().includes("@tenant-neutral")) return true;
  }
  // Also check comment on the same line as .from(...)
  const sourceFile = fromCall.getSourceFile();
  const line = fromCall.getStartLineNumber();
  const fullText = sourceFile.getFullText();
  const lines = fullText.split("\n");
  const priorLine = lines[line - 2] ?? "";
  return priorLine.includes("@tenant-neutral");
}

export function lintToolTenantFilter(files: string[]): TenantFilterViolation[] {
  const project = new Project({
    compilerOptions: { allowJs: false, noEmit: true, skipLibCheck: true },
    useInMemoryFileSystem: false,
  });
  for (const file of files) {
    project.addSourceFileAtPath(file);
  }

  const violations: TenantFilterViolation[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    sourceFile.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const expression = node.getExpression();
      if (!Node.isPropertyAccessExpression(expression)) return;
      if (expression.getName() !== "from") return;

      const args = node.getArguments();
      const firstArg = args[0];
      if (!firstArg || !Node.isStringLiteral(firstArg)) return;
      const tableName = firstArg.getLiteralValue();

      if (hasNeutralComment(node)) return;

      if (!chainHasClientIdEq(node)) {
        violations.push({
          file: sourceFile.getFilePath(),
          line: node.getStartLineNumber(),
          table: tableName,
          reason: `.from("${tableName}") must be followed by .eq("client_id", context.clientId) or marked // @tenant-neutral`,
        });
      }
    });
  }

  return violations;
}

/**
 * Collects every .ts file under a directory (recursively).
 */
export function collectToolFiles(rootDir: string): string[] {
  const project = new Project({ useInMemoryFileSystem: false });
  project.addSourceFilesAtPaths(`${rootDir}/**/*.ts`);
  return project
    .getSourceFiles()
    .map((f) => f.getFilePath())
    .filter((p) => !p.includes("__tests__") && !p.includes("__fixtures__") && !p.endsWith(".test.ts"));
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const root = path.resolve(__dirname, "..", "src", "lib", "managed-agents", "tools");
  const files = collectToolFiles(root);
  const violations = lintToolTenantFilter(files);
  if (violations.length > 0) {
    console.error(`\n✗ lint-tool-tenant-filter: ${violations.length} violation(s)\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} — ${v.reason}`);
    }
    process.exit(1);
  }
  console.log(`✓ lint-tool-tenant-filter: ${files.length} file(s) checked, no violations.`);
}
```

### Step 6: Run tests to verify they pass

```bash
pnpm vitest run scripts/__tests__/lint-tool-tenant-filter.test.ts
```

Expected: ALL PASS.

### Step 7: Add npm script

Edit `package.json` `"scripts"`:

```json
"lint:tenant-filter": "tsx scripts/lint-tool-tenant-filter.ts"
```

### Step 8: Run the script over the empty tool directory (should pass — no tools yet)

```bash
mkdir -p src/lib/managed-agents/tools && pnpm lint:tenant-filter
```

Expected: `✓ lint-tool-tenant-filter: 0 file(s) checked, no violations.`

### Step 9: Commit

```bash
git add scripts/lint-tool-tenant-filter.ts scripts/__tests__/lint-tool-tenant-filter.test.ts scripts/__fixtures__ package.json pnpm-lock.yaml
git commit -m "feat(h2): add ts-morph CI lint for explicit client_id filters"
```

---

## Task 3: Port `search_crm` (canonical template)

**Goal:** Port the first tool end-to-end. **This task is the template referenced by every subsequent CRM/utility task** — do not skip steps.

**Files:**
- Create: `src/lib/managed-agents/tools/crm/search.ts`
- Create: `src/lib/managed-agents/tools/crm/__tests__/search.test.ts`

**Reference:** `src/lib/runner/tools/crm/search.ts`, `src/lib/runner/tools/crm/__tests__/search.test.ts`

### Step 1: Write failing test for the new shape

Create `src/lib/managed-agents/tools/crm/__tests__/search.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";
import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { searchCrmTool } from "../search";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function makeContext(client: ReturnType<typeof createMockSupabase>["client"]): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("searchCrmTool", () => {
  it("exposes the expected name, description, and chatOnly flag", () => {
    expect(searchCrmTool.name).toBe("search_crm");
    expect(searchCrmTool.description).toMatch(/CRM/);
    expect(searchCrmTool.chatOnly).toBeUndefined();
  });

  it("applies the explicit client_id filter on contacts", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [{ contact_id: "c1", first_name: "John" }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "contacts", query: "John" },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, records: [{ contact_id: "c1", first_name: "John" }], count: 1 });
    expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns { success: false, error } when Supabase errors", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "boom" } },
    });

    const result = await searchCrmTool.execute(
      { entity: "contacts" },
      makeContext(client),
    );

    expect(result).toEqual({ success: false, error: "boom" });
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/search.test.ts
```

Expected: FAIL — `searchCrmTool` does not exist.

### Step 3: Port the tool

Create `src/lib/managed-agents/tools/crm/search.ts`. Copy the logic from `src/lib/runner/tools/crm/search.ts` **verbatim** except:

1. Do not import from `"ai"`.
2. Export a `ManagedAgentTool` object (not a factory).
3. The `execute` signature is `(input, context)`.
4. Every Supabase query uses `context.supabase` and `context.clientId` instead of the closed-over values.

```typescript
/**
 * Managed-agents custom tool: unified CRM search.
 * Ported from src/lib/runner/tools/crm/search.ts — same query logic,
 * same explicit client_id filters, same result shape.
 * @module lib/managed-agents/tools/crm/search
 */
import { z } from "zod";

import {
  buildIlikePattern,
  buildSearchExpression,
  DEFAULT_CRM_RESULT_LIMIT,
  normalizeDateString,
  normalizeDateUpperBound,
} from "@/lib/runner/tools/crm/filter-utils";

import type { ManagedAgentTool, ToolContext } from "../types";

const SEARCH_ENTITIES = [
  "contacts",
  "companies",
  "deals",
  "interactions",
  "tasks",
  "deal_contacts",
  "record_notes",
] as const;

type SearchEntity = (typeof SEARCH_ENTITIES)[number];

const ENTITY_CONFIG: Record<
  Exclude<SearchEntity, "deal_contacts">,
  { table: string; searchColumns: string[]; orderBy?: { column: string; ascending: boolean } }
> = {
  contacts: { table: "contacts", searchColumns: ["first_name", "last_name", "email", "phone"] },
  companies: { table: "companies", searchColumns: ["name", "website", "phone", "email", "address"] },
  deals: { table: "deals", searchColumns: ["address"] },
  interactions: { table: "interactions", searchColumns: ["summary"], orderBy: { column: "occurred_at", ascending: false } },
  tasks: { table: "crm_tasks", searchColumns: ["title", "description"], orderBy: { column: "due_date", ascending: true } },
  record_notes: { table: "record_notes", searchColumns: ["body"], orderBy: { column: "created_at", ascending: false } },
};

const DATE_RANGE_FILTERS: Record<
  string,
  { column: string; op: "gte" | "lte"; normalizer: typeof normalizeDateString }
> = {
  occurred_after: { column: "occurred_at", op: "gte", normalizer: normalizeDateString },
  occurred_before: { column: "occurred_at", op: "lte", normalizer: normalizeDateUpperBound },
};

const inputSchema = z.object({
  entity: z.enum(SEARCH_ENTITIES),
  query: z.string().trim().min(1).optional(),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

type SearchInput = z.infer<typeof inputSchema>;

async function searchDealContacts(
  context: ToolContext,
  filterEntries: [string, string | number | boolean | null][],
  maxResults: number,
) {
  const filtersMap = Object.fromEntries(filterEntries);
  const dealId = filtersMap.deal_id;
  const contactId = filtersMap.contact_id;

  if (!dealId && !contactId) {
    return { success: false as const, error: "deal_contacts requires a deal_id or contact_id filter." };
  }

  if (dealId) {
    const { data, error } = await context.supabase
      .from("deal_contacts")
      .select("*, contacts(first_name, last_name, email, phone)")
      .eq("client_id", context.clientId)
      .eq("deal_id", String(dealId))
      .limit(maxResults);
    if (error) return { success: false as const, error: error.message };
    const records = data ?? [];
    return { success: true as const, records, count: records.length };
  }

  const { data, error } = await context.supabase
    .from("deal_contacts")
    .select("*, deals(deal_id, address, stage, amount)")
    .eq("client_id", context.clientId)
    .eq("contact_id", String(contactId))
    .order("is_primary", { ascending: false })
    .limit(maxResults);
  if (error) return { success: false as const, error: error.message };
  const records = data ?? [];
  return { success: true as const, records, count: records.length };
}

export const searchCrmTool: ManagedAgentTool<SearchInput> = {
  name: "search_crm",
  description:
    "Default tool for reading CRM data. Search any entity (contacts, companies, deals, interactions, tasks, deal_contacts, record_notes) " +
    "with free-text query and key-value filters. Returns matching records sorted by relevance. " +
    "For relationships: use entity 'deal_contacts' with a deal_id or contact_id filter, " +
    "or filter contacts/deals by company_id. " +
    "For notes: use entity 'record_notes' with record_type and record_id filters to read notes, or a free-text query to search note content. " +
    "Use this before creating records to check for duplicates. " +
    "For JOINs, aggregations, or complex filters, escalate to run_sql.",
  inputSchema,
  execute: async ({ entity, query, filters, limit }, context) => {
    const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
    const filterEntries = filters ? Object.entries(filters) : [];

    if (entity === "deal_contacts") {
      return searchDealContacts(context, filterEntries, maxResults);
    }

    const config = ENTITY_CONFIG[entity];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryBuilder = (context.supabase as any)
      .from(config.table)
      .select("*")
      .eq("client_id", context.clientId);

    if (query) {
      if (config.searchColumns.length === 1) {
        queryBuilder = queryBuilder.ilike(config.searchColumns[0], buildIlikePattern(query));
      } else {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, config.searchColumns));
      }
    }

    for (const [key, value] of filterEntries) {
      if (value === null) continue;
      const dateRange = DATE_RANGE_FILTERS[key];
      if (dateRange) {
        const normalized = dateRange.normalizer(String(value));
        if (normalized) {
          queryBuilder = dateRange.op === "gte"
            ? queryBuilder.gte(dateRange.column, normalized)
            : queryBuilder.lte(dateRange.column, normalized);
        }
        continue;
      }
      queryBuilder = queryBuilder.eq(key, value);
    }

    if (config.orderBy) {
      queryBuilder = queryBuilder.order(config.orderBy.column, { ascending: config.orderBy.ascending });
    }

    const { data, error } = await queryBuilder.limit(maxResults);
    if (error) return { success: false as const, error: error.message };
    const records = data ?? [];
    return { success: true as const, records, count: records.length };
  },
};
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/search.test.ts
```

Expected: ALL PASS.

### Step 5: Run the tenant-filter lint on the new file

```bash
pnpm lint:tenant-filter
```

Expected: PASS (1 file checked, 0 violations).

### Step 6: Typecheck

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

### Step 7: Commit

```bash
git add src/lib/managed-agents/tools/crm/search.ts src/lib/managed-agents/tools/crm/__tests__/search.test.ts
git commit -m "feat(h2): port search_crm as a ManagedAgentTool"
```

---

## Task 4: Port CRM write tools — `create_record`, `update_record`, `link_records`

**Goal:** Apply the Task 3 template to three straightforward CRM mutators.

**Files:**
- Create: `src/lib/managed-agents/tools/crm/create-record.ts` + `__tests__/create-record.test.ts`
- Create: `src/lib/managed-agents/tools/crm/update-record.ts` + `__tests__/update-record.test.ts`
- Create: `src/lib/managed-agents/tools/crm/link-records.ts` + `__tests__/link-records.test.ts`

**Reference:** `src/lib/runner/tools/crm/{create-record,update-record,link-records}.ts` and their tests.

### Step 1: Port `create_record`

Follow the Task 3 template:
- Write the failing test first (use `createMockSupabase`, assert `.eq("client_id", CLIENT_ID)` is called).
- Copy query logic verbatim, drop the `tool()` wrapper, switch to `ManagedAgentTool` + `(input, context)` signature.
- Use `context.crmConfig` (optional) anywhere the runner factory used the `config` parameter.
- Export `createRecordTool`.

### Step 2: Port `update_record`

Same template. Export `updateRecordTool`.

### Step 3: Port `link_records`

Same template. Export `linkRecordsTool`.

### Step 4: Run the new tests

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/create-record.test.ts src/lib/managed-agents/tools/crm/__tests__/update-record.test.ts src/lib/managed-agents/tools/crm/__tests__/link-records.test.ts
```

Expected: ALL PASS.

### Step 5: Lint + typecheck

```bash
pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

Expected: PASS.

### Step 6: Commit

```bash
git add src/lib/managed-agents/tools/crm/create-record.ts src/lib/managed-agents/tools/crm/update-record.ts src/lib/managed-agents/tools/crm/link-records.ts src/lib/managed-agents/tools/crm/__tests__/create-record.test.ts src/lib/managed-agents/tools/crm/__tests__/update-record.test.ts src/lib/managed-agents/tools/crm/__tests__/link-records.test.ts
git commit -m "feat(h2): port create_record, update_record, link_records"
```

---

## Task 5: Port CRM interaction + task tools — `create_interaction`, `create_task`, `update_task`

**Goal:** Port the interaction and task mutators. Note `create_task` and `update_task` are both emitted by the runner's `interactions.ts` / `tasks.ts` factories — split them into the two files listed below.

**Files:**
- Create: `src/lib/managed-agents/tools/crm/interactions.ts` (exports `createInteractionTool`)
- Create: `src/lib/managed-agents/tools/crm/tasks.ts` (exports `createTaskTool`, `updateTaskTool`)
- Create: tests in `__tests__/interactions.test.ts` + `__tests__/tasks.test.ts`

**Reference:** `src/lib/runner/tools/crm/{interactions,tasks}.ts`.

### Step 1: Write failing tests for each tool

For each of `create_interaction`, `create_task`, `update_task`: write a test that mocks the supabase client, calls `execute` with a context object, and asserts the `.eq("client_id", CLIENT_ID)` call. Follow Task 3 step 1 template.

### Step 2: Run tests — confirm FAIL

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/interactions.test.ts src/lib/managed-agents/tools/crm/__tests__/tasks.test.ts
```

### Step 3: Port the three tools

Copy query logic verbatim. Use `context.crmConfig`. Two exports in `tasks.ts`, one in `interactions.ts`.

### Step 4: Verify tests pass, run lint + typecheck

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/interactions.test.ts src/lib/managed-agents/tools/crm/__tests__/tasks.test.ts && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 5: Commit

```bash
git add src/lib/managed-agents/tools/crm/interactions.ts src/lib/managed-agents/tools/crm/tasks.ts src/lib/managed-agents/tools/crm/__tests__/interactions.test.ts src/lib/managed-agents/tools/crm/__tests__/tasks.test.ts
git commit -m "feat(h2): port create_interaction, create_task, update_task"
```

---

## Task 6: Port CRM `delete_records` and `configure_crm`

**Goal:** Port the two destructive/schema CRM tools.

**Files:**
- Create: `src/lib/managed-agents/tools/crm/delete-records.ts` + test
- Create: `src/lib/managed-agents/tools/crm/configure-crm.ts` + test

**Reference:** `src/lib/runner/tools/crm/delete-records.ts`, `src/lib/runner/tools/crm/configure-crm.ts`.

### Step 1: Write failing tests

Same template: mock supabase, assert `.eq("client_id", CLIENT_ID)` called on delete/update chains.

### Step 2: Port the two tools

Follow the Task 3 template. Note `configure_crm` is the only CRM tool the runner registered in both "setup" and "normal" modes — D1 removed setup mode, so port the "normal" mode signature only.

### Step 3: Verify tests, lint, typecheck

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts src/lib/managed-agents/tools/crm/__tests__/configure-crm.test.ts && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/crm/delete-records.ts src/lib/managed-agents/tools/crm/configure-crm.ts src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts src/lib/managed-agents/tools/crm/__tests__/configure-crm.test.ts
git commit -m "feat(h2): port delete_records and configure_crm"
```

---

## Task 7: Port CRM attachment tools — `attach_file_to_record`, `list_record_attachments`, `delete_record_attachment`

**Goal:** Port the three attachment tools. Split the runner's `crm/attachments.ts` into three separate managed-agents files to keep each tool in its own module.

**Files:**
- Create: `src/lib/managed-agents/tools/crm/attach-file.ts` + test
- Create: `src/lib/managed-agents/tools/crm/list-attachments.ts` + test
- Create: `src/lib/managed-agents/tools/crm/delete-attachment.ts` + test

**Reference:** `src/lib/runner/tools/crm/attachments.ts`.

### Step 1: Write failing tests

For each tool: test the `.eq("client_id", CLIENT_ID)` on the attachments-table query chain. The list tool should also assert `{ success: true, attachments, count }` shape.

### Step 2: Port the three tools

Each tool becomes a standalone `ManagedAgentTool` object: `attachFileToRecordTool`, `listRecordAttachmentsTool`, `deleteRecordAttachmentTool`.

### Step 3: Verify tests, lint, typecheck

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/attach-file.test.ts src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts src/lib/managed-agents/tools/crm/__tests__/delete-attachment.test.ts && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/crm/attach-file.ts src/lib/managed-agents/tools/crm/list-attachments.ts src/lib/managed-agents/tools/crm/delete-attachment.ts src/lib/managed-agents/tools/crm/__tests__/attach-file.test.ts src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts src/lib/managed-agents/tools/crm/__tests__/delete-attachment.test.ts
git commit -m "feat(h2): port CRM attachment tools"
```

---

## Task 8: Port `manage_views` and create CRM barrel export

**Goal:** Finish the CRM slice with `manage_views` and a barrel re-export file for the CRM directory.

**Files:**
- Create: `src/lib/managed-agents/tools/crm/manage-views.ts` + test
- Create: `src/lib/managed-agents/tools/crm/index.ts`

**Reference:** `src/lib/runner/tools/crm/views.ts`.

### Step 1: Write failing test + port `manage_views`

Same template.

### Step 2: Create barrel

Create `src/lib/managed-agents/tools/crm/index.ts`:

```typescript
/**
 * CRM managed-agent tool barrel — re-exports only.
 * @module lib/managed-agents/tools/crm
 */
export { searchCrmTool } from "./search";
export { createRecordTool } from "./create-record";
export { updateRecordTool } from "./update-record";
export { linkRecordsTool } from "./link-records";
export { deleteRecordsTool } from "./delete-records";
export { createInteractionTool } from "./interactions";
export { createTaskTool, updateTaskTool } from "./tasks";
export { configureCrmTool } from "./configure-crm";
export { attachFileToRecordTool } from "./attach-file";
export { listRecordAttachmentsTool } from "./list-attachments";
export { deleteRecordAttachmentTool } from "./delete-attachment";
export { manageViewsTool } from "./manage-views";
```

### Step 3: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/crm && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

Expected: all 13 CRM tools pass their tests, the lint reports all 13 files checked with no violations.

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/crm/manage-views.ts src/lib/managed-agents/tools/crm/__tests__/manage-views.test.ts src/lib/managed-agents/tools/crm/index.ts
git commit -m "feat(h2): port manage_views and add CRM barrel"
```

---

## Task 9: Port web tools — `web_search`, `web_scrape`, `calculate_drive_time`

**Goal:** Port the three stateless web tools. These don't touch Supabase so they're shorter but still follow the same `(input, context)` shape.

**Files:**
- Create: `src/lib/managed-agents/tools/web/search.ts` + test
- Create: `src/lib/managed-agents/tools/web/scrape.ts` + test
- Create: `src/lib/managed-agents/tools/web/drive-time.ts` + test
- Create: `src/lib/managed-agents/tools/web/index.ts`

**Reference:** `src/lib/runner/tools/web/{search,scrape,drive-time}.ts`.

### Step 1: Write failing tests

Mock Exa and HTTP fetches exactly as the runner tests do. The `context` parameter is unused — tests can pass an empty context (just include `supabase`, `clientId`, `isChatContext`).

### Step 2: Port each tool

Copy logic verbatim; drop `tool()` wrapper; export as `webSearchTool`, `webScrapeTool`, `calculateDriveTimeTool`. `context` param unused (mark with `_context` if needed to satisfy the signature).

### Step 3: Create barrel

```typescript
export { webSearchTool } from "./search";
export { webScrapeTool } from "./scrape";
export { calculateDriveTimeTool } from "./drive-time";
```

### Step 4: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/web && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 5: Commit

```bash
git add src/lib/managed-agents/tools/web
git commit -m "feat(h2): port web_search, web_scrape, calculate_drive_time"
```

---

## Task 10: Port storage tools — `storage_read`, `storage_write`

**Goal:** Port the file tools. **Per plan R13, these are renamed:** `read_file` → `storage_read`, `write_file` → `storage_write`. Keep the *internal* logic and the `path` argument format identical — only the tool names change.

**Files:**
- Create: `src/lib/managed-agents/tools/storage/storage-read.ts` + test
- Create: `src/lib/managed-agents/tools/storage/storage-write.ts` + test
- Create: `src/lib/managed-agents/tools/storage/index.ts`

**Reference:** `src/lib/runner/tools/storage/index.ts` — the runner bundles both into one factory; split them into two files.

### Step 1: Write failing tests

Mock the agent-files client (`createAgentFileClient`). Assert each tool's `name` is `storage_read` / `storage_write`. Test at least one success case and one error case per tool.

### Step 2: Port

- Export `storageReadTool` (from `storage-read.ts`) and `storageWriteTool` (from `storage-write.ts`).
- `context.supabase` + `context.clientId` → `createAgentFileClient(context.supabase, context.clientId)` inside `execute`.
- Keep the `name` field as `storage_read` / `storage_write`. The description string may keep its "read_file" / "write_file" terminology internally — only the tool name that the agent sees changes.

### Step 3: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/storage && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/storage
git commit -m "feat(h2): port storage_read and storage_write"
```

---

## Task 11: Port messaging + meetings + market tools

**Goal:** Port the remaining single-file tool groups in one reviewable chunk.

**Files:**
- Create: `src/lib/managed-agents/tools/messaging/send-message.ts` + test + `index.ts`
- Create: `src/lib/managed-agents/tools/meetings/search-meetings.ts` + test + `index.ts`
- Create: `src/lib/managed-agents/tools/market/search-market-data.ts` + test + `index.ts`

**Reference:**
- `src/lib/runner/tools/utility/send-message.ts`
- `src/lib/runner/tools/meetings/search.ts`
- `src/lib/runner/tools/market/search-market-data.ts`

### Step 1: Port `send_message`

Follow the template. Touches `conversation_messages` → assert `.eq("client_id", CLIENT_ID)` (and/or `.eq("thread_id", ...)`).

### Step 2: Port `search_meetings`

Follow the template. Touches `meetings` or equivalent → assert `.eq("client_id", CLIENT_ID)`.

### Step 3: Port `search_market_data`

This one is conditional on env (`isPropertySupabaseConfigured`). The runner returns `{}` when unconfigured; here just always export the tool — the H3 dispatcher will gate inclusion at registry-build time. Keep the same `.eq("client_id", ...)` contract if applicable, or `// @tenant-neutral` if the property DB is a cross-tenant read (verify against the runner source).

### Step 4: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/messaging src/lib/managed-agents/tools/meetings src/lib/managed-agents/tools/market && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 5: Commit

```bash
git add src/lib/managed-agents/tools/messaging src/lib/managed-agents/tools/meetings src/lib/managed-agents/tools/market
git commit -m "feat(h2): port send_message, search_meetings, search_market_data"
```

---

## Task 12: Port trigger tools — `setup_trigger`, `manage_active_triggers`, `search_triggers`

**Goal:** Port the three trigger factories.

**Files:**
- Create: `src/lib/managed-agents/tools/triggers/setup-trigger.ts` + test
- Create: `src/lib/managed-agents/tools/triggers/manage-active-triggers.ts` + test
- Create: `src/lib/managed-agents/tools/triggers/search-triggers.ts` + test
- Create: `src/lib/managed-agents/tools/triggers/index.ts`

**Reference:** `src/lib/runner/tools/triggers/{setup-trigger,manage-triggers,search-triggers}.ts`.

### Step 1: Write failing tests

Mock `agent_triggers` table chains. Assert `.eq("client_id", CLIENT_ID)` on every builder. Use `context.threadId` where the runner factory uses `threadId`.

### Step 2: Port the three tools

Export `setupTriggerTool`, `manageActiveTriggersTool`, `searchTriggersTool`. The runner's `allowMutations` flag is **dropped** — H3's dispatcher handles gating instead.

### Step 3: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/triggers && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/triggers
git commit -m "feat(h2): port setup_trigger, manage_active_triggers, search_triggers"
```

---

## Task 13: Port browser tools — `browse_website`, `search_99co`, `search_propertyguru`

**Goal:** Port the three browser-automation tools. These mostly wrap Browser-Use Cloud calls.

**Files:**
- Create: `src/lib/managed-agents/tools/browser/browse-website.ts` + test
- Create: `src/lib/managed-agents/tools/browser/search-99co.ts` + test
- Create: `src/lib/managed-agents/tools/browser/search-propertyguru.ts` + test
- Create: `src/lib/managed-agents/tools/browser/index.ts`

**Reference:**
- `src/lib/runner/tools/browser/browse-website.ts`
- `src/lib/runner/tools/market/search-99co.ts`
- `src/lib/runner/tools/market/search-propertyguru.ts`

_(The runner put two of these under `market/`; the H2 tree groups them with `browser/` since they're browser automation per the plan. Keep the names unchanged.)_

### Step 1: Write failing tests

Mock Browser-Use client with `vi.mock`. Assert the tool name/description and the result shape.

### Step 2: Port each tool

The `context` parameter is mostly unused for Browser-Use calls, but `clientId` may be needed for per-tenant browser profiles. Preserve whatever the runner factory does.

### Step 3: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/browser && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/browser
git commit -m "feat(h2): port browse_website, search_99co, search_propertyguru"
```

---

## Task 14: Port utility tools — `rename_chat`, `manage_todo`, `list_todo`

**Goal:** Port the three non-SQL utility tools.

**Files:**
- Create: `src/lib/managed-agents/tools/utility/rename-chat.ts` + test
- Create: `src/lib/managed-agents/tools/utility/manage-todo.ts` + test
- Create: `src/lib/managed-agents/tools/utility/list-todo.ts` + test

**Reference:** `src/lib/runner/tools/utility/rename-chat.ts`, `src/lib/runner/tools/utility/todo.ts`.

### Step 1: Write failing tests

For `manage_todo` and `list_todo`: assert every `.from("agent_todo")` chain has `.eq("client_id", context.clientId)` AND `.eq("thread_id", context.threadId)`. For `rename_chat`: whatever table it touches (`conversation_threads`), assert the client_id filter.

### Step 2: Port the three tools

Split the runner's `todo.ts` into two separate managed-agent files. Export `renameChatTool`, `manageTodoTool`, `listTodoTool`.

### Step 3: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/utility/__tests__/rename-chat.test.ts src/lib/managed-agents/tools/utility/__tests__/manage-todo.test.ts src/lib/managed-agents/tools/utility/__tests__/list-todo.test.ts && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/utility/rename-chat.ts src/lib/managed-agents/tools/utility/manage-todo.ts src/lib/managed-agents/tools/utility/list-todo.ts src/lib/managed-agents/tools/utility/__tests__
git commit -m "feat(h2): port rename_chat, manage_todo, list_todo"
```

---

## Task 15: Port `run_sql` and `get_agent_db_schema` with `chatOnly: true`

**Goal:** Port the two SQL tools. **Both MUST set `chatOnly: true`** per D8. This is the only task that introduces the flag — no other tools use it.

**Files:**
- Create: `src/lib/managed-agents/tools/utility/run-sql.ts` + test
- Create: `src/lib/managed-agents/tools/utility/get-agent-db-schema.ts` + test
- Create: `src/lib/managed-agents/tools/utility/index.ts`  _(barrel for the whole utility folder)_

**Reference:** `src/lib/runner/tools/utility/sql.ts`.

### Step 1: Write failing tests — include chatOnly flag assertion

Test both tools:
- `expect(runSqlTool.chatOnly).toBe(true)` and `expect(getAgentDbSchemaTool.chatOnly).toBe(true)`.
- For `run_sql`: assert it calls `context.supabase.rpc("run_readonly_sql", ...)`, returns `{success: true, rows, row_count}` on success and `{success: false, error}` on validation error or rpc error.
- For `get_agent_db_schema`: assert it calls `context.supabase.rpc("get_client_accessible_schema")`.
- Reuse the existing `validateAndCleanSql` helper from the runner — import it directly, do NOT copy.

**Note:** The dispatcher (H3) is the one that auto-rejects chatOnly tools in trigger context. These tools do NOT check `context.isChatContext` themselves — they trust the dispatcher. Do not add any runtime gate here. Just set the flag.

### Step 2: Run tests — confirm FAIL

```bash
pnpm vitest run src/lib/managed-agents/tools/utility/__tests__/run-sql.test.ts src/lib/managed-agents/tools/utility/__tests__/get-agent-db-schema.test.ts
```

### Step 3: Port both tools

```typescript
// src/lib/managed-agents/tools/utility/run-sql.ts
/**
 * run_sql — chat-only SQL escape hatch. Chat adapter passes a user-auth
 * Supabase client; RLS is enforced via `run_readonly_sql` SECURITY INVOKER.
 * The dispatcher rejects this tool in trigger runs (chatOnly: true, D8).
 * @module lib/managed-agents/tools/utility/run-sql
 */
import { z } from "zod";

import { validateAndCleanSql } from "@/lib/runner/tools/utility/sql";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  query: z.string().min(1),
  purpose: z.string().min(1).optional(),
});

type RunSqlInput = z.infer<typeof inputSchema>;

export const runSqlTool: ManagedAgentTool<RunSqlInput> = {
  name: "run_sql",
  description:
    "Escape hatch for queries search_crm cannot express: multi-table JOINs, " +
    "aggregations (COUNT, SUM, AVG), GROUP BY, subqueries, date arithmetic. " +
    "Always try search_crm first. Read-only SELECT/CTE only. " +
    "Use get_agent_db_schema to inspect available tables and columns.",
  inputSchema,
  chatOnly: true,
  execute: async ({ query }, context) => {
    const { cleaned, error: validationError } = validateAndCleanSql(query);
    if (validationError) return { success: false as const, error: validationError };

    const { data, error } = await context.supabase.rpc("run_readonly_sql", {
      query_text: cleaned,
    });
    if (error) return { success: false as const, error: error.message };

    const rows = (data ?? []) as Record<string, unknown>[];
    return { success: true as const, rows, row_count: rows.length };
  },
};
```

Port `get_agent_db_schema` similarly — reference `crmConfig` from `context.crmConfig`.

### Step 4: Create the utility barrel

```typescript
// src/lib/managed-agents/tools/utility/index.ts
export { renameChatTool } from "./rename-chat";
export { manageTodoTool } from "./manage-todo";
export { listTodoTool } from "./list-todo";
export { runSqlTool } from "./run-sql";
export { getAgentDbSchemaTool } from "./get-agent-db-schema";
```

### Step 5: Verify chatOnly flag, run lint + typecheck

```bash
pnpm vitest run src/lib/managed-agents/tools/utility && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

Expected: tests pass, both chatOnly assertions green.

### Step 6: Commit

```bash
git add src/lib/managed-agents/tools/utility/run-sql.ts src/lib/managed-agents/tools/utility/get-agent-db-schema.ts src/lib/managed-agents/tools/utility/index.ts src/lib/managed-agents/tools/utility/__tests__/run-sql.test.ts src/lib/managed-agents/tools/utility/__tests__/get-agent-db-schema.test.ts
git commit -m "feat(h2): port run_sql and get_agent_db_schema with chatOnly flag"
```

---

## Task 16: Port Composio management tools (6 tools)

**Goal:** Port the six read/write tools that manage existing connections. These do NOT include `create_connection` / `reauthorize_connection` (browser-side, Task 18) or the new dispatch tools (Task 17).

**Files:**
- Create: `src/lib/managed-agents/tools/connections/list-connections.ts` + test
- Create: `src/lib/managed-agents/tools/connections/get-connection-details.ts` + test
- Create: `src/lib/managed-agents/tools/connections/search-integrations.ts` + test
- Create: `src/lib/managed-agents/tools/connections/get-integration-capabilities.ts` + test
- Create: `src/lib/managed-agents/tools/connections/manage-activated-tools.ts` + test
- Create: `src/lib/managed-agents/tools/connections/delete-connection.ts` + test

**Reference:** `src/lib/runner/tools/connections/{list-connections,get-connection-details,search-integrations,get-integration-capabilities,manage-tools,delete-connection}.ts`.

### Step 1: Write failing tests

For `list_connections` and `delete_connection`: mock `connections` table, assert `.eq("client_id", CLIENT_ID)`.
For `search_integrations` and `get_integration_capabilities`: these query Composio's catalog and don't touch Supabase — no client_id assertion, but test the Composio SDK call.
For `get_connection_details` and `manage_activated_tools_for_connections`: both touch Supabase — client_id assertion required.

### Step 2: Port each tool

Follow the Task 3 template. **Per the plan Phase 4 note:** keep the current runner tool names for now (`list_users_connections`, `create_new_connections`) — do NOT rename. Phase 4 aligns naming in a later PR. Only export objects whose `name` field matches the CURRENT runner name.

Actually, **important:** the plan says the agent-creation script in H1 uses `list_connections` and `create_connection` as the canonical names. Check `scripts/managed-agents/create-agent.ts` (shipped by H1) for the exact string. The `name` field on each tool MUST match the string in the agent's tool declaration, otherwise the dispatcher will never receive the `custom_tool_use` event for it. **Read the H1 script before choosing names.** If in doubt, match the names in the H1 agent-creation script exactly.

### Step 3: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/connections && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/connections/list-connections.ts src/lib/managed-agents/tools/connections/get-connection-details.ts src/lib/managed-agents/tools/connections/search-integrations.ts src/lib/managed-agents/tools/connections/get-integration-capabilities.ts src/lib/managed-agents/tools/connections/manage-activated-tools.ts src/lib/managed-agents/tools/connections/delete-connection.ts src/lib/managed-agents/tools/connections/__tests__
git commit -m "feat(h2): port Composio management tools"
```

---

## Task 17: Create Composio dispatch tools — `list_composio_tools`, `execute_composio_tool`

**Goal:** This is the **only task that is NOT a 1:1 port** — per D9, the MCP-based dynamic Composio tool registration is replaced with two dispatch tools. Read the plan's §Alternative Approaches table (`Hybrid (MCP for Composio, custom for rest)` row) and D9 for rationale.

**Files:**
- Create: `src/lib/managed-agents/tools/connections/list-composio-tools.ts` + test
- Create: `src/lib/managed-agents/tools/connections/execute-composio-tool.ts` + test

**Reference:**
- `src/lib/composio/client.ts` (`getComposio()` — shared Composio SDK client)
- `src/lib/composio/activated-tools.ts` — how the runner currently loads per-user Composio tools dynamically; replicates the fetching pattern
- `shared/managed-agents-client-patterns.md` §9 (in the `claude-api` skill) — the endorsement quoted in D9

### Step 1: Write failing tests

#### `listComposioToolsTest.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { listComposioToolsTool } from "../list-composio-tools";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(() => ({
    tools: {
      list: vi.fn(async () => ([
        { slug: "GMAIL_SEND_EMAIL", name: "Send Gmail", description: "Send an email" },
      ])),
    },
  })),
}));

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    clientId: "client-1",
    threadId: "t-1",
    isChatContext: true,
  };
}

describe("listComposioToolsTool", () => {
  it("exposes name and description", () => {
    expect(listComposioToolsTool.name).toBe("list_composio_tools");
    expect(listComposioToolsTool.description).toMatch(/composio|connection/i);
  });

  it("returns tools scoped to the given app and the current client", async () => {
    const result = await listComposioToolsTool.execute({ app: "gmail" }, makeContext());
    expect(result).toMatchObject({
      success: true,
      app: "gmail",
      tools: expect.any(Array),
    });
  });
});
```

#### `execute-composio-tool.test.ts`:

Same mock strategy; assert `executeComposioToolTool.execute({ app, action, input }, ctx)` calls the Composio SDK's execute/run method with the expected args and returns `{success: true, result}` or `{success: false, error}`.

### Step 2: Run tests — confirm FAIL

```bash
pnpm vitest run src/lib/managed-agents/tools/connections/__tests__/list-composio-tools.test.ts src/lib/managed-agents/tools/connections/__tests__/execute-composio-tool.test.ts
```

### Step 3: Implement both dispatch tools

#### `list-composio-tools.ts`:

```typescript
/**
 * list_composio_tools — dispatch tool: returns the list of Composio actions
 * available for the given app, scoped to the current user's connections.
 *
 * Per D9, this replaces MCP-style dynamic per-app tool registration. The agent
 * calls this tool first, picks an action, then calls execute_composio_tool
 * with the chosen action slug.
 *
 * @module lib/managed-agents/tools/connections/list-composio-tools
 */
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  app: z.string().min(1).describe(
    "The Composio app slug (e.g., 'gmail', 'googledrive', 'googlecalendar', 'notion').",
  ),
});
type ListComposioToolsInput = z.infer<typeof inputSchema>;

export const listComposioToolsTool: ManagedAgentTool<ListComposioToolsInput> = {
  name: "list_composio_tools",
  description:
    "Returns the Composio actions available for a connected app (gmail, googledrive, googlecalendar, notion, etc.). " +
    "Call this FIRST before execute_composio_tool so you know which action slug to use. " +
    "You must have an active connection to the app (via create_connection) before this returns results.",
  inputSchema,
  execute: async ({ app }, context) => {
    try {
      const composio = getComposio();
      // SDK method: tools.list or tools.get — check @composio/core typings.
      // userId is the clientId (matches connection-flow.ts pattern).
      const tools = await composio.tools.list({
        userId: context.clientId,
        toolkits: [app],
      });
      return {
        success: true as const,
        app,
        tools: tools.map((t) => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
        })),
      };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
```

> **NOTE for implementer:** Verify the exact `@composio/core` SDK method names against `src/lib/composio/activated-tools.ts` — the runner already uses these calls. Copy the same SDK method names; don't guess.

#### `execute-composio-tool.ts`:

```typescript
/**
 * execute_composio_tool — dispatch tool: executes a named Composio action
 * with a JSON input payload, scoped to the current user's connections.
 * Paired with list_composio_tools (D9).
 * @module lib/managed-agents/tools/connections/execute-composio-tool
 */
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  app: z.string().min(1),
  action: z.string().min(1).describe("The action slug returned by list_composio_tools (e.g., 'GMAIL_SEND_EMAIL')."),
  input: z.record(z.string(), z.unknown()).describe("Action-specific parameters as a JSON object."),
});
type ExecuteComposioToolInput = z.infer<typeof inputSchema>;

export const executeComposioToolTool: ManagedAgentTool<ExecuteComposioToolInput> = {
  name: "execute_composio_tool",
  description:
    "Executes a Composio action on behalf of the current user. Call list_composio_tools first to discover available actions for the app. " +
    "Returns the action's raw output on success, or an error message on failure.",
  inputSchema,
  execute: async ({ app, action, input }, context) => {
    try {
      const composio = getComposio();
      const result = await composio.tools.execute(action, {
        userId: context.clientId,
        arguments: input,
      });
      return { success: true as const, app, action, result };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
```

_(Same caveat: verify SDK method names against the existing runner code.)_

### Step 4: Update the connections barrel

Edit `src/lib/managed-agents/tools/connections/index.ts`:

```typescript
export { listConnectionsTool } from "./list-connections";
export { getConnectionDetailsTool } from "./get-connection-details";
export { searchIntegrationsTool } from "./search-integrations";
export { getIntegrationCapabilitiesTool } from "./get-integration-capabilities";
export { manageActivatedToolsForConnectionsTool } from "./manage-activated-tools";
export { deleteConnectionTool } from "./delete-connection";
export { listComposioToolsTool } from "./list-composio-tools";
export { executeComposioToolTool } from "./execute-composio-tool";
```

### Step 5: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/connections && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

Expected: new tests pass. The lint doesn't find `supabase.from()` calls in these files (they only hit Composio SDK) so they're ignored by the check.

### Step 6: Commit

```bash
git add src/lib/managed-agents/tools/connections/list-composio-tools.ts src/lib/managed-agents/tools/connections/execute-composio-tool.ts src/lib/managed-agents/tools/connections/index.ts src/lib/managed-agents/tools/connections/__tests__/list-composio-tools.test.ts src/lib/managed-agents/tools/connections/__tests__/execute-composio-tool.test.ts
git commit -m "feat(h2): add Composio dispatch tools (list_composio_tools, execute_composio_tool)"
```

---

## Task 18: Port browser-side tools — `ask_user_question`, `create_connection`, `reauthorize_connection`

**Goal:** Port the three tools that already existed as "browser-side" / UI-driven custom tools (per plan R12). These render UI widgets and expect the user to complete an action out-of-band, so their `execute` bodies mostly echo the input back as "awaiting_response".

**Files:**
- Create: `src/lib/managed-agents/tools/browser-side/ask-user-question.ts` + test
- Create: `src/lib/managed-agents/tools/browser-side/create-connection.ts` + test
- Create: `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts` + test
- Create: `src/lib/managed-agents/tools/browser-side/index.ts`

**Reference:**
- `src/lib/runner/tools/utility/ask-user-question.ts`
- `src/lib/runner/tools/connections/create-connection.ts`
- `src/lib/runner/tools/connections/reauthorize-connection.ts`

### Step 1: Write failing tests

- `ask_user_question`: stateless — test that `execute({questions: [...]})` returns `{questions, status: "awaiting_response"}` unchanged.
- `create_connection` / `reauthorize_connection`: mock `insertConnection` + `initiateOAuthFlow` (copy from runner tests). Assert result shape matches the runner's.

### Step 2: Port the three tools

For `create_connection` and `reauthorize_connection`, the runner uses `threadId` in the callback URL — pull from `context.threadId`.

### Step 3: Verify

```bash
pnpm vitest run src/lib/managed-agents/tools/browser-side && pnpm lint:tenant-filter && pnpm exec tsc --noEmit
```

### Step 4: Commit

```bash
git add src/lib/managed-agents/tools/browser-side
git commit -m "feat(h2): port ask_user_question, create_connection, reauthorize_connection"
```

---

## Task 19: Create the top-level tool registry

**Goal:** Expose a single `MANAGED_AGENT_TOOLS` record that H3's dispatcher will import. This is the contract between H2 and H3.

**Files:**
- Create: `src/lib/managed-agents/tools/index.ts`
- Create: `src/lib/managed-agents/tools/__tests__/index.test.ts`

### Step 1: Write failing test for the registry

Create `src/lib/managed-agents/tools/__tests__/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { MANAGED_AGENT_TOOLS } from "../index";

describe("MANAGED_AGENT_TOOLS registry", () => {
  it("exposes exactly the 38 tools specified by the H2 scope", () => {
    const names = Object.keys(MANAGED_AGENT_TOOLS).sort();
    // Names must match the H1 create-agent.ts script exactly.
    expect(names).toEqual([
      "ask_user_question",
      "attach_file_to_record",
      "browse_website",
      "calculate_drive_time",
      "configure_crm",
      "create_connection",
      "create_interaction",
      "create_record",
      "create_task",
      "delete_connection",
      "delete_record_attachment",
      "delete_records",
      "execute_composio_tool",
      "get_agent_db_schema",
      "get_connection_details",
      "get_integration_capabilities",
      "link_records",
      "list_composio_tools",
      "list_connections",
      "list_record_attachments",
      "list_todo",
      "manage_activated_tools_for_connections",
      "manage_active_triggers",
      "manage_todo",
      "manage_views",
      "reauthorize_connection",
      "rename_chat",
      "run_sql",
      "search_99co",
      "search_crm",
      "search_integrations",
      "search_market_data",
      "search_meetings",
      "search_propertyguru",
      "search_triggers",
      "send_message",
      "setup_trigger",
      "storage_read",
      "storage_write",
      "update_record",
      "update_task",
      "web_scrape",
      "web_search",
    ].sort());
  });

  it("sets chatOnly: true on exactly run_sql and get_agent_db_schema", () => {
    const chatOnly = Object.entries(MANAGED_AGENT_TOOLS)
      .filter(([, tool]) => tool.chatOnly === true)
      .map(([name]) => name)
      .sort();
    expect(chatOnly).toEqual(["get_agent_db_schema", "run_sql"]);
  });

  it("every tool's .name matches its registry key", () => {
    for (const [key, tool] of Object.entries(MANAGED_AGENT_TOOLS)) {
      expect(tool.name).toBe(key);
    }
  });
});
```

> **Note for implementer:** the exact count is 43 in the test above (13 CRM + 3 web + 2 storage + 1 messaging + 3 triggers + 3 browser + 1 meetings + 1 market + 5 utility + 8 connections + 3 browser-side). The plan doc says "~38" as a round count. Before running this test, confirm against the H1 `scripts/managed-agents/create-agent.ts` tool declaration and adjust the expected list to match EXACTLY. Any mismatch is a bug to fix (either in H1 or H2).

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/managed-agents/tools/__tests__/index.test.ts
```

Expected: FAIL — `MANAGED_AGENT_TOOLS` does not exist.

### Step 3: Implement the registry

Create `src/lib/managed-agents/tools/index.ts`:

```typescript
/**
 * Top-level registry of managed-agent custom tools.
 *
 * The dispatcher (H3) imports MANAGED_AGENT_TOOLS and routes incoming
 * `agent.custom_tool_use` events by name. The H1 `create-agent.ts` script
 * MUST declare the same tool names and Zod schemas (converted to JSON Schema
 * at agent-creation time) — any drift between the registry and the agent
 * declaration is a runtime bug.
 *
 * @module lib/managed-agents/tools
 */
import type { ManagedAgentTool } from "./types";

// CRM (13)
import {
  searchCrmTool,
  createRecordTool,
  updateRecordTool,
  linkRecordsTool,
  deleteRecordsTool,
  createInteractionTool,
  createTaskTool,
  updateTaskTool,
  configureCrmTool,
  attachFileToRecordTool,
  listRecordAttachmentsTool,
  deleteRecordAttachmentTool,
  manageViewsTool,
} from "./crm";

// Web (3)
import { webSearchTool, webScrapeTool, calculateDriveTimeTool } from "./web";

// Storage (2)
import { storageReadTool, storageWriteTool } from "./storage";

// Messaging (1)
import { sendMessageTool } from "./messaging";

// Triggers (3)
import { setupTriggerTool, manageActiveTriggersTool, searchTriggersTool } from "./triggers";

// Browser (3)
import { browseWebsiteTool, search99coTool, searchPropertyGuruTool } from "./browser";

// Meetings (1)
import { searchMeetingsTool } from "./meetings";

// Market (1)
import { searchMarketDataTool } from "./market";

// Utility (5)
import {
  renameChatTool,
  manageTodoTool,
  listTodoTool,
  runSqlTool,
  getAgentDbSchemaTool,
} from "./utility";

// Composio (6 management + 2 dispatch = 8)
import {
  listConnectionsTool,
  getConnectionDetailsTool,
  searchIntegrationsTool,
  getIntegrationCapabilitiesTool,
  manageActivatedToolsForConnectionsTool,
  deleteConnectionTool,
  listComposioToolsTool,
  executeComposioToolTool,
} from "./connections";

// Browser-side (3)
import {
  askUserQuestionTool,
  createConnectionTool,
  reauthorizeConnectionTool,
} from "./browser-side";

/**
 * The canonical registry. Keyed by tool name (must match `tool.name`).
 * Order alphabetical for readability.
 */
export const MANAGED_AGENT_TOOLS = {
  ask_user_question: askUserQuestionTool,
  attach_file_to_record: attachFileToRecordTool,
  browse_website: browseWebsiteTool,
  calculate_drive_time: calculateDriveTimeTool,
  configure_crm: configureCrmTool,
  create_connection: createConnectionTool,
  create_interaction: createInteractionTool,
  create_record: createRecordTool,
  create_task: createTaskTool,
  delete_connection: deleteConnectionTool,
  delete_record_attachment: deleteRecordAttachmentTool,
  delete_records: deleteRecordsTool,
  execute_composio_tool: executeComposioToolTool,
  get_agent_db_schema: getAgentDbSchemaTool,
  get_connection_details: getConnectionDetailsTool,
  get_integration_capabilities: getIntegrationCapabilitiesTool,
  link_records: linkRecordsTool,
  list_composio_tools: listComposioToolsTool,
  list_connections: listConnectionsTool,
  list_record_attachments: listRecordAttachmentsTool,
  list_todo: listTodoTool,
  manage_activated_tools_for_connections: manageActivatedToolsForConnectionsTool,
  manage_active_triggers: manageActiveTriggersTool,
  manage_todo: manageTodoTool,
  manage_views: manageViewsTool,
  reauthorize_connection: reauthorizeConnectionTool,
  rename_chat: renameChatTool,
  run_sql: runSqlTool,
  search_99co: search99coTool,
  search_crm: searchCrmTool,
  search_integrations: searchIntegrationsTool,
  search_market_data: searchMarketDataTool,
  search_meetings: searchMeetingsTool,
  search_propertyguru: searchPropertyGuruTool,
  search_triggers: searchTriggersTool,
  send_message: sendMessageTool,
  setup_trigger: setupTriggerTool,
  storage_read: storageReadTool,
  storage_write: storageWriteTool,
  update_record: updateRecordTool,
  update_task: updateTaskTool,
  web_scrape: webScrapeTool,
  web_search: webSearchTool,
} as const satisfies Record<string, ManagedAgentTool<unknown, unknown>>;

export type ManagedAgentToolName = keyof typeof MANAGED_AGENT_TOOLS;

export type { ManagedAgentTool, ToolContext, ToolResult } from "./types";
```

### Step 4: Run the registry test

```bash
pnpm vitest run src/lib/managed-agents/tools/__tests__/index.test.ts
```

Expected: ALL PASS. If the count/list mismatches the H1 agent-creation script, **stop and reconcile**: the contract is that every tool in `MANAGED_AGENT_TOOLS` has a matching declaration in the H1 script, and vice versa. Fix H2 first; escalate to the H1 owner if H1 is wrong.

### Step 5: Verify

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm lint:tenant-filter && pnpm lint
```

Expected: full repo green.

### Step 6: Commit

```bash
git add src/lib/managed-agents/tools/index.ts src/lib/managed-agents/tools/__tests__/index.test.ts
git commit -m "feat(h2): add MANAGED_AGENT_TOOLS registry"
```

---

## Task 20: Final gate — full lint, typecheck, test run

**Goal:** Run every quality gate on the full H2 surface and confirm zero production code imports the new directory.

### Step 1: Run all quality gates

```bash
pnpm exec tsc --noEmit && pnpm test && pnpm lint && pnpm lint:tenant-filter
```

Expected: ALL PASS.

### Step 2: Verify no production path imports the new directory

```bash
pnpm exec grep -rn "from \"@/lib/managed-agents/tools" --include="*.ts" --include="*.tsx" src app scripts -l | grep -v "src/lib/managed-agents/" || echo "OK: no outside importers"
```

Expected: `OK: no outside importers` (or empty). If anything shows up, something wired the new registry in prematurely — remove it. H3/H4 is responsible for the wiring.

### Step 3: Verify the legacy runner is still intact

```bash
pnpm exec ls src/lib/runner/tools/crm/search.ts src/lib/runner/tool-registry.ts && echo "OK: legacy runner untouched"
```

Expected: both files exist.

### Step 4: Verify the lint covers the whole new tree

```bash
pnpm lint:tenant-filter
```

Expected: `✓ lint-tool-tenant-filter: N file(s) checked, no violations.` where N is the full count of tool files in `src/lib/managed-agents/tools/` (~43 implementation files excluding tests + barrels).

### Step 5: Verify chatOnly is set on exactly two tools

```bash
pnpm exec grep -rn "chatOnly: true" src/lib/managed-agents/tools
```

Expected: exactly two matches — in `run-sql.ts` and `get-agent-db-schema.ts`.

### Step 6: Commit any trailing cleanups (if needed)

If everything is green, there should be nothing to commit — H2 is complete. If any formatting/lint fixes surfaced, commit them now with `chore(h2): final gate cleanup`.

---

## Exit criteria (re-check before handing off to H3)

- [ ] `src/lib/managed-agents/tools/*` contains all ~43 tool files (38 per the plan's round count; exact number must match H1 agent-creation script)
- [ ] Every tool has a unit test that asserts the explicit `.eq("client_id", ...)` filter (except the handful that legitimately don't touch Supabase — web, browser-use, Composio dispatch, ask_user_question)
- [ ] `pnpm lint:tenant-filter` passes and is wired into `package.json` scripts
- [ ] CI lint tests (`scripts/__tests__/lint-tool-tenant-filter.test.ts`) pass — both the "good tool" accept case and the "bad tool" reject case
- [ ] `chatOnly: true` is set on exactly `run_sql` and `get_agent_db_schema`. No other tools have the flag.
- [ ] `list_composio_tools` and `execute_composio_tool` dispatch tools exist and both hit `getComposio()` directly — not MCP.
- [ ] `MANAGED_AGENT_TOOLS` registry exports every ported tool, keyed by name. Registry test asserts the full set and the chatOnly set.
- [ ] `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm lint:tenant-filter` all pass.
- [ ] Legacy runner in `src/lib/runner/tools/*` is untouched. Legacy `src/lib/runner/tool-registry.ts` still compiles and is still the live path through `src/lib/runner/run-agent.ts`.
- [ ] No file outside `src/lib/managed-agents/tools/*` imports from `@/lib/managed-agents/tools/*` yet.

When all boxes are checked, H2 is shippable as a standalone PR. H3 builds the adapter + dispatcher against the contracts in `types.ts` and `index.ts`.
