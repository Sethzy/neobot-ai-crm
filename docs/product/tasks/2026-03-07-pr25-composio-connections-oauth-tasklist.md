# PR 25: Composio Connections + OAuth (Rewritten)

**PR:** PR 25: Composio connections + OAuth
**Decisions:** CONN-01, CONN-02, CONN-03
**Goal:** Enable persistent OAuth connections to external services via Composio, with a `connections` table, `@composio/vercel` SDK integration, and connection-first agent behavior.

**Integration Pattern:** Direct (`composio.tools.get()`) with `@composio/vercel` VercelProvider. NOT Session/MCP (`composio.create()`). See `roadmap docs/Sunder - Source of Truth/references/composio-vercel-ai-sdk/09-integration-recommendation.md` for full rationale.

**Key Decisions:**
- Direct pattern fits our existing runner tool assembly (`createRunnerTools()` → `streamText()`)
- No custom connection management tools — Composio tools are loaded automatically based on DB state
- OAuth is user-initiated from settings page, not agent-initiated in chat
- Use `authConfigs.list/create()` + `connectedAccounts.link()` so we control `callbackUrl` and avoid `toolkits.authorize()` duplicate-creation behavior
- Our `connections` table is the source of truth for system-reminder (not Composio API)
- `clientId` maps 1:1 to Composio's `userId`

**Tech Stack:** `@composio/core` + `@composio/vercel`, Supabase (Postgres + RLS), Next.js API routes, Zod

---

## Relevant Files

### Create
- `supabase/migrations/YYYYMMDDHHMMSS_create_connections.sql` — connections table + RLS + indexes + system-reminder RPC update
- `src/lib/composio/client.ts` — Composio singleton with VercelProvider
- `src/lib/composio/tools.ts` — `loadComposioTools()` function
- `src/lib/composio/index.ts` — barrel export
- `src/lib/composio/__tests__/client.test.ts`
- `src/lib/composio/__tests__/tools.test.ts`
- `src/lib/connections/schemas.ts` — Zod schemas for connections table
- `src/lib/connections/queries.ts` — Supabase CRUD for connections table
- `src/lib/connections/__tests__/schemas.test.ts`
- `src/lib/connections/__tests__/queries.test.ts`
- `app/api/connections/initiate/route.ts` — OAuth initiate endpoint
- `app/api/connections/callback/route.ts` — OAuth callback handler
- `app/api/connections/initiate/__tests__/route.test.ts`
- `app/api/connections/callback/__tests__/route.test.ts`

### Modify
- `package.json` — add `@composio/core`, `@composio/vercel`
- `src/types/database.ts` — regenerate with connections table
- `src/lib/runner/tools/index.ts` — no change (Composio tools are loaded separately, not via tool factory)
- `src/lib/runner/run-agent.ts` — wire `loadComposioTools()` output into `streamText()` tools
- `src/lib/runner/system-reminder.ts` — add `active_connection_toolkits` to context schema
- `src/lib/ai/system-prompt.ts` — add `<connections>` instructions section

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Steps:**
1. Install `@composio/core` and `@composio/vercel`
2. Verify peer dependency compatibility (`ai@^5.0.0 || ^6.0.0` — we use `ai@^6.0.111`)
3. Add `COMPOSIO_API_KEY` to `.env.example` (or equivalent)

**Acceptance:**
- `@composio/core` and `@composio/vercel` in `dependencies`
- No peer dependency warnings
- `pnpm install` succeeds

---

## Task 2: Migration — `connections` Table + System-Reminder RPC Update

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_connections.sql`
- Reference: `supabase/migrations/20260306010000_create_agent_triggers.sql` (pattern)
- Reference: `supabase/migrations/20260306040001_add_active_trigger_count_to_system_reminder.sql` (RPC update pattern)

**Step 1: Design the connections table**

The table stores connection metadata for system-reminder and RLS. Composio manages actual OAuth tokens.

```sql
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,

  -- Composio's connected account ID
  composio_connected_account_id text not null unique,

  -- Composio toolkit slug (e.g. 'gmail', 'googlecalendar')
  toolkit_slug text not null,

  -- Human-readable toolkit label for the system reminder
  display_name text,

  -- Connection state used by runner gating
  status text not null default 'active' check (status in ('active', 'inactive', 'error')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint connections_client_toolkit_unique unique (client_id, toolkit_slug)
);
```

**Step 2: Add RLS policies**

```sql
alter table public.connections enable row level security;

create policy "connections_select" on public.connections
  for select using (client_id = public.get_my_client_id());

create policy "connections_insert" on public.connections
  for insert with check (client_id = public.get_my_client_id());

create policy "connections_update" on public.connections
  for update using (client_id = public.get_my_client_id())
  with check (client_id = public.get_my_client_id());

create policy "connections_delete" on public.connections
  for delete using (client_id = public.get_my_client_id());
```

**Step 3: Add indexes**

```sql
create index idx_connections_client_id on public.connections(client_id);
```

**Step 4: Add updated_at trigger**

```sql
create or replace function public.update_connections_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_connections_updated_at
  before update on public.connections
  for each row execute function public.update_connections_updated_at();
```

**Step 5: Update `get_system_reminder_context` RPC with named active connections**

Follow the pattern from `20260306040001_add_active_trigger_count_to_system_reminder.sql`. Add `active_connection_toolkits` to the RPC return:

```sql
-- Add to the existing RPC's SELECT:
'active_connection_toolkits', (
  select coalesce(jsonb_agg(conn.toolkit_slug order by conn.toolkit_slug), '[]'::jsonb)
  from public.connections as conn
  where conn.client_id = p_client_id
    and conn.status = 'active'
)
```

**Acceptance:**
- Migration applies cleanly
- RLS blocks cross-client access
- Unique constraint on `(client_id, toolkit_slug)` prevents duplicate rows in our DB
- `get_system_reminder_context` returns `active_connection_toolkits`

---

## Task 3: Zod Schemas for Connections

**Files:**
- Create: `src/lib/connections/schemas.ts`
- Create: `src/lib/connections/__tests__/schemas.test.ts`
- Reference: `src/lib/triggers/schemas.ts` (pattern)

**Schemas to define:**

```typescript
// connectionRowSchema — matches DB row shape
// connectionInsertSchema — for inserting new connections (omit id, timestamps)
// connectionUpdateSchema — for updating connections (all optional except id)
```

Fields: `id`, `client_id`, `composio_connected_account_id`, `toolkit_slug`, `display_name`, `status` (enum: active/inactive/error), `created_at`, `updated_at`.

**TDD:** Write tests first. Validate happy path, status enum validation, non-null connected account ID.

**Acceptance:**
- All schemas export correctly
- Tests pass for valid/invalid data
- Status enum rejects unknown values

---

## Task 4: CRUD Queries for Connections

**Files:**
- Create: `src/lib/connections/queries.ts`
- Create: `src/lib/connections/__tests__/queries.test.ts`
- Reference: `src/lib/triggers/scanner.ts` (Supabase query pattern)

**Functions:**

```typescript
/** Get all active connections for a client */
export async function getActiveConnections(supabase: SupabaseClient, clientId: string): Promise<ConnectionRow[]>

/** Get one active connection for a client/toolkit pair (used by initiate route reuse-first guard) */
export async function getActiveConnectionByToolkit(
  supabase: SupabaseClient,
  clientId: string,
  toolkitSlug: string,
): Promise<ConnectionRow | null>

/** Get active toolkit slugs for a client (used by loadComposioTools) */
export async function getActiveToolkitSlugs(supabase: SupabaseClient, clientId: string): Promise<string[]>

/** Upsert a connection (used by OAuth callback) */
export async function upsertConnection(supabase: SupabaseClient, data: ConnectionInsert): Promise<ConnectionRow>
```

**TDD:** Write tests first using mock Supabase client pattern from existing tests.

**Acceptance:**
- All CRUD operations work with proper RLS context
- `getActiveConnectionByToolkit` supports reuse-first OAuth initiation
- `getActiveToolkitSlugs` returns string array of toolkit slugs
- Upsert uses ON CONFLICT on `(client_id, toolkit_slug)`

---

## Task 5: Composio Client Singleton

**Files:**
- Create: `src/lib/composio/client.ts`
- Create: `src/lib/composio/__tests__/client.test.ts`
- Reference: `roadmap docs/Sunder - Source of Truth/references/composio-vercel-ai-sdk/09-integration-recommendation.md` §3

**Implementation — follow official pattern exactly:**

```typescript
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

let _composio: Composio<VercelProvider> | null = null;

export function getComposio(): Composio<VercelProvider> {
  if (!_composio) {
    const apiKey = process.env.COMPOSIO_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Missing COMPOSIO_API_KEY.");
    }

    _composio = new Composio({
      apiKey,
      provider: new VercelProvider(),
      allowTracking: false,
    });
  }
  return _composio;
}
```

**TDD:** Test that:
- Returns same instance on repeated calls (singleton)
- Returns instance with VercelProvider
- Throws when `COMPOSIO_API_KEY` is missing so route handlers fail loudly on server misconfiguration

**Acceptance:**
- Singleton pattern works
- No tracking enabled
- Uses VercelProvider (agentic provider with built-in execute)
- Missing API key fails fast at the singleton boundary

---

## Task 6: `loadComposioTools()` Function

**Files:**
- Create: `src/lib/composio/tools.ts`
- Create: `src/lib/composio/__tests__/tools.test.ts`
- Reference: `roadmap docs/Sunder - Source of Truth/references/composio-vercel-ai-sdk/09-integration-recommendation.md` §4

**Implementation — follow official pattern:**

```typescript
import type { ToolSet } from "ai";
import { getComposio } from "./client";

/**
 * Loads Composio tools for active connections.
 * Returns empty object if no connections, no API key, or on error.
 */
export async function loadComposioTools(
  composioUserId: string,
  activeToolkits: string[],
): Promise<ToolSet> {
  if (!process.env.COMPOSIO_API_KEY || activeToolkits.length === 0) {
    return {};
  }

  try {
    const composio = getComposio();
    return await composio.tools.get(composioUserId, {
      toolkits: activeToolkits,
    });
  } catch (error) {
    console.error("[composio] Failed to load tools:", error);
    return {}; // Graceful fallback — run continues without external tools
  }
}
```

**TDD:** Test that:
- Returns `{}` when `COMPOSIO_API_KEY` is unset
- Returns `{}` when `activeToolkits` is empty
- Returns `{}` on Composio API error (graceful fallback)
- Calls `composio.tools.get()` with correct userId and toolkits (mock)

**Acceptance:**
- Never throws — always returns `ToolSet` (empty or populated)
- Graceful fallback on tool-loading errors
- `getComposio()` remains the strict env guard; `loadComposioTools()` is the only graceful-fallback layer

---

## Task 7: Barrel Export

**Files:**
- Create: `src/lib/composio/index.ts`

**Implementation:**

```typescript
export { getComposio } from "./client";
export { loadComposioTools } from "./tools";
```

Trivial — no test needed.

---

## Task 8: Wire Composio Tools into Runner

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`
- Reference: `src/lib/runner/tools/index.ts` (existing tool assembly)

**Changes to `runAgent()` or `createRunnerTools()`:**

```typescript
// In the tool assembly section of runAgent():
import { loadComposioTools } from "@/lib/composio";
import { getActiveToolkitSlugs } from "@/lib/connections/queries";

// ... existing tool creation ...
const activeToolkits = await getActiveToolkitSlugs(supabase, clientId);
const composioTools = await loadComposioTools(clientId, activeToolkits);

const streamResult = streamText({
  model: gateway(modelId),
  system,
  messages,
  tools: { ...runnerTools, ...composioTools },
  // ...
});
```

**Key design:** Composio tools are spread alongside existing runner tools. They're loaded per-run based on DB state, not hardcoded.

Wrap the connections lookup + Composio load in a local fallback so transient `connections` table issues do not fail the entire run:

```typescript
let composioTools: ToolSet = {};

try {
  const activeToolkits = await getActiveToolkitSlugs(supabase, clientId);
  composioTools = await loadComposioTools(clientId, activeToolkits);
} catch (error) {
  console.error("[composio] Failed to resolve active connections for runner.", error);
}
```

If TypeScript needs it, widen the local `tools` type with `ToolSet` rather than changing the existing `createRunnerTools()` API.

**TDD:** Test that:
- Runner includes Composio tools when active connections exist
- Runner works normally when no connections exist (empty object spread)
- Composio tool loading failure doesn't break the run

**Acceptance:**
- Composio tools appear in `streamText()` tools alongside existing tools
- No regression on existing tool behavior

---

## Task 9: System-Reminder — named active connections

**Files:**
- Modify: `src/lib/runner/system-reminder.ts`
- Modify: `src/lib/runner/__tests__/system-reminder.test.ts`
- Reference: existing `active_trigger_count` pattern

**Changes:**

1. Add `active_connection_toolkits` to `systemReminderContextSchema`:
   ```typescript
   active_connection_toolkits: z.array(z.string()),
   ```

2. Render one line inside the existing `<system-reminder>` block:
   ```text
   Active connections: gmail, googlecalendar
   ```
   If none are active:
   ```text
   Active connections: none
   ```

**TDD:** Add test cases for populated and empty active connection lists.

**Acceptance:**
- System-reminder shows a deterministic `Active connections:` line
- Schema validates the new field
- Existing tests still pass

---

## Task 10: System Prompt — Connection Instructions

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/ai/__tests__/system-prompt.test.ts`

**Add a `<connections>` section to the system prompt:**

```xml
<connections>
Before using any external service tool (Gmail, Calendar, Slack, etc.), check the "Active connections:" line in your system reminder.
- If the needed service is connected: proceed with the tool call.
- If the needed service is NOT connected: tell the user to connect it in Settings. Do NOT attempt to use tools for unconnected services.
- Never try to create or manage connections yourself — connections are managed by the user in Settings.
</connections>
```

**TDD:** Test that system prompt includes `<connections>` section.

**Acceptance:**
- System prompt includes connection-first instructions
- Agent knows to check connections before using external tools
- Agent directs user to Settings for connection management

---

## Task 11: OAuth Initiate API Route

**Files:**
- Create: `app/api/connections/initiate/route.ts`
- Create: `app/api/connections/initiate/__tests__/route.test.ts`

**Endpoint:** `POST /api/connections/initiate`

**Request body:**
```typescript
{ toolkit: string } // e.g. "gmail"
```

**Flow:**
1. Authenticate user with existing Supabase server-route patterns
2. Resolve `clientId` from session
3. Check for an existing active DB connection for the toolkit; if one exists, return `409`
4. Resolve an auth config for the toolkit:
   - `composio.authConfigs.list({ toolkit, isComposioManaged: true })`
   - Reuse the first `ENABLED` config only
   - If none exists, create one with managed auth
5. Build an explicit callback URL pointing to `/api/connections/callback`
6. Call `composio.connectedAccounts.link(clientId, authConfigId, { callbackUrl })`
7. Return `{ redirectUrl }` to frontend

**Implementation — use `connectedAccounts.link()` for callback control:**

```typescript
const existingConnection = await getActiveConnectionByToolkit(supabase, clientId, toolkit);
if (existingConnection) {
  return jsonError("Service already connected.", 409);
}

const authConfigs = await composio.authConfigs.list({
  toolkit,
  isComposioManaged: true,
});
const reusableAuthConfig = authConfigs.items.find((authConfig) => authConfig.status === "ENABLED");
const authConfigId = reusableAuthConfig?.id
  ?? (await composio.authConfigs.create(toolkit, {
    type: "use_composio_managed_auth",
    name: `${toolkit} Auth Config`,
  })).id;

const callbackUrl = new URL("/api/connections/callback", request.url).toString();
const connectionRequest = await composio.connectedAccounts.link(clientId, authConfigId, {
  callbackUrl,
});
return NextResponse.json({ redirectUrl: connectionRequest.redirectUrl });
```

**TDD:** Test that:
- Returns 401 if unauthenticated
- Returns 409 when the toolkit is already connected
- Returns redirect URL for valid toolkit
- Creates an auth config when one does not already exist
- Handles Composio API errors gracefully

**Acceptance:**
- Returns `{ redirectUrl }` that frontend can open in popup/redirect
- Enforces reuse-first behavior before creating a new OAuth link
- Authenticated and RLS-scoped

---

## Task 12: OAuth Callback API Route

**Files:**
- Create: `app/api/connections/callback/route.ts`
- Create: `app/api/connections/callback/__tests__/route.test.ts`

**Endpoint:** `GET /api/connections/callback`

**Flow:**
1. Receive callback from Composio after user completes OAuth
2. Authenticate the returning browser session and resolve `clientId`
3. Extract callback params from the query string:
   - Official Composio params: `status` and `connected_account_id`
   - Optional defensive aliases: `connectionStatus` and `connectedAccountId`
4. Reject if required params are missing or `status` is not `success`/`active`
5. Call `composio.connectedAccounts.get(connectedAccountId)` to verify the account is ACTIVE
6. Verify the callback account belongs to the current `clientId`:
   - `composio.connectedAccounts.list({ userIds: [clientId], statuses: ["ACTIVE"], toolkitSlugs: [connectedAccount.toolkit.slug], limit: 100 })`
   - Confirm the callback `connectedAccountId` is present before persisting
7. Upsert into our `connections` table:
   ```typescript
   await upsertConnection(supabase, {
     client_id: clientId,
     composio_connected_account_id: connectedAccount.id,
     toolkit_slug: connectedAccount.toolkit.slug,
     display_name: null,
     status: "active",
   });
   ```
8. Redirect to success page (e.g. `/settings?connection=success&toolkit=gmail`)

**TDD:** Test that:
- Redirects to an error state if the browser session is unauthenticated
- Verifies connection is active before writing to DB
- Upserts connection row correctly
- Handles missing/invalid callback params

**Acceptance:**
- Writes to both Composio (already done by OAuth flow) and our DB
- Redirects to success page
- Handles errors gracefully (redirect to error page)

---

## Task 13: Update Database Types

**Files:**
- Modify: `src/types/database.ts`

**Steps:**
1. Add the `connections` table entry to `src/types/database.ts` with `Row`, `Insert`, `Update`, and `Relationships`
2. Verify `connections` table types are present
3. Verify `get_system_reminder_context` return type includes `active_connection_toolkits`

**Acceptance:**
- Types include `connections` table
- Types include updated RPC return shape

---

## Task 14: Integration Smoke Test

**Files:**
- Manual testing checklist (no automated test file)

**Verify end-to-end:**
1. Migration applies cleanly to local Supabase
2. `getComposio()` initializes without error (requires `COMPOSIO_API_KEY`)
3. `loadComposioTools(clientId, [])` returns `{}`
4. `loadComposioTools(clientId, ['hackernews'])` returns tool objects (HackerNews is no-auth, good for testing)
5. System-reminder renders `Active connections: ...` correctly
6. System prompt includes `<connections>` section
7. Runner starts successfully with Composio tools spread in
8. Manual post-merge checklist: connect Gmail via OAuth, confirm `connections` row persists, confirm a subsequent run loads Gmail tools

**Acceptance:**
- All unit tests pass (`pnpm test`)
- No TypeScript errors (`pnpm tsc --noEmit`)
- Automated merge gates rely on mocked/unit coverage
- Manual Gmail OAuth validation is documented but not merge-blocking

---

## Dependency Graph

```
Task 1 (deps)
  └── Task 2 (migration) ← Task 13 (types)
       ├── Task 3 (schemas) ← Task 4 (queries)
       └── Task 9 (system-reminder)

Task 1 (deps)
  └── Task 5 (client) ← Task 6 (tools) ← Task 7 (barrel)
       └── Task 8 (wire into runner)

Task 10 (system prompt) — independent
Task 11 (initiate route) ← depends on Task 4, Task 5
Task 12 (callback route) ← depends on Task 4, Task 5

Task 14 (smoke test) ← depends on all above
```

**Suggested execution order:** 1 → 2 → 13 → 3 → 4 → 5 → 6 → 7 → 9 → 10 → 8 → 11 → 12 → 14
