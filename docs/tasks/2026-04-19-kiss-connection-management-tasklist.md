# KISS Connection Management Implementation Plan

**Goal:** Collapse the managed-agent connection surface into a four-action lifecycle (`create_connection`, `list_connections`, `reauthorize_connection`, `delete_connection`) with an inline auth card, no activation step, and next-message availability.

**Architecture:** This is a *simplification*, not a rewrite. The Composio-backed backend stays. We remove the discovery/activation-era tools from the published managed-agent declaration list, harden `create_connection` against unsupported or duplicate providers, rewrite the auth card copy, preserve connection rows on reauth failure, and scrub the activation-era prompt and per-turn reminder content.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest + React Testing Library, Supabase (Postgres + RLS + Realtime), `@anthropic-ai/sdk` managed agents, Composio for OAuth plumbing, Tailwind + ShadCN UI.

**Origin plan:** `docs/product/plans/2026-04-19-001-feat-kiss-connection-management-plan.md`
**Origin requirements:** `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`

---

## Bite-Sized Step Granularity

Each Step is one action (2–5 minutes):

- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

All tests use Vitest. Run focused tests with:

```bash
pnpm test:run path/to/file.test.ts
```

Run a single test name:

```bash
pnpm test:run path/to/file.test.ts -t "test name substring"
```

---

## Relevant Files

**Managed-agent tool surface:**
- Modify: `src/lib/managed-agents/tools/declarations.ts`
- Modify: `src/lib/managed-agents/tools/browser-side/create-connection.ts`
- Modify: `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts`
- Modify: `src/lib/managed-agents/tools/connections/list-connections.ts`
- Modify: `src/lib/managed-agents/tools/connections/delete-connection.ts`
- Modify: `src/lib/managed-agents/tools/connections/execute-composio-tool.ts` (copy scrub only)
- Modify: `src/lib/managed-agents/tools/connections/list-composio-tools.ts` (copy scrub only)
- Modify: `src/lib/managed-agents/tools/connections/index.ts` (remove retired exports)

**Tests:**
- Modify: `src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts`
- Modify: `src/lib/managed-agents/tools/browser-side/__tests__/reauthorize-connection.test.ts`
- Modify: `src/lib/managed-agents/tools/connections/__tests__/list-connections.test.ts`
- Modify: `src/lib/managed-agents/tools/connections/__tests__/delete-connection.test.ts`
- Create: `src/lib/managed-agents/tools/__tests__/declarations.test.ts`

**Chat UI:**
- Modify: `src/components/chat/tool-call-inline.tsx`
- Modify: `src/components/chat/tool-call-inline.test.tsx`

**Runner system content:**
- Modify: `src/lib/runner/system-skills.ts`
- Modify: `src/lib/runner/system-reminder.ts`
- Modify: `src/lib/runner/__tests__/system-reminder.test.ts`

**OAuth callback:**
- Modify: `app/api/connections/callback/route.ts`
- Modify: the corresponding test file if present (search before modifying)

**Supported provider constant (new):**
- Create: `src/lib/managed-agents/tools/supported-providers.ts`
- Create: `src/lib/managed-agents/tools/__tests__/supported-providers.test.ts`

---

## Task 1: Add the supported-provider allowlist

**Why first:** `create_connection` needs this constant in Task 2. Pure function with no deps — easy TDD warmup.

**Files:**
- Create: `src/lib/managed-agents/tools/supported-providers.ts`
- Test: `src/lib/managed-agents/tools/__tests__/supported-providers.test.ts`

**Step 1: Write the failing test**

Create `src/lib/managed-agents/tools/__tests__/supported-providers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  SUPPORTED_PROVIDERS,
  isSupportedProvider,
} from "../supported-providers";

describe("supported-providers", () => {
  it("exposes the launch set (gmail, google_calendar, google_drive, notion)", () => {
    expect([...SUPPORTED_PROVIDERS].sort()).toEqual([
      "gmail",
      "google_calendar",
      "google_drive",
      "notion",
    ]);
  });

  it("returns true for supported slugs", () => {
    expect(isSupportedProvider("gmail")).toBe(true);
    expect(isSupportedProvider("notion")).toBe(true);
  });

  it("returns false for unsupported slugs, including case mismatches", () => {
    expect(isSupportedProvider("slack")).toBe(false);
    expect(isSupportedProvider("Gmail")).toBe(false);
    expect(isSupportedProvider("")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:run src/lib/managed-agents/tools/__tests__/supported-providers.test.ts
```

Expected: FAIL — cannot resolve `../supported-providers`.

**Step 3: Write minimal implementation**

Create `src/lib/managed-agents/tools/supported-providers.ts`:

```typescript
/**
 * Launch-set allowlist of Composio provider slugs.
 *
 * Any slug outside this set is rejected at the `create_connection` boundary so
 * the agent does not fall back to a discovery workflow and does not silently
 * hand the user an unsupported OAuth popup.
 *
 * @module lib/managed-agents/tools/supported-providers
 */
export const SUPPORTED_PROVIDERS = [
  "gmail",
  "google_calendar",
  "google_drive",
  "notion",
] as const;

export type SupportedProviderSlug = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(slug: string): slug is SupportedProviderSlug {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(slug);
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test:run src/lib/managed-agents/tools/__tests__/supported-providers.test.ts
```

Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add src/lib/managed-agents/tools/supported-providers.ts \
        src/lib/managed-agents/tools/__tests__/supported-providers.test.ts
git commit -m "feat(connections): add supported-provider launch-set allowlist"
```

---

## Task 2: Harden `create_connection` — allowlist, duplicate guard, end-turn copy

**Why:** This tool is the main entry point for the new lifecycle. We want it to (a) reject unknown slugs, (b) keep the existing duplicate-row behavior but with clearer wording, (c) drop the `toolsToActivate` activation semantics from the description, and (d) instruct the agent to end its turn after the tool returns.

**Files:**
- Modify: `src/lib/managed-agents/tools/browser-side/create-connection.ts`
- Test: `src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts`

### Step 1: Write failing tests for the new behavior

Append these tests to `create-connection.test.ts` (inside the existing `describe("createConnectionTool", ...)` block, after the existing "creates a pending integration connection" test):

```typescript
it("rejects an unsupported provider slug with a clear error and does not call Composio", async () => {
  const { client } = createMockSupabase({ connections: [] });

  const result = await createConnectionTool.execute(
    { integrations: [{ integrationId: "slack" }] },
    makeContext(client),
  );

  expect(initiateOAuthFlow).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    success: true,
    results: [
      {
        integrationId: "slack",
        error: expect.stringMatching(/not supported/i),
      },
    ],
  });
});

it("rejects a duplicate provider with 'already connected, disconnect first' wording", async () => {
  vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
    integrationId: "gmail",
    displayName: "Gmail",
    description: "",
  });

  const { client } = createMockSupabase({
    connections: [
      {
        data: {
          id: "conn_existing",
          toolkit_slug: "gmail",
          status: "active",
        },
        error: null,
      },
    ],
  });

  const result = await createConnectionTool.execute(
    { integrations: [{ integrationId: "gmail" }] },
    makeContext(client),
  );

  expect(initiateOAuthFlow).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    success: true,
    results: [
      {
        integrationId: "gmail",
        error: expect.stringMatching(/already connected.*disconnect/i),
      },
    ],
  });
});

it("tells the agent to end the turn in the success message", async () => {
  vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
    integrationId: "notion",
    displayName: "Notion",
    description: "",
  });
  vi.mocked(initiateOAuthFlow).mockResolvedValue({
    redirectUrl: "https://composio.dev/redirect",
    connectedAccountId: "composio-acct-notion",
  });

  const { client } = createMockSupabase({
    connections: [
      { data: null, error: null },
      { data: null, error: null },
    ],
  });

  const result = await createConnectionTool.execute(
    { integrations: [{ integrationId: "notion" }] },
    makeContext(client),
  );

  expect(result).toMatchObject({ success: true });
  if (result.success) {
    expect(result.message).toMatch(/end this turn/i);
    expect(result.message).toMatch(/next message/i);
  }
});

it("does not require toolsToActivate and ignores it if provided", async () => {
  vi.mocked(getToolkitDisplayInfo).mockResolvedValue({
    integrationId: "gmail",
    displayName: "Gmail",
    description: "",
  });
  vi.mocked(initiateOAuthFlow).mockResolvedValue({
    redirectUrl: "https://composio.dev/redirect",
    connectedAccountId: "composio-acct-gmail",
  });

  const { client } = createMockSupabase({
    connections: [
      { data: null, error: null },
      { data: null, error: null },
    ],
  });

  const result = await createConnectionTool.execute(
    {
      integrations: [
        { integrationId: "gmail", toolsToActivate: ["GMAIL_SEND_EMAIL"] },
      ],
    },
    makeContext(client),
  );

  expect(result).toMatchObject({ success: true });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test:run src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts
```

Expected: 3 of the 4 new tests FAIL (the `toolsToActivate` ignore test passes incidentally because the schema already accepts it).

### Step 3: Update `create_connection` tool

Open `src/lib/managed-agents/tools/browser-side/create-connection.ts` and apply these edits:

**3a. Update imports** (top of file):

```typescript
import { isSupportedProvider, SUPPORTED_PROVIDERS } from "../supported-providers";
```

**3b. Rewrite the `description` field.** Replace the existing multi-line description with:

```typescript
description: [
  "Start the OAuth flow for a supported provider. The user completes authorization in an inline auth card in chat.",
  "",
  `Supported providers (v1): ${SUPPORTED_PROVIDERS.join(", ")}.`,
  "",
  "Behavior:",
  "- If the provider is already connected, this returns an 'already connected' error per integration. Direct the user to reauthorize (if credentials are stale) or disconnect first (if they want a different account).",
  "- If the provider is not in the supported list, this returns a 'not supported' error. Do not attempt to discover other integrations.",
  "- After calling this tool, END YOUR TURN. The provider is NOT usable in the current run. It becomes usable on the user's next message.",
  "",
  "For each integration you include, the response reports either a pending_auth card with a redirectUrl, or an error.",
].join("\n"),
```

**3c. Reject unsupported providers and duplicates before calling Composio.** Inside the `for (const integration of integrations)` loop, *replace* the section from `const callbackUrl = getCallbackUrl(...)` through the `if (existingConnection)` block with:

```typescript
if (!isSupportedProvider(integration.integrationId)) {
  results.push({
    integrationId: integration.integrationId,
    error: `Provider '${integration.integrationId}' is not supported in v1. Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}.`,
  });
  continue;
}

const callbackUrl = getCallbackUrl(
  integration.integrationId,
  context.threadId ? { threadId: context.threadId } : undefined,
);
const toolkitDisplayInfo = await getToolkitDisplayInfo(integration.integrationId).catch(() => ({
  integrationId: integration.integrationId,
  displayName: integration.integrationId,
  description: "",
}));

const { data: existingConnection, error } = await context.supabase
  .from("connections")
  .select("*")
  .eq("client_id", context.clientId)
  .eq("toolkit_slug", integration.integrationId)
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();

if (error) {
  return { success: false as const, error: error.message };
}

if (existingConnection) {
  results.push({
    integrationId: integration.integrationId,
    error:
      "Already connected. Ask the user to reauthorize this provider if credentials are stale, or disconnect it first to connect a different account.",
  });
  continue;
}
```

**3d. Rewrite the trailing `return` message** to instruct end-of-turn:

```typescript
const hasPendingAuthCard = results.some((result) => "connectionStatus" in result);

return {
  success: true as const,
  message: hasPendingAuthCard
    ? "Auth card(s) are now visible in chat. End this turn. The provider becomes usable on the user's next message after they complete OAuth."
    : "No new connection cards were created. Review per-integration errors below and stop; do not retry.",
  results,
};
```

**3e.** Leave the `inputSchema` as-is — `toolsToActivate` stays in the schema as a backward-compatible ignored field. Do not reference it anywhere in the handler.

### Step 4: Run tests to verify they pass

```bash
pnpm test:run src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts
```

Expected: PASS (all tests in file, including the new four).

### Step 5: Commit

```bash
git add src/lib/managed-agents/tools/browser-side/create-connection.ts \
        src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts
git commit -m "feat(connections): harden create_connection with allowlist and end-turn contract"
```

---

## Task 3: Simplify `list_connections` response shape

**Why:** `activated_tools` is no longer a user-facing concept (Phase 3b). Drop `activatedToolCount` / `totalToolCount` from the response. Other consumers of `list_connections` are agent-only, so this is a safe tool-contract change.

**Files:**
- Modify: `src/lib/managed-agents/tools/connections/list-connections.ts`
- Test: `src/lib/managed-agents/tools/connections/__tests__/list-connections.test.ts`

### Step 1: Update the failing test first

Open `src/lib/managed-agents/tools/connections/__tests__/list-connections.test.ts` and:

- Remove any assertions on `activatedToolCount` / `totalToolCount` from existing tests.
- Add this test asserting the shape stays slim:

```typescript
it("does not include activated-tool counts in the response (activation is not a v1 concept)", async () => {
  // arrange: mock supabase to return one active gmail connection (see existing test helpers)
  // act: call listConnectionsTool.execute({}, ctx)
  // assert:
  expect(result).toMatchObject({
    success: true,
    connections: [
      expect.objectContaining({
        serviceName: "gmail",
        status: "active",
      }),
    ],
  });
  expect(result.connections[0]).not.toHaveProperty("activatedToolCount");
  expect(result.connections[0]).not.toHaveProperty("totalToolCount");
});
```

Read the existing test file first to reuse its mock-supabase pattern before writing the new case.

### Step 2: Run and verify the test fails

```bash
pnpm test:run src/lib/managed-agents/tools/connections/__tests__/list-connections.test.ts
```

Expected: FAIL — response currently contains `activatedToolCount`.

### Step 3: Update the tool

Replace the body of `list-connections.ts`:

```typescript
/**
 * list_connections tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/list-connections
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";

export const listConnectionsTool: ManagedAgentTool = {
  name: "list_connections",
  description:
    "Lists the user's external-service connections. Returns provider, account identifier, and status (active | pending | error | needs_reauth) per connection. Use this before attempting provider actions to check what is connected.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { data, error } = await context.supabase
      .from("connections")
      .select("*")
      .eq("client_id", context.clientId)
      .order("toolkit_slug", { ascending: true });

    if (error) {
      return { success: false as const, error: error.message };
    }

    const connections = (data ?? []).map((connection) => ({
      connectionId: connection.id,
      serviceName: connection.toolkit_slug,
      description: connection.display_name ?? connection.toolkit_slug,
      accountName:
        connection.account_identifier ?? connection.display_name ?? connection.toolkit_slug,
      status: connection.status,
    }));

    return { success: true as const, connections };
  },
};
```

### Step 4: Run tests and confirm pass

```bash
pnpm test:run src/lib/managed-agents/tools/connections/__tests__/list-connections.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add src/lib/managed-agents/tools/connections/list-connections.ts \
        src/lib/managed-agents/tools/connections/__tests__/list-connections.test.ts
git commit -m "feat(connections): drop activated-tool counts from list_connections"
```

---

## Task 4: Rewrite `delete_connection` description; drop manage-activated-tools cross-reference

**Why:** The current description pushes the model toward `manage_activated_tools_for_connections`, which we are retiring. The behavior stays the same — it still deletes the Composio account and the row — only the copy changes.

**Files:**
- Modify: `src/lib/managed-agents/tools/connections/delete-connection.ts`
- Test: `src/lib/managed-agents/tools/connections/__tests__/delete-connection.test.ts`

### Step 1: Write a failing description test

Add to `delete-connection.test.ts`:

```typescript
it("description describes disconnect-provider framing and does not mention manage_activated_tools_for_connections", () => {
  expect(deleteConnectionTool.description).toMatch(/disconnect|remove.*connection/i);
  expect(deleteConnectionTool.description).not.toMatch(/manage_activated_tools/);
});
```

Read the file first to confirm the import path for `deleteConnectionTool`.

### Step 2: Run and verify it fails

```bash
pnpm test:run src/lib/managed-agents/tools/connections/__tests__/delete-connection.test.ts
```

Expected: FAIL — description still mentions `manage_activated_tools_for_connections`.

### Step 3: Rewrite the description

In `delete-connection.ts`, replace the `description` value with:

```typescript
description: [
  "Disconnect a provider. PERMANENTLY deletes the stored OAuth credentials and the connections row for the specified connectionId. This cannot be undone.",
  "",
  "Use this when the user explicitly wants to remove a provider from their account (\"disconnect Notion\", \"remove Gmail\").",
  "If the user is complaining that a connection has stopped working, use reauthorize_connection instead — do not delete.",
  "If the user wants to switch to a different account for the same provider, call this first, then create_connection.",
].join("\n"),
```

Leave the handler body unchanged.

### Step 4: Run tests to verify pass

```bash
pnpm test:run src/lib/managed-agents/tools/connections/__tests__/delete-connection.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add src/lib/managed-agents/tools/connections/delete-connection.ts \
        src/lib/managed-agents/tools/connections/__tests__/delete-connection.test.ts
git commit -m "feat(connections): rewrite delete_connection description as disconnect-provider"
```

---

## Task 5: Preserve rows on reauth failure (the durability fix)

**Why:** Today, when a reauth OAuth round-trip lands at `/api/connections/callback` with a failure status, the callback calls `handlePendingFailure`, which for non-reauth flows *deletes* the row. For reauth it correctly marks `status = "error"`, but the code path depends on `callbackReason === "reauth"` being present. We want to assert the behavior is stable with a test, and tighten the condition so an already-existing (non-pending) connection row is never deleted by a failed reauth.

Read the callback route (`app/api/connections/callback/route.ts`) carefully before editing — the logic is intricate and a mistake deletes valid rows. The current behavior for the reauth path (lines 120–128) is already mostly correct; we are adding a test that pins it down and removing the dependency on the callback carrying `reason=reauth`.

**Files:**
- Modify: `app/api/connections/callback/route.ts`
- Test: locate or create the callback test — search first.

### Step 1: Locate or create the callback test

```bash
pnpm test:run 'app/api/connections/callback' --reporter=verbose
```

If no test exists, create `app/api/connections/callback/route.test.ts`. If one exists, read it and add cases there. The rest of this task assumes a new test file; adapt if one exists.

### Step 2: Write the failing tests

Create or update `app/api/connections/callback/route.test.ts` with a test that:

1. Seeds a `connections` row with `status = "active"` for `gmail`.
2. Calls the `GET` handler with querystring `?toolkit=gmail&status=failed&reason=reauth&connected_account_id=composio-acct-gmail`.
3. Asserts the row is updated to `status = "error"`, **not deleted**.

And another test that:

1. Seeds only a `status = "pending"` row for `notion` (initial connect, not reauth).
2. Calls `GET` with `?toolkit=notion&status=failed&connected_account_id=composio-acct-notion`.
3. Asserts the pending row is deleted (initial-connect failure still cleans up).

Sketch (adapt to the repo's actual test harness for App Router routes):

```typescript
import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";
// ... plus the repo's existing supabase/composio mock helpers

describe("GET /api/connections/callback", () => {
  it("marks an active row as 'error' when reauth fails (never deletes it)", async () => {
    // ... mock active gmail connection + failed reauth callback params
    const response = await GET(request);
    expect(response.status).toBe(307); // redirect
    // ... assert the row is still present and status === "error"
  });

  it("deletes a pending row when the initial connect callback fails", async () => {
    // ... mock pending notion connection + failed non-reauth callback
    await GET(request);
    // ... assert the row was deleted
  });
});
```

### Step 3: Run tests to verify they fail

```bash
pnpm test:run app/api/connections/callback/route.test.ts
```

Expected: FAIL (tests exist, behavior needs verification).

### Step 4: Update the callback handler

Open `app/api/connections/callback/route.ts`. Replace the `handlePendingFailure` function (currently lines 108–129) so it never deletes a non-pending row:

```typescript
async function handleCallbackFailure(toolkitSlug: string | null): Promise<void> {
  if (!toolkitSlug) {
    return;
  }

  const clientId = await getClientId();

  // First, check if there's an already-active row for this toolkit.
  // A failed OAuth (especially a reauth) must never delete it — mark it as error instead.
  const { data: existing } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("toolkit_slug", toolkitSlug)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status !== "pending") {
    await updateConnection(supabase, clientId, {
      id: existing.id,
      status: "error",
    });
    return;
  }

  // Only a truly pending row (initial connect never finished) gets cleaned up.
  const pendingConnection = await getPendingConnectionByToolkit(supabase, clientId, toolkitSlug);

  if (pendingConnection) {
    await deleteConnection(supabase, clientId, pendingConnection.id);
  }
}
```

Then rename every call to `handlePendingFailure(...)` in the file to `handleCallbackFailure(...)`. This unifies the "failure" path and removes the reliance on the `reason=reauth` querystring to preserve rows.

### Step 5: Run tests and confirm pass

```bash
pnpm test:run app/api/connections/callback/route.test.ts
```

Expected: PASS (2 tests).

### Step 6: Commit

```bash
git add app/api/connections/callback/route.ts \
        app/api/connections/callback/route.test.ts
git commit -m "fix(connections): preserve active rows on OAuth callback failure"
```

---

## Task 6: Retire activation-era tools from the published declaration list

**Why:** Core of Phase 1a. New managed-agent versions must not expose `search_integrations`, `get_integration_capabilities`, `get_connection_details`, or `manage_activated_tools_for_connections`. The execution wrappers (`list_composio_tools`, `execute_composio_tool`) stay (Phase 1b).

The tool files themselves stay on disk (to avoid breaking any incidental imports and because removing them from the declaration list is sufficient to drop them from the next agent version). Only the *exported array* changes.

**Files:**
- Modify: `src/lib/managed-agents/tools/declarations.ts`
- Modify: `src/lib/managed-agents/tools/connections/index.ts`
- Create: `src/lib/managed-agents/tools/__tests__/declarations.test.ts`

### Step 1: Write the failing test

Create `src/lib/managed-agents/tools/__tests__/declarations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { MANAGED_AGENT_TOOL_NAMES } from "../declarations";

describe("MANAGED_AGENT_TOOL_DECLARATIONS", () => {
  it("publishes the four primary connection-management tools", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("create_connection");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("list_connections");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("reauthorize_connection");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("delete_connection");
  });

  it("retains the temporary Composio execution compatibility layer", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("list_composio_tools");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("execute_composio_tool");
  });

  it("does not publish the retired activation/discovery tools", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("search_integrations");
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("get_integration_capabilities");
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("get_connection_details");
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("manage_activated_tools_for_connections");
  });
});
```

### Step 2: Run and verify the test fails

```bash
pnpm test:run src/lib/managed-agents/tools/__tests__/declarations.test.ts
```

Expected: FAIL on the third assertion (retired tools are still published).

### Step 3: Update `declarations.ts`

In `src/lib/managed-agents/tools/declarations.ts`, remove these four entries from `MANAGED_AGENT_TOOL_DECLARATIONS`:

- `getConnectionDetailsTool`
- `getIntegrationCapabilitiesTool`
- `manageActivatedToolsForConnectionsTool`
- `searchIntegrationsTool`

Also remove the corresponding names from the import at the top of the file (lines 27–36). Leave `deleteConnectionTool`, `executeComposioToolTool`, `listComposioToolsTool`, and `listConnectionsTool` in place.

### Step 4: Update the barrel export

In `src/lib/managed-agents/tools/connections/index.ts`, remove exports for the four retired tools. Leave the physical files in place — a follow-up cleanup PR can delete them after the new agent version is deployed.

### Step 5: Run the test and also run the full managed-agent test suite

```bash
pnpm test:run src/lib/managed-agents/tools/__tests__/declarations.test.ts
pnpm test:run src/lib/managed-agents
```

Expected: PASS for the declarations test. The broader suite should also pass — any existing test that imports a retired tool directly by module path still works because the source files are unchanged.

If the broader suite fails with a missing-export error from `connections/index.ts`, add the missing re-exports back with a leading `// retired — source kept for direct imports only` comment.

### Step 6: Commit

```bash
git add src/lib/managed-agents/tools/declarations.ts \
        src/lib/managed-agents/tools/connections/index.ts \
        src/lib/managed-agents/tools/__tests__/declarations.test.ts
git commit -m "feat(connections): retire activation-era tools from published declaration list"
```

---

## Task 7: Drop the per-turn active-connections block from the system reminder

**Why:** Phase 4b. The model should not be fed a per-turn dump of connections + activated-tool counts. The system reminder shrinks to just the current time.

**Files:**
- Modify: `src/lib/runner/system-reminder.ts`
- Test: `src/lib/runner/__tests__/system-reminder.test.ts`

### Step 1: Rewrite the existing tests

Open `src/lib/runner/__tests__/system-reminder.test.ts` and replace the `describe("buildSystemReminder", ...)` block with:

```typescript
describe("buildSystemReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T14:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only the current time (no active-connections block)", async () => {
    const result = await buildSystemReminder({} as never, CLIENT_ID);
    expect(result).toBe(
      "<system-reminder>\nCurrent time: 2026-04-12 14:30:00 UTC\n</system-reminder>",
    );
  });

  it("does not call getAllConnections (per-turn connection context is gone)", async () => {
    await buildSystemReminder({} as never, CLIENT_ID);
    expect(mockGetAllConnections).not.toHaveBeenCalled();
  });

  it("does not include connection state, tool counts, or other legacy blocks", async () => {
    const result = await buildSystemReminder({} as never, CLIENT_ID);
    expect(result).not.toMatch(/Active connections/);
    expect(result).not.toMatch(/tools active/);
    expect(result).not.toMatch(/User:/);
    expect(result).not.toMatch(/todos/i);
    expect(result).not.toMatch(/memory/i);
  });
});
```

### Step 2: Run and verify the tests fail

```bash
pnpm test:run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: FAIL — the old reminder still emits `Active connections: none` and calls `getAllConnections`.

### Step 3: Simplify `system-reminder.ts`

Replace the full file with:

```typescript
/**
 * Per-turn system reminder for the Managed Agents chat adapter.
 *
 * Holds only the current wall-clock time. All other context (connections,
 * todos, memory) is queryable via tools on demand — injecting it every turn
 * only clutters the prompt.
 *
 * @module lib/runner/system-reminder
 */

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getCurrentTimeLine(now = new Date()): string {
  return `Current time: ${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function buildFallbackSystemReminder(): string {
  return `<system-reminder>\n${getCurrentTimeLine()}\n</system-reminder>`;
}

export async function buildSystemReminder(
  _supabase: unknown,
  _clientId: string,
): Promise<string> {
  return `<system-reminder>\n${getCurrentTimeLine()}\n</system-reminder>`;
}
```

Keep `_supabase` and `_clientId` as unused parameters so callers do not break. The underscore prefix documents the intent.

### Step 4: Run tests

```bash
pnpm test:run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: PASS.

### Step 5: Run a broader sweep to catch callers

```bash
pnpm test:run
```

Fix any type errors from callers that previously imported `getAllConnections` through the reminder only. If a caller uses it independently, leave it alone.

### Step 6: Commit

```bash
git add src/lib/runner/system-reminder.ts \
        src/lib/runner/__tests__/system-reminder.test.ts
git commit -m "feat(runner): drop per-turn active-connections block from system reminder"
```

---

## Task 8: Rewrite the `creating-connections` system skill

**Why:** Phase 4a. The skill currently teaches `search_for_integrations`, `get_integrations_capabilities`, and activation semantics. Replace it with the KISS `connect -> authorize -> use` model.

**Files:**
- Modify: `src/lib/runner/system-skills.ts`
- Tests for this module, if any — search first.

### Step 1: Search for existing tests

```bash
pnpm test:run src/lib/runner -t system-skills
```

If tests exist, extend them. If not, create `src/lib/runner/__tests__/system-skills.test.ts` in Step 2.

### Step 2: Write a failing test

Create or extend a test that asserts the skill content:

```typescript
import { describe, expect, it } from "vitest";

import { getSystemSkillContent } from "../system-skills";

describe("creating-connections/SKILL.md", () => {
  const content = getSystemSkillContent("skills/system/creating-connections/SKILL.md")!;

  it("teaches the connect -> authorize -> use model", () => {
    expect(content).toMatch(/auth card/i);
    expect(content).toMatch(/next message/i);
  });

  it("does not mention retired discovery or activation tools", () => {
    expect(content).not.toMatch(/search_for_integrations/);
    expect(content).not.toMatch(/get_integrations_capabilities/);
    expect(content).not.toMatch(/toolsToActivate/);
    expect(content).not.toMatch(/manage_activated_tools/);
  });

  it("lists the supported providers", () => {
    expect(content.toLowerCase()).toContain("gmail");
    expect(content.toLowerCase()).toContain("notion");
    expect(content.toLowerCase()).toContain("google_calendar");
    expect(content.toLowerCase()).toContain("google_drive");
  });

  it("tells the agent to end its turn after calling create_connection", () => {
    expect(content.toLowerCase()).toMatch(/end (your|the) turn/);
  });
});
```

### Step 3: Run and verify tests fail

```bash
pnpm test:run src/lib/runner/__tests__/system-skills.test.ts
```

Expected: FAIL.

### Step 4: Rewrite the SKILL.md content

In `src/lib/runner/system-skills.ts`, replace the value at `SYSTEM_SKILL_CONTENT["creating-connections/SKILL.md"]` (lines 13–52) with:

```markdown
# Creating New Connections

Sunder supports a small curated set of providers in v1. When the user asks to connect a supported provider, call `create_connection` directly — do not search or inspect capabilities first.

## Supported providers (v1)

- gmail
- google_calendar
- google_drive
- notion

If the user asks for anything else, tell them it is not yet supported. Do not try to discover alternatives.

## Flow

1. Call `create_connection` with the provider slug.
2. An inline auth card appears in chat.
3. END YOUR TURN. The provider is NOT usable in the current run.
4. The user completes OAuth.
5. On the user's NEXT message, the provider is available. Use `list_connections` if you need to confirm status before the first use.

## Rules

- Never call `create_connection` for an unsupported provider.
- If the provider is already connected and credentials are stale, call `reauthorize_connection`. Do not delete and recreate.
- If the user wants a different account for the same provider, call `delete_connection` first, then `create_connection`. Reauthorization does not change which account is connected.
- Do not ask the user to "grant permissions" after connecting. A successful OAuth is sufficient.
```

Also delete the `"creating-connections/create-direct-api-connection.md"` entry (lines 53–270) — custom direct-API connections are out of scope for v1 and leaving stale content teaches the agent a workflow that cannot succeed. If you would rather keep the file present but empty to avoid a 404, replace its body with a single line: `Direct-API connections are not supported in v1.`

### Step 5: Run tests and confirm pass

```bash
pnpm test:run src/lib/runner/__tests__/system-skills.test.ts
```

Expected: PASS.

### Step 6: Commit

```bash
git add src/lib/runner/system-skills.ts \
        src/lib/runner/__tests__/system-skills.test.ts
git commit -m "feat(runner): rewrite creating-connections skill for KISS lifecycle"
```

---

## Task 9: Rewrite the auth card copy and extend card states

**Why:** Phase 2a. The card currently says *"The agent only gets access after you approve the tools it should use"* — which is the activation-era mental model. Replace that line with the simpler KISS copy, keep the `active` / `error` lifecycle, and keep the realtime subscription exactly as-is (it already works).

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx`
- Test: `src/components/chat/tool-call-inline.test.tsx`

### Step 1: Write failing UI tests

Open `src/components/chat/tool-call-inline.test.tsx`. Add a new `describe` block near the existing connection tests:

```typescript
describe("ConnectionCard copy (KISS)", () => {
  const connectionResults = [
    {
      integrationId: "notion",
      displayName: "Notion",
      description: "Read and write your Notion workspace.",
      connectionStatus: "pending_auth" as const,
      redirectUrl: "https://composio.dev/oauth/redirect",
      composioConnectedAccountId: "composio-acct-notion",
    },
  ];

  it("does not mention approving tools anywhere in the card or modal", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{ integrations: [{ integrationId: "notion" }] }}
        output={{ success: true, results: connectionResults }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /connect notion/i }));

    expect(screen.queryByText(/approve the tools/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/grant permissions/i)).not.toBeInTheDocument();
  });

  it("describes what the provider will be usable for, not what the user approves", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{ integrations: [{ integrationId: "notion" }] }}
        output={{ success: true, results: connectionResults }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /connect notion/i }));

    expect(
      screen.getByText(/complete.*authorize|authorize.*complete|sign in to/i),
    ).toBeInTheDocument();
  });
});
```

### Step 2: Run and verify the tests fail

```bash
pnpm test:run src/components/chat/tool-call-inline.test.tsx
```

Expected: FAIL — `"approve the tools"` is still in the dialog description.

### Step 3: Update the card copy

Open `src/components/chat/tool-call-inline.tsx`.

**3a.** In `ConnectionModal`, line 177 currently reads:

```tsx
This connection is saved to your account. The agent only gets access after you approve the tools it should use.
```

Replace with:

```tsx
Sign in to {integrationName} to authorize Sunder. After you finish, come back to chat and send your next message.
```

**3b.** In `ConnectionCard` (lines 310–328), update the intro copy:

```tsx
<div className="space-y-1">
  <p className="text-sm font-medium text-foreground">Connect a provider</p>
  <p className="text-sm text-muted-foreground">
    You'll sign in in a new tab. The connection is saved to your account.
  </p>
</div>
```

**3c.** Do not change the realtime subscription (lines 206–264). It already keys on `composio_connected_account_id`, updates on status changes, and removes the channel on unmount. The plan explicitly said not to touch this.

### Step 4: Run tests and confirm pass

```bash
pnpm test:run src/components/chat/tool-call-inline.test.tsx
```

Expected: PASS.

### Step 5: Commit

```bash
git add src/components/chat/tool-call-inline.tsx \
        src/components/chat/tool-call-inline.test.tsx
git commit -m "feat(chat): rewrite connection auth-card copy for KISS launch model"
```

---

## Task 10: Scrub activation wording from the remaining tool descriptions

**Why:** Phase 4c cleanup. The execution-wrapper tools (`list_composio_tools`, `execute_composio_tool`) and `reauthorize_connection` may still contain activation-era phrasing. Pure copy changes — no behavior changes.

**Files:**
- Modify: `src/lib/managed-agents/tools/connections/list-composio-tools.ts`
- Modify: `src/lib/managed-agents/tools/connections/execute-composio-tool.ts`
- Modify: `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts`

### Step 1: Read each file and inventory activation wording

```bash
pnpm test:run -t "description"
```

Then open each file and search for phrases matching: `activat`, `grant permissions`, `tools to activate`, `deactiv`, `manage_activated_tools`. Make a short list before editing.

### Step 2: Write a regression test that asserts the scrub

Append to `src/lib/managed-agents/tools/__tests__/declarations.test.ts`:

```typescript
import {
  executeComposioToolTool,
  listComposioToolsTool,
  listConnectionsTool,
  deleteConnectionTool,
} from "../connections";
import { createConnectionTool, reauthorizeConnectionTool } from "../browser-side";

describe("tool descriptions are free of activation-era wording", () => {
  const tools = [
    createConnectionTool,
    listConnectionsTool,
    deleteConnectionTool,
    reauthorizeConnectionTool,
    listComposioToolsTool,
    executeComposioToolTool,
  ];

  const forbiddenPatterns: RegExp[] = [
    /activat/i,
    /deactivat/i,
    /grant\s+permissions/i,
    /toolsToActivate/,
    /manage_activated_tools/,
  ];

  for (const tool of tools) {
    it(`${tool.name} description contains no activation wording`, () => {
      for (const pattern of forbiddenPatterns) {
        expect(tool.description).not.toMatch(pattern);
      }
    });
  }
});
```

### Step 3: Run and verify tests fail (or pass trivially)

```bash
pnpm test:run src/lib/managed-agents/tools/__tests__/declarations.test.ts
```

Note which tool(s) fail. Likely `reauthorize_connection` and possibly `execute_composio_tool` / `list_composio_tools`.

### Step 4: Edit the failing descriptions

For each failing tool, rewrite the `description` field so the forbidden patterns are gone. Keep behavior identical. Example rewrite for `reauthorize_connection`:

```typescript
description: [
  "Refresh the stored credentials for an existing connection whose OAuth has expired or is returning auth errors.",
  "",
  "Use this when:",
  "- The user says a provider has stopped working and the error looks auth-related.",
  "- A tool call returned an authentication error for an already-connected provider.",
  "",
  "An inline auth card appears in chat. END YOUR TURN after calling this tool — reauthorization completes on the user's next message. Reauthorization cannot change which account is connected; for that, call delete_connection first, then create_connection.",
].join("\n"),
```

Apply analogous rewrites to `list-composio-tools.ts` and `execute-composio-tool.ts` — remove any copy that implies a separate activation or permissioning step.

### Step 5: Run tests and confirm pass

```bash
pnpm test:run src/lib/managed-agents/tools/__tests__/declarations.test.ts
pnpm test:run src/lib/managed-agents
```

Expected: PASS.

### Step 6: Commit

```bash
git add src/lib/managed-agents/tools/connections/list-composio-tools.ts \
        src/lib/managed-agents/tools/connections/execute-composio-tool.ts \
        src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts \
        src/lib/managed-agents/tools/__tests__/declarations.test.ts
git commit -m "feat(connections): scrub activation-era wording from tool descriptions"
```

---

## Task 11: End-to-end verification in the browser

**Why:** Phase 5b. Every UI change needs a real dev-server walk-through — type checks and unit tests do not verify UX. Use the `agent-browser` skill if you are driving this with an agent.

**Manual checklist (no code changes):**

### Step 1: Start the dev server

```bash
pnpm dev
```

Wait for the "ready" line.

### Step 2: Log into the app and open a chat thread

Open `http://localhost:3000`. Authenticate with a test account.

### Step 3: Connect Notion, happy path

Type: `Connect my Notion account.`

Expected:
- Agent calls `create_connection`.
- An inline auth card renders in the thread.
- The card copy does NOT say "approve the tools" or "grant permissions."
- Clicking the Connect button opens the Composio OAuth page in a new tab.
- After completing OAuth, the card updates to `Connected` via realtime (no manual refresh).
- The agent ends its turn and does NOT attempt to use Notion in the same run.

### Step 4: Use Notion on the next message

Type: `Make me a Notion page titled "Test".`

Expected: The agent calls `execute_composio_tool` against the Notion provider. No activation prompt appears.

### Step 5: Connect Gmail, duplicate-provider path

Type: `Connect Gmail.`
Complete OAuth.
Then type: `Connect Gmail again.`

Expected:
- The second `create_connection` returns an `already connected, disconnect first` error per the message.
- No second OAuth card appears.

### Step 6: Unsupported provider

Type: `Connect Slack.`

Expected:
- The agent either pre-empts with "Slack is not supported in v1" (from the system skill) or the `create_connection` tool returns the `not supported` error.
- No OAuth card appears, no discovery workflow starts.

### Step 7: Reauthorization path

Option A (no test double for expired tokens available): force a reauth manually by calling `reauthorize_connection` through the agent — type: `My Gmail seems to be broken, can you reauthorize it?`

Expected:
- An inline card appears with reauthorize copy.
- Completing OAuth flips the row back to `active`.
- A failed reauth leaves the row visible (status `error`), not deleted. Verify by simulating a failure (e.g., closing the OAuth popup without completing) and then running `SELECT id, status FROM connections WHERE toolkit_slug = 'gmail';` — the row should still exist.

### Step 8: Disconnect

Type: `Disconnect my Notion.`

Expected: `delete_connection` runs. The row disappears from DB. A follow-up `list_connections` call shows it is gone.

### Step 9: Log the walk-through result

There is no code commit for this task. If any step fails, file it as a follow-up and link it from the plan doc. If all pass, note the verification result in the PR description when you open one.

---

## Task 12: Deploy the new managed-agent version

**Why:** Phase 5a/5b exit. The declaration changes only take effect for *new* managed-agent versions. Without this step, the Anthropic platform still routes to the old tool surface and none of the preceding work is observable in production chat.

**Files:**
- Run: `scripts/managed-agents/create-agent.ts`

### Step 1: Inspect the deploy script

```bash
pnpm exec tsx scripts/managed-agents/create-agent.ts --help
```

Read the top of the script to confirm how the target environment (staging vs production) is selected and whether a version bump env var is needed (`ANTHROPIC_AGENT_VERSION`).

### Step 2: Deploy to staging first

Run the script with staging credentials per repo convention. Confirm it succeeds without error. Note the new version ID in the output.

### Step 3: Verify the published tool surface

Open a staging chat session. Inspect the session's tool list (via logs or via a debug endpoint if one exists). Confirm:
- `create_connection`, `list_connections`, `reauthorize_connection`, `delete_connection` are present.
- `search_integrations`, `get_integration_capabilities`, `get_connection_details`, `manage_activated_tools_for_connections` are absent.
- `list_composio_tools` and `execute_composio_tool` are still present (intentional).

### Step 4: Deploy to production

Only after staging looks clean, run the production deploy. Note the new version ID.

### Step 5: Commit / tag

There is no source change to commit here — this is a deploy step. If the repo tracks agent versions in `.env.example` or a config file, update that to reference the new version ID and commit the change:

```bash
# If such a file exists:
git add <config-file>
git commit -m "chore(managed-agents): bump agent version for KISS connection surface"
```

---

## Task 13: Open the PR with a clear test plan

**Files:**
- No code files — PR body only.

### Step 1: Confirm the branch is clean

```bash
git status
git log main..HEAD --oneline
```

You should see commits from Tasks 1–10 (and possibly 12) in a clean sequence.

### Step 2: Push and open the PR

```bash
git push -u origin <branch-name>
```

Open the PR with a title like:

```
feat(pr??): KISS connection management for launch
```

Use the body format the repo expects. In the test plan, include:

- [ ] Connect Notion end-to-end, usable on next message (Task 11 Step 3–4)
- [ ] Duplicate `create_connection` returns `already connected` (Task 11 Step 5)
- [ ] Unsupported provider rejected without discovery (Task 11 Step 6)
- [ ] Reauth success + failed-reauth row preserved (Task 11 Step 7, Task 5)
- [ ] Disconnect removes the row (Task 11 Step 8)
- [ ] `pnpm test:run` passes clean
- [ ] New managed-agent version deployed (Task 12)

### Step 3: Request review

Mention the plan doc (`docs/product/plans/2026-04-19-001-feat-kiss-connection-management-plan.md`) and the origin requirements doc in the PR body so reviewers have the full chain.

---

## What is intentionally NOT in this tasklist

Explicit follow-ups (matches Phase 5c of the plan — do not sneak these in):

- Native MCP migration (separate effort: `docs/tasks/2026-04-13-native-mcp-connections-tasklist.md`).
- Replacing or removing `execute_composio_tool` in favor of first-class provider tools.
- Same-provider multi-account support.
- Long-tail provider discovery.
- Admin/governance console.
- Deleting the retired tool source files from disk — safe cleanup after the new agent version is proven in production for a week.
- Settings-surface connection list — chat-only for launch.
- Migrating old threads that reference retired tools — accept cosmetic staleness until it breaks something.

---

## Notes on good test design (read if unsure)

- **One behavior per test.** `it("does X when Y")` — not `it("does X and Y and Z")`.
- **Arrange / Act / Assert.** Keep setup, the call, and the assertion visually separated.
- **Mock at the boundary, not through it.** For these tasks, mock Composio (`initiateOAuthFlow`, `getComposio`) and Supabase (`createMockSupabase`). Do not mock the tool handler itself.
- **Assert on observable behavior, not implementation detail.** Prefer `expect(result).toMatchObject({ ... })` over counting how many times an internal helper was called, unless that count is the behavior you are testing.
- **Fakes > mocks when practical.** `createMockSupabase` already exists — use it. It behaves like Supabase closely enough that tests resemble real usage.
- **Test the failure paths too.** For every `it("succeeds when ...")` there should be at least one `it("fails when ...")` on the same behavior.

---

**Tasklist complete and saved to `docs/tasks/2026-04-19-kiss-connection-management-tasklist.md`.** Ask the user to open a new session to do batch execution with checkpoints.
