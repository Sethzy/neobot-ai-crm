# Chat Context Engineering Cleanup Implementation Plan

**Goal:** Collapse the chat turn's pre-model plumbing down to what Managed Agents actually requires — current time + active connections + new user message — and parallelize the remaining setup I/O so first-token latency drops and the per-turn kickoff stops carrying stable-per-client context that already lives in the session's event log.

**Architecture:** Before Managed Agents, every chat turn was a stateless function call that had to rebuild "the world" (system prompt, user profile, conversation history, tool state) from scratch. Now the Anthropic session IS the world: it's a durable server-side object addressed by id, its event log holds every prior turn, and the agent version pins the system prompt + tool declarations + model choice. So nearly everything we currently re-send on every turn is either (a) already in the session's event log, (b) already on the agent version, or (c) queryable via a tool if the model actually needs it. This PR deletes the plumbing that rebuilds the world, seeds per-client context exactly once per thread (on session creation), and parallelizes the small amount of DB I/O that still has to happen per turn.

**Tech Stack:** Next.js 15 App Router · TypeScript · Anthropic Managed Agents (`@anthropic-ai/sdk/beta/sessions`) · Supabase Postgres · Vitest

## PR Split

This tasklist is **three tasks across two PRs**:

- **PR A — Chat hot-path simplification** (Tasks 1 and 3). `buildSystemReminder` gets stripped to the essentials, and the remaining setup I/O in `runManagedAgent` collapses into one `Promise.all`. No behavioral change — the model still sees the same thing on every turn, it just arrives slightly faster and with less decoration. Ship first.
- **PR B — Seed profile once per session** (Task 2). Gates `clientProfile` + `userPreferences` on `session.created` so they only ride along on the very first turn of a new thread. This is the one change with behavioral risk (the model on turn 2+ stops seeing profile text in the fresh kickoff; it reads it from the session's frozen event log instead). Ships alone after PR A is verified in Langfuse.

**Why split:** Task 2 is the only thing in here that could surprise you in production. If "the agent forgot who the user is on turn 3" shows up, isolating it in its own PR makes the bisect instant. Tasks 1 and 3 are pure deletion / refactor — safe to bundle.

**What skills migration handles separately (NOT in this PR):** the in-flight skills-migration plan (`managed-agents/skills/...`) owns the deletion of `ensureClientBootstrap` and every related file in `src/lib/runner/skills/`. Do not duplicate that work here. If you need to delete something in `src/lib/runner/skills/` for this PR, stop and check whether the skills migration is going to handle it first.

**What this PR is NOT trying to fix:** first-message latency. The `sessions.create` round-trip on turn 1 of a new thread is baked into the Managed Agents architecture and not addressed by any task here. If first-message lag becomes a product complaint, the fix is session warming (a cheap `/api/chat/warm` endpoint called on thread-page mount), which is its own separate spike.

## End State: What Chat Context Engineering Will Look Like

Four layers of context, each with exactly one job:

### Layer 0 — Agent version (set once by `scripts/managed-agents/create-agent.ts`)
Immutable, lives on Anthropic's side:
- System prompt ("You are Sunder…")
- Custom tool declarations (sourced from `src/lib/managed-agents/tools`)
- Built-in toolset configs (`bash` always-ask, `web_fetch` off, `web_search` off)
- Anthropic skills (`xlsx`, `docx`, `pptx`, `pdf`, plus 11 Sunder custom skills uploaded by the skills-migration PR)
- Model: `claude-sonnet-4-6`

Changed by re-running the create-agent script, not a code deploy.

### Layer 1 — Session (one per chat thread, durable)
Lives in Anthropic's managed agents service, addressed by `conversation_threads.session_id`. Created once per thread. Holds:
- The agent version pin (system prompt, tools, model)
- Every event from every turn of this thread (`user.message`, `agent.message`, `agent.custom_tool_use`, `user.custom_tool_result`, `span.model_request_*`, `session.status_idle`, …)
- **Seeded on creation** with the user's stable context (`client_profile` + `user_preferences` from the `clients` table), embedded in the first `user.message` of the first turn. Never re-sent.

The event log IS the conversation history. Between turns, nothing runs — but when the server reconnects and sends a new event, Anthropic has every prior turn and the seeded profile already there.

### Layer 2 — Per-turn kickoff (minimal)
The ONLY thing sent to the session on each turn:
```
<system-reminder>
Current time: 2026-04-12 14:30:00 UTC
Active connections:
  gmail (conn_abc): 4/12 tools active
  google_drive (conn_def): 7/20 tools active
</system-reminder>

{user's message text}
```
Plus any `file` parts attached via `attachFileToSession` before the kickoff.

No profile, no preferences, no decorative counts (open todos, memory files, active triggers, pending approvals), no user name, no days since signup. Two things stay:

1. **Current time** — the agent can't know "now" otherwise.
2. **Active Composio connections** — lets the model proactively reason "I see Gmail isn't connected, want to set one up?" without spending a `list_connections` tool call every time an integration comes up. It's a ~100-token-per-turn cost and a real UX hedge; none of its volatility actually breaks prompt caching because each turn's content is frozen in the event log once the turn completes (see Task 1 rationale).

### Layer 3 — On-demand context (the model pulls this itself when needed)
- `storage_read({ path: "/agent/SOUL.md" })` — the user's voice/preferences file
- `storage_read({ path: "/agent/MEMORY.md" })` — accumulated memory
- `search_crm(...)` — current CRM state
- `list_todo()` — active todos
- `list_connections()` — freshest Composio state if the reminder line is stale
- Any Composio-connected tool — tool errors tell the model which connections are inactive

### The full chat turn lifecycle, after cleanup

**First ever message on a brand-new thread:**
```
1. POST /api/chat
2. Auth + rate limit + resolve clientId                    [~3 DB hops, parallel where possible]
3. Parallel:
   - Look up conversation_threads (miss → insert row)
   - Load clients.client_profile + user_preferences
4. runManagedAgent():
   5. consumeMessageQuota()                                [DB write]
   6. Parallel (Promise.all):
      - persistUserInput()                                 [DB upsert on conversation_messages]
      - getOrCreateSession()                               [DB select → Anthropic sessions.create → DB update]
      - buildSystemReminder()                              [DB select on connections]
   7. attachFilesToManagedSession() (if any files)         [Anthropic, needs sessionId]
   8. buildKickoffText({ clientProfile, userPreferences,   [pure sync; profile/prefs ONLY here on turn 1]
                        systemReminder, userMessage })
   9. consumeAnthropicSession():
       a. openSessionStream()                              [subscribe-before-send]
       b. events.send(kickoff)                             [one user.message event]
       c. drain events, dispatch tools, loop to idle
```

**Every subsequent turn on the same thread:**
```
1. POST /api/chat
2. Auth + rate limit + resolve clientId
3. Parallel:
   - Look up conversation_threads (hit, has session_id)
   - Load clients.client_profile + user_preferences       [still parallel-loaded but ignored below]
4. runManagedAgent():
   5. consumeMessageQuota()
   6. Parallel (Promise.all):
      - persistUserInput()
      - getOrCreateSession()                               [DB select only — returns cached session_id, no Anthropic call]
      - buildSystemReminder()                              [DB select on connections]
   7. attachFilesToManagedSession() (if any files)
   8. buildKickoffText({ clientProfile: null,              [profile/prefs omitted — session event log already has them from turn 1]
                        userPreferences: null,
                        systemReminder, userMessage })
   9. consumeAnthropicSession():
       a. openSessionStream()
       b. events.send(kickoff)                             [reminder + user msg only]
       c. drain events, dispatch tools, loop to idle
```

### What disappears

| Gone | Why |
|---|---|
| `fetchReminderContext` RPC in `buildSystemReminder` (user name, open todos, memory files, triggers, approvals, days since signup) | Pure decoration. Agent version holds the system prompt; counts are queryable via tools on demand; user name is already in the session's seeded profile from turn 1 |
| `clientProfile` + `userPreferences` in the per-turn kickoff | Sent once as seed content on turn 1 of a new session, then lives in the event log |
| Sequential `persistUserInput → getOrCreateSession → buildSystemReminder` chain | None of these three depend on each other's output; they run in parallel after this PR |

| Stays | Why |
|---|---|
| `getAllConnections` query inside `buildSystemReminder` | Active Composio connections get one line per toolkit in the reminder so the model can proactively reason about which integrations are available without spending a `list_connections` tool call on every integration-adjacent turn |
| `Current time` in the reminder | The agent has no other way to know "now" within a turn |

### What stays load-bearing

- `conversation_messages` table — for fast UI rendering on page load (we never want to hit `events.list` on every thread open)
- `rate limit + auth + quota + thread row insert` — our business concerns, not Anthropic's
- Custom tool dispatch + UI event translation — the whole point of our harness
- Thread title generation — cosmetic, still ours
- The `runs` table — now purely a billing/observability ledger (the stale-row sweeper is untouched by this PR; if it becomes a problem, address it then)

## Relevant Files

**PR A (Tasks 1 + 3):**
- Modify: `src/lib/runner/system-reminder.ts` — strip to `(supabase, clientId) => Promise<string>` returning current time + active connections only
- Modify: `src/lib/runner/__tests__/system-reminder.test.ts` — rewrite assertions around the new minimal output
- Modify: `src/lib/managed-agents/adapter.ts` (around line 400–440) — drop the `threadId` arg on `buildSystemReminder`; fold `persistUserInput` + `getOrCreateSession` + `buildSystemReminder` into one `Promise.all`
- Modify: `src/lib/managed-agents/__tests__/adapter.test.ts` — add concurrency assertion for the three parallel calls

**PR B (Task 2):**
- Modify: `src/lib/managed-agents/adapter.ts` — gate `clientProfile` / `userPreferences` passed to `buildKickoffText` on `session.created`
- Modify: `src/lib/managed-agents/__tests__/adapter.test.ts` — add "seeded on first turn" + "omitted on subsequent turns" cases

**Files touched but NOT modified in this PR** (scoped out intentionally):
- `src/lib/runner/skills/ensure-client-bootstrap.ts` and every file in `src/lib/runner/skills/` — owned by the skills-migration PR, do not touch
- `src/lib/runner/run-lifecycle.ts` — `markStaleRunsFailed` stays wired exactly as today; the defensive sweep is out of scope for this PR
- `src/lib/managed-agents/session-kickoff.ts` — `buildKickoffText` already supports null profile/prefs, no change needed

## Bite-Sized Step Granularity

Each step is one action (2–5 minutes): "write the failing test", "run it to verify it fails", "implement the minimal change", "run to verify pass", "commit". TDD cycle is non-negotiable — see @1-test-driven-development if this pattern is new to you. Commit after every green test.

---

## Task 1: Strip `buildSystemReminder` to current time + active connections

**Ships in PR A.**

**Files:**
- Modify: `src/lib/runner/system-reminder.ts` (full rewrite, ~131 lines → ~55 lines)
- Test: `src/lib/runner/__tests__/system-reminder.test.ts` (full rewrite, 280 lines → ~90 lines)

**Why this task first:** The `fetchReminderContext` RPC is doing nothing the model actually uses (all those counts are queryable via tools on demand). Dropping it removes a DB round-trip on every turn and shrinks the per-turn token cost. The connections query stays — it's the one piece of volatile state that's actually correlated with tool-call correctness, and keeping it doesn't hurt prompt caching since each turn's reminder content is frozen in the session's event log the moment the turn completes.

**On the prompt-cache question:** earlier discussion treated "the reminder busts the cache" as load-bearing. That framing was wrong. Managed Agents sessions cache the entire event log as a stable prefix — each turn's content (reminder included) freezes immediately and contributes to the cached prefix for every subsequent turn. The volatile "current time" only matters on the turn it's fresh, and the fresh turn's user message is un-cached by construction anyway. So caching is fine whether the reminder has 1 line or 10 lines. The reason to strip is simplicity + modest token savings, not cache correctness.

### Step 1.1: Write the new failing test

Replace the entire contents of `src/lib/runner/__tests__/system-reminder.test.ts` with:

```ts
/**
 * Tests for the per-turn system-reminder builder.
 *
 * After the Managed Agents migration the reminder only carries two
 * pieces of context:
 *   1. The current wall-clock time (the agent has no other way to
 *      know "now" within a turn).
 *   2. The user's active Composio connections (lets the model
 *      reason about which integrations are available without
 *      spending a list_connections tool call on every turn).
 *
 * Everything else (user name, counts, days since signup) used to
 * live here and is now either durable on the session or queryable
 * via tools.
 *
 * @module lib/runner/__tests__/system-reminder
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connections/queries", () => ({
  getAllConnections: vi.fn(),
}));
import { getAllConnections } from "@/lib/connections/queries";

import { buildSystemReminder } from "../system-reminder";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const mockGetAllConnections = vi.mocked(getAllConnections);

const ACTIVE_GMAIL = {
  id: "conn_gmail",
  client_id: CLIENT_ID,
  toolkit_slug: "gmail",
  display_name: "Gmail",
  composio_connected_account_id: "composio-gmail-123",
  account_identifier: "user@gmail.com",
  status: "active" as const,
  activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL", "GMAIL_LIST_EMAILS", "GMAIL_SEARCH"],
  tool_count: 12,
  created_at: "2026-03-05T00:00:00Z",
  updated_at: "2026-03-05T00:00:00Z",
};

describe("buildSystemReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T14:30:00Z"));
    mockGetAllConnections.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current time and 'Active connections: none' when the user has no connections", async () => {
    const result = await buildSystemReminder({} as never, CLIENT_ID);
    expect(result).toBe(
      "<system-reminder>\nCurrent time: 2026-04-12 14:30:00 UTC\nActive connections: none\n</system-reminder>",
    );
  });

  it("lists each active connection with toolkit slug, connection id, and activated/total tool counts", async () => {
    mockGetAllConnections.mockResolvedValue([ACTIVE_GMAIL]);

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).toContain("Current time: 2026-04-12 14:30:00 UTC");
    expect(result).toContain("Active connections:");
    expect(result).toContain("  gmail (conn_gmail): 4/12 tools active");
  });

  it("treats inactive (error/revoked) connections as absent for reminder purposes", async () => {
    mockGetAllConnections.mockResolvedValue([
      { ...ACTIVE_GMAIL, status: "error" as const },
    ]);

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).toContain("Active connections: none");
    expect(result).not.toContain("gmail");
  });

  it("degrades gracefully when getAllConnections throws", async () => {
    mockGetAllConnections.mockRejectedValue(new Error("RLS denied"));

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    // Falls back to 'none' — the model can still call list_connections
    // directly if it actually needs to know.
    expect(result).toContain("Active connections: none");
    expect(result).toContain("Current time: 2026-04-12 14:30:00 UTC");
  });

  it("does not include user name, open todos, memory files, triggers, approvals, or days-since-signup", async () => {
    mockGetAllConnections.mockResolvedValue([ACTIVE_GMAIL]);

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).not.toMatch(/User:/);
    expect(result).not.toMatch(/Open todos/);
    expect(result).not.toMatch(/Memory files/);
    expect(result).not.toMatch(/Active triggers/);
    expect(result).not.toMatch(/Pending approvals/);
    expect(result).not.toMatch(/Days since signup/);
  });
});
```

### Step 1.2: Run the test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: all five tests FAIL. The signature mismatches (tests call `buildSystemReminder({}, CLIENT_ID)` but the current impl takes `(supabase, clientId, threadId)` and hits a DB RPC), and the "does not include" test flags the decorative counts the current impl still emits.

### Step 1.3: Rewrite `buildSystemReminder`

Replace the entire contents of `src/lib/runner/system-reminder.ts` with:

```ts
/**
 * Per-turn system reminder for the Managed Agents chat adapter.
 *
 * Managed Agents holds every long-lived context layer we used to cram
 * into this block: the system prompt lives on the agent version, the
 * user's profile and preferences are seeded once at session creation
 * (see `runManagedAgent` for the gating logic), the full conversation
 * history lives in the session's event log, and counts (todos, memory
 * files, triggers, approvals) are queryable via tools on demand.
 *
 * What stays per-turn:
 *   1. Current wall-clock time — the agent can't know "now" otherwise.
 *   2. Active Composio connections — lets the model reason about
 *      which integrations are live without spending a list_connections
 *      tool call on every integration-adjacent turn. Stale data here
 *      is not a correctness problem: execute_composio_tool returns a
 *      useful "no active connection" error if the reminder is wrong.
 *
 * @module lib/runner/system-reminder
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAllConnections } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Builds the per-turn system-reminder XML block. */
export async function buildSystemReminder(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<string> {
  const now = new Date();
  const currentTime = `${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;

  const connections = await getAllConnections(supabase, clientId).catch(
    (): null => null,
  );

  const lines: string[] = [`Current time: ${currentTime}`];

  const activeConnections =
    connections?.filter((connection) => connection.status === "active") ?? [];

  if (activeConnections.length > 0) {
    const activeConnectionLines = activeConnections.map((connection) => {
      const escapedToolkitSlug = escapeXml(connection.toolkit_slug);
      const escapedConnectionId = escapeXml(connection.id);
      const activatedToolCount = connection.activated_tools.length;
      return `  ${escapedToolkitSlug} (${escapedConnectionId}): ${activatedToolCount}/${connection.tool_count} tools active`;
    });
    lines.push(`Active connections:\n${activeConnectionLines.join("\n")}`);
  } else {
    lines.push("Active connections: none");
  }

  return `<system-reminder>\n${lines.join("\n")}\n</system-reminder>`;
}
```

This deletes: the Zod schema, `FALLBACK_CONTEXT`, `fetchReminderContext`, the `get_system_reminder_context` RPC call, the user-name / todos / memory / triggers / approvals / days-since-signup branches, and the `threadId` parameter. Keeps: `escapeXml`, `getAllConnections`, the active-connection line builder.

### Step 1.4: Run the test to verify it passes

```bash
pnpm vitest run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: all five tests PASS.

### Step 1.5: Update the sole caller to drop the `threadId` argument

`src/lib/managed-agents/adapter.ts` (around line 435) currently reads:
```ts
const reminder = await buildSystemReminder(
  input.supabase,
  input.clientId,
  input.threadId,
);
```

Change it to:
```ts
const reminder = await buildSystemReminder(input.supabase, input.clientId);
```

Still `await` — the function stays async because `getAllConnections` is async. Task 3 will move this call into a `Promise.all` alongside `persistUserInput` and `getOrCreateSession` so the connection fetch overlaps with the other setup I/O instead of blocking on its own.

### Step 1.6: Run the adapter tests to make sure nothing downstream broke

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: PASS. The adapter tests don't assert on what's inside the reminder, only that it gets passed to `buildKickoffText`, so stripping the content is invisible to them.

### Step 1.7: Run the full vitest suite for a sanity check

```bash
pnpm vitest run
```

Expected: PASS. If something else in the codebase imports `buildSystemReminder` with arguments, TypeScript will complain and vitest will fail to compile — grep and fix.

### Step 1.8: Commit

```bash
git add src/lib/runner/system-reminder.ts src/lib/runner/__tests__/system-reminder.test.ts src/lib/managed-agents/adapter.ts
git commit -m "$(cat <<'EOF'
refactor(h5): strip buildSystemReminder to current time + active connections

Drop the decorative fields the model never actually uses — user name,
open todos, memory files, active triggers, pending approvals, days
since signup — along with the get_system_reminder_context RPC and the
Zod schema that shaped it.

What stays: current time (the only context Claude has no other way to
know) and the active Composio connections list (lets the model reason
about which integrations are live without spending a list_connections
tool call on every integration-adjacent turn). Dropping connections
too would have forced a tool-call on every Composio-touching turn for
a pure token saving; keeping it is the cheaper and more UX-stable
choice, and it does not affect prompt caching because each turn's
content is frozen in the session event log once the turn completes.

Also drops the threadId parameter (unused after the RPC removal).
Task 3 will fold this call into a Promise.all alongside persistUserInput
and getOrCreateSession so the connection fetch no longer blocks serially.
EOF
)"
```

---

## Task 2: Seed client profile + user preferences ONCE on session creation

**Ships in PR B — alone, after PR A is deployed and spot-checked in Langfuse.**

**Files:**
- Modify: `src/lib/managed-agents/adapter.ts` (around line 435 — the `buildKickoffText` call)
- Test: `src/lib/managed-agents/__tests__/adapter.test.ts`

**Why:** `clientProfile` and `userPreferences` are stable per-client — they don't change between turn 1 and turn 2 of the same thread. The Managed Agents session's event log holds every prior `user.message`, so if we stuff them into the kickoff on turn 1, they stay in the session's history forever and the agent can always see them. Re-sending on every turn is wasted tokens for information that already sits in the cached prefix. Gate on `session.created` so they only ride along on the very first turn of a new thread.

**Subtlety:** if the user updates their profile via `/settings/agent-context`, the new value only takes effect on future threads — existing threads keep the profile that was seeded at their creation. This is the correct behavior for most uses (threads are a closed conversation context) but worth documenting. If a user really wants to "apply the new profile to my current thread," they can ask the agent directly in the thread; the agent has `storage_read` to pull the latest profile on demand.

**Why this ships alone in PR B:** this is the only task in the whole cleanup with a behavioral change the model could notice. If it regresses ("the agent forgot who I am on turn 3"), isolating it in its own PR makes the bisect immediate. Do not bundle with PR A.

### Step 2.1: Write the failing tests (two cases)

In `src/lib/managed-agents/__tests__/adapter.test.ts`, the existing adapter tests already mock `getOrCreateSession`, `buildKickoffText`, and `consumeAnthropicSession`. Find the existing mocks and confirm `getOrCreateSession` is mockable.

Add two tests in the `describe("runManagedAgent", () => { ... })` block:

```ts
it("seeds client profile and user preferences into the kickoff on the first turn of a new session", async () => {
  // Arrange: new session path
  mockCreateRun.mockResolvedValue({ created: true, runId: "run_1" });
  mockGetOrCreateSession.mockResolvedValue({ id: "sess_new", created: true });
  // Reuse happy-path wiring for quota, persistUserInput, consumeAnthropicSession…

  await runManagedAgent({
    anthropic: {} as never,
    supabase: {} as never,
    clientId: "client_1",
    threadId: "thread_1",
    input: "Draft a follow-up to Kate",
    clientProfile: "## Client Profile\nJane — broker in SG",
    userPreferences: "## Preferences\nConcise. No fluff.",
    threadTitle: null,
  });

  expect(mockBuildKickoffText).toHaveBeenCalledWith(
    expect.objectContaining({
      clientProfile: "## Client Profile\nJane — broker in SG",
      userPreferences: "## Preferences\nConcise. No fluff.",
      userMessage: "Draft a follow-up to Kate",
    }),
  );
});

it("omits client profile and user preferences from the kickoff on subsequent turns of an existing session", async () => {
  // Arrange: existing session path
  mockCreateRun.mockResolvedValue({ created: true, runId: "run_2" });
  mockGetOrCreateSession.mockResolvedValue({ id: "sess_existing", created: false });
  // Reuse happy-path wiring…

  await runManagedAgent({
    anthropic: {} as never,
    supabase: {} as never,
    clientId: "client_1",
    threadId: "thread_1",
    input: "Follow-up question",
    clientProfile: "## Client Profile\nJane — broker in SG",
    userPreferences: "## Preferences\nConcise. No fluff.",
    threadTitle: null,
  });

  expect(mockBuildKickoffText).toHaveBeenCalledWith(
    expect.objectContaining({
      clientProfile: null,
      userPreferences: null,
      userMessage: "Follow-up question",
    }),
  );
});
```

**Mock note:** if `buildKickoffText` isn't already mocked in this file, add a `vi.hoisted` mock for it up top and wire `vi.mock("../session-kickoff", ...)`. The existing test file probably mocks `getOrCreateSession` but may call the real `buildKickoffText` — either is fine. If it calls the real one, your assertion shape changes to inspecting the string passed to `consumeAnthropicSession`'s `kickoffMessage` arg instead. Go with whichever matches the existing mocking style in the file.

### Step 2.2: Run the tests to verify they fail

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts -t "profile"
```

Expected: the "subsequent turns" test FAILS because the current adapter unconditionally passes `input.clientProfile` / `input.userPreferences` to `buildKickoffText`. The "first turn" test may already pass — that's fine, it locks in the existing behavior as a regression guard.

### Step 2.3: Gate profile/preferences on `session.created`

In `src/lib/managed-agents/adapter.ts`, locate the block inside `runManagedAgent` that builds the kickoff (post-PR-A, it lives inside the `Promise.all` result handling). The current shape after PR A is:

```ts
const reminder = /* destructured from the Promise.all */;
kickoff = buildKickoffText({
  clientProfile: input.clientProfile,
  userPreferences: input.userPreferences,
  systemReminder: reminder,
  userMessage: input.input,
});
```

Change to:

```ts
// Stable per-client context — profile and preferences — only rides
// along on the very first turn of a newly-created session. After
// that it lives in the session's event log on Anthropic's side and
// re-sending it every turn burns tokens for information the session
// already has. Editing the profile in /settings/agent-context takes
// effect on NEW threads; existing threads keep the profile they
// were seeded with. The agent can still `storage_read` the latest
// value from /agent/USER.md if a user explicitly asks it to.
kickoff = buildKickoffText({
  clientProfile: session.created ? input.clientProfile : null,
  userPreferences: session.created ? input.userPreferences : null,
  systemReminder: reminder,
  userMessage: input.input,
});
```

### Step 2.4: Run the tests to verify they pass

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: both new tests PASS, no existing tests regress.

### Step 2.5: Run the session-kickoff tests to make sure `buildKickoffText` still handles the null case cleanly

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts
```

Expected: PASS. The existing `"omits empty sections cleanly"` test already covers this branch.

### Step 2.6: Commit

```bash
git add src/lib/managed-agents/adapter.ts src/lib/managed-agents/__tests__/adapter.test.ts
git commit -m "$(cat <<'EOF'
refactor(h5): seed profile + preferences once per session, not per turn

Client profile and user preferences are stable per-client and per-
thread — the Managed Agents session event log already holds them
after the first user.message. Re-sending on every turn burns tokens
for information the session already has.

Gate both fields on session.created inside runManagedAgent so they
only ride along on the very first turn of a newly-created session.
Editing the profile in /settings/agent-context takes effect on new
threads; existing threads keep the profile they were seeded with,
and the agent can still storage_read /agent/USER.md if the user
explicitly asks for the latest version mid-thread.
EOF
)"
```

---

## Task 3: Parallelize the remaining setup I/O in `runManagedAgent`

**Ships in PR A, alongside Task 1.**

**Files:**
- Modify: `src/lib/managed-agents/adapter.ts` (around line 400–440)
- Test: `src/lib/managed-agents/__tests__/adapter.test.ts`

**Why:** After Task 1, the pre-stream setup inside `runManagedAgent` has five sequential awaits where only three actually have a dependency relationship. `consumeMessageQuota` must come first (don't do work for over-quota users). `attachFilesToManagedSession` must come after `getOrCreateSession` (needs the `sessionId`). But `persistUserInput`, `getOrCreateSession`, and `buildSystemReminder` don't depend on each other at all — yet today they run one-at-a-time. Run all three in parallel to collapse three DB round-trips worth of latency into one.

**This is the only task in this PR the user will feel as snappier.** Tasks 1 and 2 are cleanup and token savings. Task 3 is the actual wall-clock win on every turn.

### Step 3.1: Write the failing test

In `src/lib/managed-agents/__tests__/adapter.test.ts`, add a test that verifies ordering and concurrency across all three parallel-eligible calls:

```ts
it("runs persistUserInput, getOrCreateSession, and buildSystemReminder in parallel after quota consumption", async () => {
  const events: string[] = [];

  mockConsumeMessageQuota.mockImplementation(async () => {
    events.push("quota_start");
    await new Promise((r) => setTimeout(r, 0));
    events.push("quota_end");
    return { allowed: true, clientId: "client_1", periodStart: "2026-04-01" };
  });

  mockUpsertMessage.mockImplementation(async () => {
    events.push("persist_start");
    await new Promise((r) => setTimeout(r, 5));
    events.push("persist_end");
    return { data: {}, error: null };
  });

  mockGetOrCreateSession.mockImplementation(async () => {
    events.push("session_start");
    await new Promise((r) => setTimeout(r, 5));
    events.push("session_end");
    return { id: "sess_1", created: false };
  });

  mockBuildSystemReminder.mockImplementation(async () => {
    events.push("reminder_start");
    await new Promise((r) => setTimeout(r, 5));
    events.push("reminder_end");
    return "<system-reminder>Current time: X</system-reminder>";
  });

  mockCreateRun.mockResolvedValue({ created: true, runId: "run_1" });

  await runManagedAgent({
    anthropic: {} as never,
    supabase: {} as never,
    clientId: "client_1",
    threadId: "thread_1",
    input: "hi",
    clientProfile: null,
    userPreferences: null,
    threadTitle: null,
  });

  // Quota must be fully resolved before any of the three kicks off.
  const quotaEnd = events.indexOf("quota_end");
  const persistStart = events.indexOf("persist_start");
  const sessionStart = events.indexOf("session_start");
  const reminderStart = events.indexOf("reminder_start");
  expect(quotaEnd).toBeLessThan(persistStart);
  expect(quotaEnd).toBeLessThan(sessionStart);
  expect(quotaEnd).toBeLessThan(reminderStart);

  // Concurrency proof: ALL three starts must precede ALL three ends.
  const persistEnd = events.indexOf("persist_end");
  const sessionEnd = events.indexOf("session_end");
  const reminderEnd = events.indexOf("reminder_end");
  const lastStart = Math.max(persistStart, sessionStart, reminderStart);
  const firstEnd = Math.min(persistEnd, sessionEnd, reminderEnd);
  expect(lastStart).toBeLessThan(firstEnd);
});
```

**Mock note:** if `mockUpsertMessage` and `mockBuildSystemReminder` aren't already in the file, add hoisted mocks for `@/lib/chat/messages` (wrapping `upsertMessage` — the function `persistUserInput` calls internally) and `@/lib/runner/system-reminder`. If mocking `upsertMessage` is awkward, mock `persistUserInput` directly via `vi.spyOn` on the adapter module.

### Step 3.2: Run the test to verify it fails

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts -t "parallel"
```

Expected: FAIL. Today the events fire strictly sequentially (persist_start → persist_end → session_start → session_end → reminder_start → reminder_end), so `lastStart` > `firstEnd` and the assertion fails.

### Step 3.3: Parallelize persist + getOrCreateSession + buildSystemReminder

In `src/lib/managed-agents/adapter.ts`, find the block inside the `try { ... }` in `runManagedAgent` that currently looks like:

```ts
await persistUserInput({
  supabase: input.supabase,
  threadId: input.threadId,
  runId,
  userMessage: input.input,
  fileParts: input.fileParts ?? [],
  sourceEventId: input.userMessageSourceId,
});
shouldReleaseConsumedQuota = false;

const session = await getOrCreateSession({
  anthropic: input.anthropic,
  supabase: input.supabase,
  threadId: input.threadId,
  threadTitle: input.threadTitle,
});
sessionId = session.id;

await attachFilesToManagedSession({
  sessionId,
  fileParts: input.fileParts ?? [],
  logLabel: "runManagedAgent",
});

const reminder = await buildSystemReminder(input.supabase, input.clientId);
```

Replace with:

```ts
// Persist the user's message, (re)open the Anthropic session, and
// fetch the per-turn system reminder in parallel. None of the three
// depend on each other's output, and all three are simple DB
// round-trips on the happy path (plus one Anthropic sessions.create
// on the very first turn of a new thread, inside getOrCreateSession).
// File attach stays sequential on the resolved session id. If any of
// the three throws, the catch block below releases the consumed
// quota via the shouldReleaseConsumedQuota flag.
const [, session, reminder] = await Promise.all([
  persistUserInput({
    supabase: input.supabase,
    threadId: input.threadId,
    runId,
    userMessage: input.input,
    fileParts: input.fileParts ?? [],
    sourceEventId: input.userMessageSourceId,
  }),
  getOrCreateSession({
    anthropic: input.anthropic,
    supabase: input.supabase,
    threadId: input.threadId,
    threadTitle: input.threadTitle,
  }),
  buildSystemReminder(input.supabase, input.clientId),
]);
shouldReleaseConsumedQuota = false;
sessionId = session.id;

await attachFilesToManagedSession({
  sessionId,
  fileParts: input.fileParts ?? [],
  logLabel: "runManagedAgent",
});
```

You're removing the standalone `const reminder = await buildSystemReminder(...)` line below this block at the same time — the `reminder` constant is now destructured out of the `Promise.all`.

Note: `shouldReleaseConsumedQuota = false` now moves AFTER the `Promise.all` so it only flips off once all three operations succeed. If any of them throws, `shouldReleaseConsumedQuota` stays `true` and the catch block correctly releases the quota.

### Step 3.4: Run the test to verify it passes

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: PASS on both the new parallelism test and all prior tests.

### Step 3.5: Smoke-test end-to-end with the dev server

```bash
pnpm dev
```

In a separate shell, open the app in a browser, send a fresh first-message on a new thread, and watch the server logs for the `[chat/timing]` lines. Compare the delta between `pre_run_managed_agent` and `run_managed_agent_returned` against a pre-cleanup baseline — on a warm session the delta should drop noticeably because persist, session look-up, and the connections query now overlap.

Note: the timing logs in the route only cover the outer `runManagedAgent` call. If you want line-level visibility inside the adapter, drop temporary `performance.now()` markers before/after each step and remove them after you've verified the win.

### Step 3.6: Commit

```bash
git add src/lib/managed-agents/adapter.ts src/lib/managed-agents/__tests__/adapter.test.ts
git commit -m "$(cat <<'EOF'
perf(h5): parallelize persist + session + system-reminder setup

runManagedAgent's pre-stream setup was doing three DB round-trips in
strict sequence even though none of them depend on each other's
output. Collapse persistUserInput, getOrCreateSession, and
buildSystemReminder into one Promise.all so they overlap on the
network. File attach stays sequential on the resolved session id.
Quota consumption stays strictly before any of them so over-quota
users never burn the round-trips.

The shouldReleaseConsumedQuota flag moves after the parallel block
so it only flips off when all three operations succeed. If any
throws, the catch block still releases the consumed quota correctly.
EOF
)"
```

---

## Post-PR A Verification

After Tasks 1 and 3 are committed and PR A is opened:

### Full test suite
```bash
pnpm vitest run
```
Expected: PASS.

### Type check
```bash
pnpm tsc --noEmit
```
Expected: no errors. This catches any lingering call sites of `buildSystemReminder(supabase, clientId, threadId)` that still pass three arguments — the new signature is `(supabase, clientId)`.

### Manual smoke test
Start the dev server, open the app, send a fresh first-message on a brand-new thread. Verify in order:

1. The agent responds correctly (knows the current time if asked, knows which connections are active if asked).
2. A second message on the same thread still gets a correct response.
3. The `[chat/timing]` logs show a shorter `pre_run_managed_agent → run_managed_agent_returned` delta on subsequent turns (proves Task 3's parallelization worked).

### Observability
Spot-check a chat trace in Langfuse: confirm the kickoff `user.message` now contains the shorter system-reminder block (just current time + active connections, no counts or decoration).

## Post-PR B Verification

After Task 2 is committed and PR B is opened, **before merging**:

### The Langfuse spot-check that matters
Send a fresh first message on a brand-new thread in the deployed preview. In Langfuse, find the trace and confirm:

1. Turn 1's kickoff `user.message` contains the full profile + preferences text (the seed).
2. Send a follow-up on the same thread.
3. Turn 2's kickoff `user.message` does NOT contain the profile text — just the system-reminder + new user message.
4. Ask the agent "what do you know about me?" on turn 2. It should still answer correctly because the profile is in the session's frozen turn-1 history.

**If turn 2's kickoff shows the full profile text, Task 2's branching logic is wrong — do not merge.**

### Fresh-thread regression
Start a brand-new thread after merging PR B. Verify the agent still knows who the user is on turn 1 (proves the create branch still seeds profile).

## Scoped Out of This PR (deliberate YAGNI)

Things that came up during the design conversation but are NOT in this tasklist:

- **`ensureClientBootstrap` deletion** — owned by the in-flight skills-migration PR (Phase 4 and Phase 10 of that plan). Do not duplicate the delete here. If the skills migration is blocked for some reason and the bootstrap hot-path call is still costing real latency, file a separate micro-PR for it — but default is: let skills migration own it.
- **`markStaleRunsFailed` removal** — unrelated to context engineering. It's a defensive sweep for stuck `running` rows in the `runs` table. Under Managed Agents it may be unnecessary, but the honest answer is we don't know yet. Leave it in place, monitor `SELECT count(*) FROM runs WHERE status='running' AND created_at < now() - interval '1 hour'` for a week after PR A ships, and decide then: delete entirely if the count stays at 0, add a cron if it creeps up.
- **Removing the `createRun` thread lock** — possibly redundant since Anthropic sessions serialize events on their side, but requires a concurrent-send test to verify before pulling the lock. Separate PR, separate verification.
- **Stripping `clientProfile` / `userPreferences` from `RunManagedAgentInput`** — the fields stay in the interface since Task 2 still uses them on the first-turn branch. Deleting them would force `runManagedAgent` to load profile itself (worse parallelism) or always load them redundantly.
- **Session warming for first-message latency** — the real fix for the "first message feels slow" complaint, but architecturally a different concern (new endpoint, frontend wiring, race handling). Not addressed by any task here. If first-message lag becomes a product complaint, spike it separately.
- **Adding per-turn "pending approvals" or similar volatile hints to the reminder** — YAGNI until we see the model making mistakes that would be fixed by surfacing these.

## Execution Handoff

Tasklist complete. Three tasks across two PRs, in this order:

**PR A (ship first):** Task 1 (strip buildSystemReminder) + Task 3 (parallelize setup I/O). ~10 commits across both tasks. No behavioral change, just deletion + refactor + perf.

**PR B (ship after PR A is verified in Langfuse):** Task 2 (seed profile once). ~6 commits. Isolated because it's the one thing here with a behavioral change the model could notice.

Recommended execution: open a new session and run the tasks one at a time with a checkpoint between each. Don't batch all three through an executor without checkpoints; Task 2 in particular is the one most worth staring at the Langfuse traces for before merging.
