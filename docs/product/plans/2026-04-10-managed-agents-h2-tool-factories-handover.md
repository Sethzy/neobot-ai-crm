# Handover H2: Managed Agents Migration — Custom Tool Factories

## Your job

Generate **one TDD tasklist** that covers the "custom tool factories" slice of the Managed Agents migration. Follow the tasklist generation rule already in your memory (`feedback_tasklist_generation_rule.md`). Save the output to:

```
docs/product/tasks/2026-04-10-managed-agents-h2-tool-factories-tasklist.md
```

Do NOT implement the code yourself. Your output is the tasklist. Someone else executes it.

## Big picture (30 seconds)

Sunder is migrating its custom AI agent runner to Anthropic Managed Agents. Per decision **D9**, all 38 Sunder tools will be exposed as **custom tools** (not MCP tools) executed by the chat adapter. The reason: the chat adapter has the user's authenticated Supabase session via cookies, which preserves Postgres RLS for every tool call. An MCP server would only have a JWT Sunder made up and service role, losing RLS on the chat path.

You are **H2**. Your job is to port all 38 tool factories from `src/lib/runner/tools/*` to `src/lib/managed-agents/tools/*` in a new location, with unit tests, WITHOUT wiring them into anything yet. The legacy runner keeps using the originals; your new code is dead code until H3 and H4 wire it up. H1 must be merged before you ship.

## Files to read first (in order)

1. **Plan doc:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md` — full plan. Focus on:
   - Phase 1 "Custom tool factories" tasks
   - Decision Log D8 and D9
   - Alternative Approaches Considered (understand why MCP was rejected)
2. **Tasklist example (format reference):** `docs/product/tasks/2026-03-28-vercel-sandbox-bash-tool-migration-tdd-tasklist.md` — study the header, Relevant Files section, and per-task Step 1-5 structure.
3. **Existing tool factories (your reference material — you're porting these):**
   - `src/lib/runner/tool-registry.ts` — the current `createRunnerTools()` that wires everything together
   - `src/lib/runner/tools/crm/` — all CRM tool factories. Read `search.ts` carefully to understand the explicit `.eq("client_id", clientId)` filter pattern
   - `src/lib/runner/tools/web/`
   - `src/lib/runner/tools/storage/` (renamed from read_file/write_file)
   - `src/lib/runner/tools/meetings/`
   - `src/lib/runner/tools/triggers/`
   - `src/lib/runner/tools/market/`
   - `src/lib/runner/tools/utility/` — including `sql.ts` (`run_sql` + `get_agent_db_schema`) and `todo.ts`
   - `src/lib/runner/tools/listing/` (browser automation)
   - `src/lib/runner/tools/connections/` (Composio — this one gets a major rewrite per D9)
4. **CI lint reference:** look at existing AST checks if any. You'll write a new one using ts-morph or similar.
5. **claude-api skill:** run `/claude-api` and load relevant files if needed for custom tool shape. The key reference is `shared/managed-agents-tools.md` §Custom Tools — shows the tool schema (name, description, input_schema) that the Anthropic agent will see.

## Your scope

One big thing: port every tool factory from `src/lib/runner/tools/*` to `src/lib/managed-agents/tools/*`, adapted for the custom-tool dispatch pattern.

### What changes in the port

**Current shape (src/lib/runner/tools/crm/search.ts):**
```typescript
import { tool } from "ai";  // Vercel AI SDK
export function createCrmSearchTool(supabase, clientId, config) {
  return tool({
    description: "...",
    inputSchema: z.object({...}),
    execute: async ({entity, filters, ...}) => {
      // uses supabase.from().eq("client_id", clientId)
      return { success: true, records, count };
    },
  });
}
```

**New shape (src/lib/managed-agents/tools/crm/search.ts):**
```typescript
// No "ai" package dependency — custom tools are plain dispatchers
export const searchCrmTool = {
  name: "search_crm",
  description: "...",
  inputSchema: z.object({...}),  // still Zod — the dispatcher converts to JSON Schema at agent creation
  chatOnly: false,  // default; only run_sql and get_agent_db_schema set true
  execute: async (
    input: z.infer<typeof inputSchema>,
    context: { supabase: SupabaseClient; clientId: string; threadId?: string },
  ) => {
    // Same exact Supabase queries with same explicit .eq("client_id", context.clientId) filters
    return { success: true, records, count };
  },
};
```

The execute signature takes a `context` parameter so the dispatcher can inject different Supabase clients: user-authenticated for chat, service-role for triggers.

### Tools to port (38 total — check the plan doc Phase 1 list for the canonical set)

- **CRM (13):** `search_crm`, `create_record`, `update_record`, `delete_records`, `link_records`, `create_interaction`, `create_task`, `update_task`, `configure_crm`, `attach_file_to_record`, `list_record_attachments`, `delete_record_attachment`, `manage_views`
- **Search (3):** `web_search`, `web_scrape`, `calculate_drive_time`
- **Storage (2):** `storage_read`, `storage_write` (renamed from `read_file`/`write_file` — see plan R13)
- **Messaging (1):** `send_message`
- **Triggers (3):** `setup_trigger`, `manage_active_triggers`, `search_triggers`
- **Browser (3):** `browse_website`, `search_99co`, `search_propertyguru`
- **Meetings (1):** `search_meetings`
- **Market (1):** `search_market_data` (conditional on env)
- **Utility (5):** `rename_chat`, `manage_todo`, `list_todo`, `run_sql`, `get_agent_db_schema`
- **Composio management (6):** `list_connections`, `get_details_for_connections`, `search_integrations`, `get_integration_capabilities`, `manage_activated_tools_for_connections`, `delete_connection`
- **Composio dispatch (2, NEW — per D9):** `list_composio_tools(app)` + `execute_composio_tool(app, action, input)` — these REPLACE dynamic MCP-based Composio tool registration with two dispatch tools that call the Composio SDK directly
- **Browser-side custom tools (3):** `ask_user_question`, `create_connection`, `reauthorize_connection` — these already existed as custom tools (R12), just port them

### chatOnly flag

Set `chatOnly: true` on exactly two tools:
- `run_sql`
- `get_agent_db_schema`

**Why:** these require user auth context (RLS) that only exists in the chat adapter path, not in the trigger polling cron. Per D8, the dispatcher in trigger context will auto-reject them with `{success: false, error: "Tool not available in trigger runs."}`. You're just setting the flag here; the dispatcher enforcement is H3's job.

### Tenant isolation is the key invariant

Every tool that touches Supabase MUST have an explicit `.eq("client_id", context.clientId)` filter. This is the PRIMARY defense — RLS is a safety net for chat path only.

**Context from the plan:**
> 38 occurrences across 13 files already enforce tenant isolation in tool code

Preserve this pattern exactly. Don't refactor or "improve" it. Every `.from()` chain on a tenant-scoped table must have the filter.

### CI lint — AST check for explicit filter

Create a lint script: `scripts/lint-tool-tenant-filter.ts`. It should:
- Walk every `.ts` file under `src/lib/managed-agents/tools/`
- For each `.from("<table>")` call, verify the same call chain includes `.eq("client_id", ...)` or has an explicit allowlist annotation (e.g., a `// @tenant-neutral` comment)
- Fail with a clear error listing offenders if any tool is missing the filter
- Run it as `pnpm lint:tenant-filter` — wire into the CI pipeline

Write tests for the lint script itself with fixture tool files (good + bad examples).

### Unit tests per tool

Each tool factory gets a unit test that:
1. Mocks the Supabase client (can use existing `src/test/mocks/supabase.ts` if compatible)
2. Calls the tool's `execute` function with test input + a context object
3. Asserts that the Supabase mock received a query with `.eq("client_id", "test-client-id")`
4. Asserts the result shape matches `{success: true, ...}` or `{success: false, error}`
5. For tools with filtering logic (e.g., `search_crm`), test a few filter combinations

**Test both contexts for chatOnly tools:**
- `run_sql` with context.isChatContext: true → normal execution
- `run_sql` with context.isChatContext: false → returns `{success: false, error: "Tool not available in trigger runs."}`

(Or similar — use whatever context-passing pattern your dispatcher will use. Just document it so H3 can build a compatible dispatcher.)

## Entry state (assume after H1)

- Schema migration merged: `runs.session_id`, `conversation_threads.session_id`, etc.
- Data migration run: existing clients have `client_profile` / `user_preferences` populated
- Agent + environment created in Anthropic: `ANTHROPIC_AGENT_ID`, `ANTHROPIC_AGENT_VERSION`, `ANTHROPIC_ENVIRONMENT_ID` are in env
- `src/lib/memory/` deleted
- `crmMode` fully removed
- Legacy runner still handles production traffic

## Exit state

- `src/lib/managed-agents/tools/*` exists with all 38 tools ported
- Every tool has a unit test verifying the explicit client_id filter
- CI lint (`pnpm lint:tenant-filter`) passes on the new tool directory and catches a fixture bad example
- `chatOnly: true` flag set on `run_sql` and `get_agent_db_schema`
- `list_composio_tools` + `execute_composio_tool` dispatch tools replace the old dynamic Composio tool loading
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:tenant-filter` all pass
- Legacy runner still uses `src/lib/runner/tools/*` unchanged — you do NOT delete the originals
- No code in the production chat or trigger path imports from `src/lib/managed-agents/tools/*` yet

## Key decisions that apply to your scope

- **D8** — `run_sql` and `get_agent_db_schema` are custom tools, chat-only. The `chatOnly: true` flag is your contract with H3's dispatcher.
- **D9** — All tools are custom tools. This is WHY you're porting everything to the new location. The architecture rationale is in the decision log and `shared/managed-agents-client-patterns.md` §9.

Composio specifics (per D9): instead of registering dynamic per-user Gmail/Drive/Calendar tools with the agent (which would require MCP dynamic registration), expose TWO dispatch tools:
- `list_composio_tools(app)` — returns available actions for the given app (e.g., "gmail", "gdrive", "gcal") for the current user
- `execute_composio_tool(app, action, input)` — executes the action via the Composio SDK

The agent's system prompt (already migrated in H1) should guide the model to call `list_composio_tools` before `execute_composio_tool` the first time it uses a new app. You don't need to update the system prompt here — just ensure these dispatch tools exist and are testable.

## Gotchas / non-negotiables

- **Do NOT delete the original `src/lib/runner/tools/*` files.** The legacy runner is still live. H4 deletes them in the cutover PR.
- **Do NOT wire the new tools into the adapter or dispatcher.** Those don't exist yet (H3 builds them).
- **Do NOT change the tool input schemas or behavior.** Same Zod schemas, same Supabase queries, same result shapes. This is a port, not a refactor. Any "improvement" is scope creep.
- **Every `.from()` MUST have an explicit `.eq("client_id", context.clientId)` filter.** This is the primary defense layer. The CI lint enforces it.
- **`chatOnly: true` on `run_sql` and `get_agent_db_schema` only.** No other tools get this flag.
- **Composio becomes two dispatch tools, not N per-app tools.** Don't try to port `gmail_send`, `gcal_create`, etc. as individual tools.
- **`execute` signature is `(input, context)`**, not `(input)`. This is different from the Vercel AI SDK shape. The context is how the dispatcher injects the right Supabase client.
- **Write your own minimal type for the tool shape** — don't depend on `@anthropic-ai/sdk` types yet (the dispatcher in H3 will handle Anthropic-side conversion). Something like:
  ```typescript
  export interface ManagedAgentTool<TInput, TOutput> {
    name: string;
    description: string;
    inputSchema: z.ZodType<TInput>;
    chatOnly?: boolean;
    execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
  }
  export interface ToolContext {
    supabase: SupabaseClient<Database>;
    clientId: string;
    threadId?: string;
    isChatContext: boolean;  // used by dispatcher to reject chatOnly in trigger mode
  }
  ```
- **Composio session caching stays out of scope for v1.** Just call `composio.create(clientId)` inline in the dispatch tool; Redis caching is a future optimization.
- **Create a tool registry/manifest:** `src/lib/managed-agents/tools/index.ts` should export a `MANAGED_AGENT_TOOLS` array or record. This is what the H3 dispatcher imports.

## Output format reminder

Follow the tasklist generation rule in memory. Structure:

```markdown
# Managed Agents Migration — H2 Custom Tool Factories

**Goal:** [one sentence]

**Architecture:** [2-3 sentences referencing D8, D9, RLS, explicit filters]

**Tech Stack:** [Zod, Vitest, ts-morph for lint, Supabase, Composio SDK]

## Relevant Files

### Create
- `src/lib/managed-agents/tools/types.ts` — ManagedAgentTool interface
- `src/lib/managed-agents/tools/crm/search.ts`
- ... (one per tool)
- `src/lib/managed-agents/tools/index.ts` — registry export
- `scripts/lint-tool-tenant-filter.ts`
- Unit test files for each

### Reference only
- `src/lib/runner/tools/*` — read-only reference for porting

---

## Task 1: Define ManagedAgentTool interface
...

## Task 2: Port search_crm tool
...

## Task 3: Port create_record tool
...
```

Group tasks logically. You can bundle "all CRM tools" as one task with sub-steps per tool, or break per-tool. Use your judgment — aim for reviewable chunks.

Each bite-sized step must be 2-5 minutes of actual work. Write the full test and implementation inline. Don't leave placeholders.

Commit messages should use `feat(h2):`, `chore(h2):`, `refactor(h2):`.

## Scale estimate

- ~38 tool files to create in `src/lib/managed-agents/tools/*`
- ~38 unit test files
- 1 lint script + test
- 1 registry index
- 1 types file
- Total: ~80 files, ~1200 LOC

The tasklist will have many tasks. That's OK — each per-tool task is small and follows the same template, so the tasklist can use a DRY structure (e.g., "Task N: Port <tool> — follow the template in Task X").

## One last thing

When you've generated the tasklist, end your response with:

> "Tasklist complete and saved to `docs/product/tasks/2026-04-10-managed-agents-h2-tool-factories-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint."

Then stop. Do not start implementing.
