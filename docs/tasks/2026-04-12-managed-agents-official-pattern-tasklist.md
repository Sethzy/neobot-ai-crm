# Managed Agents Official Pattern Refactor — Implementation Plan

**Goal:** Refactor Sunder's chat pipeline so it matches the officially documented Managed Agents session model — long-lived session subscription, fire-and-forget user messages, and native interrupt — instead of the one-POST-per-turn AI-SDK pattern we inherited from the pre-Managed-Agents era.

**Architecture:** Today every chat turn is `POST /api/chat` → `runManagedAgent` → one UIMessageStream response body → end. The new model treats the Anthropic session as a persistent server-side resource. The browser opens a long-lived thread-level SSE stream (`GET /api/chat/stream?threadId=...`) once when the thread is visible, and separate small fire-and-forget endpoints (`POST /api/chat/send`, `POST /api/chat/interrupt`) push user events into the session. The session itself handles concurrency, so the per-thread DB run lock, the 409 "queued" path, and the one-turn-per-stream coupling all go away.

**Tech Stack:**
- Next.js 15 App Router (route handlers under `app/api/**`)
- AI SDK v6 (`ai`, `@ai-sdk/react`) — `createUIMessageStream`, `useChat`, custom transport
- `@anthropic-ai/sdk` beta Managed Agents (`beta.sessions`, `beta.sessions.events`)
- Supabase (Postgres + RLS) — `conversation_threads`, `conversation_messages`, `runs`, `approval_events`
- Vitest + `createMockSupabaseClient` for unit tests
- Flexoki design tokens for any UI touched (no raw Tailwind palette classes)

---

## Bite-Sized Step Granularity

Each **Step** is one action you should be able to complete in 2–5 minutes:

- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

Tests are **Vitest**. Run them with `pnpm vitest run <path>` for a single file, `pnpm vitest run` for everything. Watch mode is `pnpm vitest` (no `run`).

Commits happen **at the end of every parent task**, and inside a task whenever you complete a logically independent step (new file + green test = commit). PR-style commit messages with the task number and a scope: `feat(chat-session): add /api/chat/interrupt route`.

---

## Orientation: files you must read before starting

Spend 20 minutes on these before touching code. Don't skip this — the refactor touches pieces that look independent but share a lot of implicit contracts.

- `CLAUDE.md` (root) — Sunder architecture, key principles, design token rules.
- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` — shipped-state reference.
- `src/lib/managed-agents/adapter.ts` — `runManagedAgent` + `resumeManagedAgentFromApproval`. The current one-turn-per-stream contract.
- `src/lib/managed-agents/session-runner.ts` — `consumeAnthropicSession`. The reusable event loop we keep.
- `src/lib/managed-agents/session-reconnect.ts` — `openSessionStream`, `iterateSessionEvents`. The SSE-reconnect + dedup helper. Read the long JSDoc about "subscribe before you send".
- `src/lib/managed-agents/session-kickoff.ts` — `buildKickoffText`, `getOrCreateSession`. The profile/preferences/reminder concatenation.
- `app/api/chat/route.ts` — the current monolithic route handler, including the 409 "queued" branch around line 452.
- `src/components/chat/chat-panel.tsx` — client side `useChat` wiring with `DefaultChatTransport`.
- `src/lib/runner/run-lifecycle.ts` — `createRun` (calls `create_run_if_idle` RPC) and `completeRun`.
- Anthropic docs (fetch via WebFetch if unsure):
  - `https://platform.claude.com/docs/en/managed-agents/overview`
  - `https://platform.claude.com/docs/en/api/beta/sessions`
  - Cookbook: `https://github.com/anthropics/claude-cookbooks/blob/main/managed_agents/data_analyst_agent.ipynb`
- Vercel managed-agents starter (reference implementation for send + stream split, event dedup, optimistic messages):
  - `https://github.com/vercel-labs/claude-managed-agents-starter`
  - Key files: `components/chat/chat-panel.tsx` (client transport pattern, `seenIdsRef` dedup, optimistic user messages), `app/workflows/tail-session.ts` (event polling — we use SSE instead but the event shape is the same), `app/api/managed-agents/message/route.ts` (fire-and-forget POST).
- AI SDK v6 custom transport docs: use `context7` MCP → resolve library `AI SDK` → query for `ChatTransport` / `createUIMessageStream` / custom transport implementation.

**Mental model (memorize this before starting):** The Anthropic session is a durable chat room on Anthropic's servers. `events.send` drops messages into the room. `events.stream` is a window you open to watch what happens inside. The two are independent. The room exists whether anyone's watching. Once this clicks, every weird edge case in the current flow becomes obvious.

---

## Relevant Files

**New files to create:**
- `app/api/chat/interrupt/route.ts` — POST interrupt event to a thread's session.
- `app/api/chat/send/route.ts` — POST a user.message event (fire-and-forget).
- `app/api/chat/stream/route.ts` — GET long-lived SSE stream tailing a thread's session events.
- `src/lib/managed-agents/interrupt-session.ts` — thin wrapper that posts `user.interrupt` to a session id.
- `src/lib/managed-agents/session-stream-forwarder.ts` — converts `iterateSessionEvents` output into AI-SDK UI chunks for a `UIMessageStreamWriter`, generalized from today's inline projection in `adapter.ts`.
- `src/lib/chat/session-transport-flag.ts` — small server-side feature flag helper (`"legacy" | "session"`) backed by an env var + per-client override column.
- `src/components/chat/session-chat-transport.ts` — custom AI SDK v6 `ChatTransport` for `useChat` that opens the thread stream once and POSTs sends to `/api/chat/send`.
- `src/lib/managed-agents/__tests__/interrupt-session.test.ts`
- `src/lib/managed-agents/__tests__/session-stream-forwarder.test.ts`
- `app/api/chat/interrupt/__tests__/route.test.ts`
- `app/api/chat/send/__tests__/route.test.ts`
- `app/api/chat/stream/__tests__/route.test.ts`
- `src/components/chat/__tests__/session-chat-transport.test.tsx`

**Existing files to modify:**
- `src/lib/managed-agents/adapter.ts` — extract the UI-stream projection into the new forwarder module; later, delete the 409 "queued" return shape.
- `src/lib/managed-agents/session-kickoff.ts` — split kickoff text into structured `user.message` content blocks; add optional `resources` on `sessions.create`.
- `app/api/chat/route.ts` — introduce the feature-flag branch, move the legacy path under `if (flag === "legacy")`, and eventually delete it.
- `src/components/chat/chat-panel.tsx` — wire `SessionChatTransport` behind the flag.
- `src/lib/runner/run-lifecycle.ts` — deprecate `createRun`'s "not created" return shape once the lock is gone (kept as a pure observability row write).

**Files to delete (once cutover is stable):**
- None. The legacy `/api/chat` POST path is deleted in-place in Task 9.

---

## Task Index

### Batch A — Quick wins (Tasks 1–5)

Independent improvements + one pure refactor. Ship as separate PRs. No dependencies between 1–4; Task 5 depends on reading the output of Tasks 1–4 to confirm no interface drift.

1. **Task 1** — Interrupt endpoint (server + tiny stop-button wiring). Smallest, highest leverage, ships alone.
2. **Task 2** — Fail loud on attachment errors. Standalone correctness fix.
3. **Task 3** — Structured `user.message` content blocks (prep work for the split).
4. **Task 4** — Mount first-turn files via `resources` on `sessions.create`.
5. **Task 5** — Extract the session-to-UI-stream forwarder into its own module.

> **REVIEW GATE A:** Code review all of Tasks 1–5 before proceeding. Specifically verify that the forwarder extracted in Task 5 has a clean interface — Task 6 imports it directly. If the interface is wrong, Task 6 has to refactor it. Check: `buildUiStreamCallbacks` in `session-stream-forwarder.ts` takes a `UIMessageStreamWriter` and returns `SessionRunnerCallbacks`. Both the legacy adapter and the new stream endpoint must be able to use it unchanged.

### Batch B — Server-side send + stream (Tasks 6–7)

These two are tightly coupled — the stream endpoint is useless without the send endpoint. Ship as one PR.

6. **Task 6** — `GET /api/chat/stream` — the long-lived thread subscription.
7. **Task 7** — `POST /api/chat/send` — fire-and-forget send.

> **REVIEW GATE B:** Code review Tasks 6–7 before proceeding. This is where the persistence-in-serverless decision (`after()`) gets validated and the two-subscriber model (browser stream + persistence worker both tailing the same session) gets stress-tested. Verify with curl that send + stream work end-to-end independently of any client changes. The server contract must be locked before the transport dev builds on top of it.

### Batch C — Client transport cutover (Task 8)

The riskiest task. Read the AI SDK v6 `ChatTransport` internals before writing code. Ships behind `NEXT_PUBLIC_CHAT_TRANSPORT_MODE` feature flag.

8. **Task 8** — Custom AI SDK transport wired behind a feature flag.

> **REVIEW GATE C:** Code review Task 8. Validate on staging with the flag flipped to `"session"`. Test: normal chat, mid-run second message, stop button, file upload, approval flow, thread navigation, tab backgrounding + reconnect. Only proceed to Task 9 after the flag has been stable on staging for at least a week.

### Batch D — Cleanup (Task 9)

Removes the legacy path. No rollback after this — the flag is gone.

9. **Task 9** — Delete the run lock, the 409 path, and the legacy chat branch.

---

## Task 1: Interrupt Endpoint

**Why:** Users have no way to halt a runaway agent today. The Managed Agents API supports this natively via `POST /v1/sessions/{id}/events` with `type: "user.interrupt"`. Smallest-possible change, big UX win, zero architectural risk.

**Files:**
- Create: `src/lib/managed-agents/interrupt-session.ts`
- Create: `src/lib/managed-agents/__tests__/interrupt-session.test.ts`
- Create: `app/api/chat/interrupt/route.ts`
- Create: `app/api/chat/interrupt/__tests__/route.test.ts`
- Modify: `src/components/chat/chat-panel.tsx` (wire a stop button)

### Step 1.1: Write the failing test for `interruptSession`

Create `src/lib/managed-agents/__tests__/interrupt-session.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { interruptSession } from "../interrupt-session";

describe("interruptSession", () => {
  it("posts a user.interrupt event to the given session id", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const anthropic = {
      beta: { sessions: { events: { send } } },
    } as never;

    await interruptSession(anthropic, "sess_abc");

    expect(send).toHaveBeenCalledWith("sess_abc", {
      events: [{ type: "user.interrupt" }],
    });
  });
});
```

### Step 1.2: Run the test and watch it fail

```bash
pnpm vitest run src/lib/managed-agents/__tests__/interrupt-session.test.ts
```

Expected: `FAIL` — `Cannot find module '../interrupt-session'`.

### Step 1.3: Implement the minimal `interruptSession` helper

Create `src/lib/managed-agents/interrupt-session.ts`:

```ts
/**
 * Posts a `user.interrupt` event to a Managed Agents session.
 *
 * Interrupts are sent through the same `POST /v1/sessions/{id}/events`
 * endpoint as normal user messages — the only difference is the event
 * `type`. The session transitions out of `running` and emits a
 * `session.status_changed` event on its event stream. Any live
 * subscribers see the transition immediately.
 *
 * @module lib/managed-agents/interrupt-session
 */
import type Anthropic from "@anthropic-ai/sdk";

export async function interruptSession(
  anthropic: Anthropic,
  sessionId: string,
): Promise<void> {
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.interrupt" }],
  } as never);
}
```

### Step 1.4: Run the test and watch it pass

```bash
pnpm vitest run src/lib/managed-agents/__tests__/interrupt-session.test.ts
```

Expected: `PASS`.

### Step 1.5: Write the failing test for the route handler

Create `app/api/chat/interrupt/__tests__/route.test.ts`. Follow the existing pattern in `app/api/tool-confirm/**` for auth + supabase mocks:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

const interruptSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/managed-agents/interrupt-session", () => ({ interruptSession }));

const maybeSingle = vi.fn();
vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    kind: "ok",
    userId: "u1",
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle }) }),
        }),
      }),
    },
  }),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: vi.fn().mockResolvedValue("c1"),
}));
vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: () => ({}),
}));

describe("POST /api/chat/interrupt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends user.interrupt for a valid thread", async () => {
    maybeSingle.mockResolvedValue({ data: { session_id: "sess_abc" }, error: null });

    const res = await POST(
      new Request("http://x/api/chat/interrupt", {
        method: "POST",
        body: JSON.stringify({ threadId: "thread_1" }),
      }),
    );

    expect(res.status).toBe(204);
    expect(interruptSession).toHaveBeenCalledWith(expect.anything(), "sess_abc");
  });

  it("returns 404 when the thread has no cached session", async () => {
    maybeSingle.mockResolvedValue({ data: { session_id: null }, error: null });

    const res = await POST(
      new Request("http://x/api/chat/interrupt", {
        method: "POST",
        body: JSON.stringify({ threadId: "thread_1" }),
      }),
    );

    expect(res.status).toBe(404);
    expect(interruptSession).not.toHaveBeenCalled();
  });

  it("rejects missing threadId", async () => {
    const res = await POST(
      new Request("http://x/api/chat/interrupt", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

### Step 1.6: Run the route test and watch it fail

```bash
pnpm vitest run app/api/chat/interrupt/__tests__/route.test.ts
```

Expected: `FAIL` — no `../route` module.

### Step 1.7: Implement the route handler

Create `app/api/chat/interrupt/route.ts`:

```ts
/**
 * POST /api/chat/interrupt
 *
 * Sends a `user.interrupt` event to the Anthropic session cached on
 * `conversation_threads.session_id`. Fire-and-forget: returns 204 once
 * the event is accepted upstream. The live event stream is responsible
 * for surfacing the resulting status change to the client.
 *
 * @module app/api/chat/interrupt/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { interruptSession } from "@/lib/managed-agents/interrupt-session";

const bodySchema = z.object({ threadId: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  let parsed: { threadId: string };
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;
  const { supabase, userId } = auth;

  const clientId = await resolveClientId(supabase, userId);

  const { data: thread } = await supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", parsed.threadId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!thread?.session_id) {
    return jsonError("No active session for thread.", 404);
  }

  await interruptSession(getAnthropicClient(), thread.session_id);
  return new Response(null, { status: 204 });
}
```

### Step 1.8: Run the route test and watch it pass

```bash
pnpm vitest run app/api/chat/interrupt/__tests__/route.test.ts
```

Expected: `PASS`.

### Step 1.9: Wire a minimal stop button in the chat panel

Read `src/components/chat/chat-panel.tsx` first. Find where the submit button lives (there is already logic for "loading" state from `useChat`). Add a sibling button that only renders while `status === "streaming"`:

```tsx
{status === "streaming" && (
  <button
    type="button"
    className="text-muted-foreground hover:text-fg text-sm"
    onClick={async () => {
      await fetch("/api/chat/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: id }),
      });
    }}
  >
    Stop
  </button>
)}
```

Use Flexoki tokens — no raw Tailwind palette classes. Read `src/lib/ui/color-maps.ts` if you need a token you don't recognize.

### Step 1.10: Smoke test in the browser

```bash
pnpm dev
```

- Open a thread, send a message that will take a while (e.g. "search the web and summarize ten articles about quantum computing").
- While the stream is live, click **Stop**.
- Expected: the response stops, the session event stream emits `session.status_changed`, the UI settles. Check server logs for the interrupt POST.

### Step 1.11: Commit

```bash
git add src/lib/managed-agents/interrupt-session.ts \
        src/lib/managed-agents/__tests__/interrupt-session.test.ts \
        app/api/chat/interrupt/route.ts \
        app/api/chat/interrupt/__tests__/route.test.ts \
        src/components/chat/chat-panel.tsx
git commit -m "feat(chat-session): add /api/chat/interrupt and stop button"
```

---

## Task 2: Fail Loud on Attachment Errors

**Why:** Today `attachFilesToManagedSession` catches and logs every failure silently, then the agent runs without the file. Hard-to-diagnose silent wrong answers. Standalone fix, zero coupling to the rest of this refactor.

**Files:**
- Modify: `src/lib/managed-agents/adapter.ts` — `attachFilesToManagedSession` around lines 304–331
- Modify: `src/lib/managed-agents/__tests__/adapter.test.ts` (or wherever adapter tests live — check for the existing file)

### Step 2.1: Read the existing adapter tests

```bash
pnpm vitest run src/lib/managed-agents/__tests__/ --reporter=verbose
```

Find the test that covers `runManagedAgent` attachment flow. If none exists, create `src/lib/managed-agents/__tests__/attach-files-to-session.test.ts`.

### Step 2.2: Write the failing test

```ts
import { describe, it, expect, vi } from "vitest";
// Export attachFilesToManagedSession from adapter.ts first (or pull it out
// into its own module if the adapter file becomes unwieldy).
import { attachFilesToManagedSession } from "../adapter";

describe("attachFilesToManagedSession", () => {
  it("throws when any attachment fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as never;

    await expect(
      attachFilesToManagedSession({
        sessionId: "sess_x",
        fileParts: [
          { url: "https://x/y.pdf", mediaType: "application/pdf", filename: "y.pdf" },
        ],
        logLabel: "test",
      }),
    ).rejects.toThrow(/Failed to fetch attachment/);
  });
});
```

### Step 2.3: Run it and watch it fail

```bash
pnpm vitest run src/lib/managed-agents/__tests__/attach-files-to-session.test.ts
```

Expected: `FAIL` — the current implementation swallows the error.

### Step 2.4: Remove the try/catch

Edit `src/lib/managed-agents/adapter.ts`. Delete the inner `try`/`catch` in `attachFilesToManagedSession` so that a failure rejects the outer `Promise.all`:

```ts
async function attachFilesToManagedSession(options: {
  sessionId: string;
  fileParts: readonly ManagedFilePart[];
  logLabel: string;
}): Promise<void> {
  if (options.fileParts.length === 0) return;

  await Promise.all(
    options.fileParts.map(async (filePart) => {
      const response = await fetch(filePart.url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch attachment ${filePart.filename ?? "(unnamed)"} (${response.status})`,
        );
      }
      await attachFileToSession({
        sessionId: options.sessionId,
        file: await response.blob(),
        filename: filePart.filename ?? "upload",
      });
    }),
  );
}
```

Also make sure the function is exported so the test can import it (or pull it into a dedicated file — prefer the dedicated file if the adapter test setup is noisy).

### Step 2.5: Run tests, watch them pass

```bash
pnpm vitest run src/lib/managed-agents/__tests__/attach-files-to-session.test.ts
```

Then run the full managed-agents suite to make sure nothing else regressed:

```bash
pnpm vitest run src/lib/managed-agents
```

### Step 2.6: Verify `runManagedAgent`'s error path surfaces attachment failures

Because `attachFilesToManagedSession` is called inside the outer `try` in `runManagedAgent` (around line 463), any thrown error already funnels into the existing cleanup — `completeRun({ status: "failed" })` + `throw`. Read lines 430–510 to confirm. Add a test if there isn't one:

```ts
it("marks run failed when attachment fetch fails", async () => {
  // ... wire runManagedAgent with a mock that throws in attach.
  // assert completeRun called with status "failed".
});
```

### Step 2.7: Smoke test

Upload a file, then temporarily break the signed URL (set a 0-byte expiry) and send the message. Expect the UI to show the managed-agent stream's `error` chunk, and the run row to end in `failed`.

### Step 2.8: Commit

```bash
git add src/lib/managed-agents/adapter.ts \
        src/lib/managed-agents/__tests__/attach-files-to-session.test.ts
git commit -m "fix(chat-session): fail loud on attachment fetch errors"
```

---

## Task 3: Structured `user.message` Content Blocks

**Why:** Today `buildKickoffText` concatenates `[profile] + [preferences] + [reminder] + [userMessage]` into a single string. This pollutes `user.message.content[0].text` so evaluators and any consumer of the session event log see reminder scaffolding as if the user typed it. `user.message.content` is an **array** — we should emit multiple `text` blocks so the actual user input stays isolated in the last block.

This is prep work for Task 10 (moving scaffolding out entirely), but it's valuable on its own.

**Files:**
- Modify: `src/lib/managed-agents/session-kickoff.ts`
- Modify: `src/lib/managed-agents/session-runner.ts` (the `events.send` call around line 68)
- Modify: `src/lib/managed-agents/__tests__/session-kickoff.test.ts`

### Step 3.1: Read the current kickoff

`src/lib/managed-agents/session-kickoff.ts:25–41` and `src/lib/managed-agents/session-runner.ts:66–76`.

### Step 3.2: Write the failing test

Edit (or create) `src/lib/managed-agents/__tests__/session-kickoff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildKickoffContent } from "../session-kickoff";

describe("buildKickoffContent", () => {
  it("emits separate text blocks for scaffolding and user message", () => {
    const content = buildKickoffContent({
      clientProfile: "profile-text",
      userPreferences: "prefs-text",
      systemReminder: "reminder-text",
      userMessage: "hello",
      customizedSkillSlugs: [],
    });

    expect(content).toEqual([
      { type: "text", text: "profile-text" },
      { type: "text", text: "prefs-text" },
      { type: "text", text: "reminder-text" },
      { type: "text", text: "hello" },
    ]);
  });

  it("omits empty sections", () => {
    const content = buildKickoffContent({
      clientProfile: null,
      userPreferences: null,
      systemReminder: "reminder",
      userMessage: "hi",
      customizedSkillSlugs: [],
    });
    expect(content).toEqual([
      { type: "text", text: "reminder" },
      { type: "text", text: "hi" },
    ]);
  });

  it("appends a customized-skills hint block when present", () => {
    const content = buildKickoffContent({
      clientProfile: null,
      userPreferences: null,
      systemReminder: "r",
      userMessage: "m",
      customizedSkillSlugs: ["pdf", "qa"],
    });
    expect(content).toContainEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("customized these skills: pdf, qa"),
      }),
    );
  });
});
```

### Step 3.3: Run and watch it fail

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts
```

Expected: `FAIL` — `buildKickoffContent` is not exported.

### Step 3.4: Implement `buildKickoffContent` alongside the existing function

In `src/lib/managed-agents/session-kickoff.ts`, add:

```ts
export interface KickoffTextBlock {
  type: "text";
  text: string;
}

export function buildKickoffContent(input: KickoffInput): KickoffTextBlock[] {
  const blocks: KickoffTextBlock[] = [];
  if (input.clientProfile?.trim().length) {
    blocks.push({ type: "text", text: input.clientProfile.trim() });
  }
  if (input.userPreferences?.trim().length) {
    blocks.push({ type: "text", text: input.userPreferences.trim() });
  }
  if (input.systemReminder.trim().length) {
    blocks.push({ type: "text", text: input.systemReminder.trim() });
  }
  if (input.customizedSkillSlugs.length > 0) {
    blocks.push({
      type: "text",
      text: `The user has customized these skills: ${input.customizedSkillSlugs.join(
        ", ",
      )}. When you are about to run one of these, first call storage_read('/agent/skills/<slug>/SKILL.md') and use that content as your workflow instead of the predefined one.`,
    });
  }
  blocks.push({ type: "text", text: input.userMessage });
  return blocks;
}
```

Keep `buildKickoffText` around for now — `session-runner.ts` still calls it. You'll swap the call site in Step 3.6.

### Step 3.5: Run and watch it pass

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts
```

### Step 3.6: Update `session-runner.ts` to use structured content

Replace the `events.send` call at `src/lib/managed-agents/session-runner.ts:67–76`. The new signature passes `content` directly:

```ts
if (options.kickoffContent) {
  await anthropic.beta.sessions.events.send(options.sessionId, {
    events: [{ type: "user.message", content: options.kickoffContent }],
  } as never);
}
```

And update the `SessionRunnerOptions` type in `src/lib/managed-agents/types.ts` to replace `kickoffMessage?: string` with `kickoffContent?: KickoffTextBlock[]`.

### Step 3.7: Update `adapter.ts` to pass `kickoffContent`

At `src/lib/managed-agents/adapter.ts:473`, replace the `buildKickoffText` call with `buildKickoffContent` and pass the result through as `kickoffContent`. Delete the `buildKickoffText` export once nothing else references it (grep first).

### Step 3.8: Run the full managed-agents suite

```bash
pnpm vitest run src/lib/managed-agents
```

Fix any breakages. Likely a test or two that asserts on the concatenated string shape.

### Step 3.9: Commit

```bash
git add src/lib/managed-agents/session-kickoff.ts \
        src/lib/managed-agents/session-runner.ts \
        src/lib/managed-agents/adapter.ts \
        src/lib/managed-agents/types.ts \
        src/lib/managed-agents/__tests__/session-kickoff.test.ts
git commit -m "refactor(chat-session): emit kickoff as structured user.message content blocks"
```

---

## Task 4: Mount First-Turn Files via `resources`

**Why:** Today the adapter creates an empty session and then calls `attachFileToSession` per file, which is an extra round trip per attachment. The documented pattern is to pass `resources` in `sessions.create` for files known at session-creation time. Use `attach` only for mid-conversation additions.

**Files:**
- Modify: `src/lib/managed-agents/session-kickoff.ts` — extend `getOrCreateSession` to accept optional `resources`
- Modify: `src/lib/managed-agents/adapter.ts` — branch: if `session.created` AND `fileParts.length > 0`, pass them as `resources` to the create call and skip the post-create attach
- Add tests.

### Step 4.1: Write the failing test

Add to `src/lib/managed-agents/__tests__/session-kickoff.test.ts`:

```ts
describe("getOrCreateSession", () => {
  it("passes resources through to sessions.create on first turn", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sess_new" });
    const supabase = /* mock: select returns { session_id: null } */;
    const anthropic = { beta: { sessions: { create } } } as never;

    await getOrCreateSession({
      anthropic,
      supabase,
      threadId: "thread_1",
      threadTitle: null,
      initialResources: [
        { type: "file", file_id: "file_123", mount_path: "/mnt/session/uploads/file_123" },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: [
          expect.objectContaining({ type: "file", file_id: "file_123" }),
        ],
      }),
    );
  });
});
```

### Step 4.2: Run and watch it fail

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts
```

### Step 4.3: Add `initialResources` to `getOrCreateSession`

```ts
export interface GetOrCreateSessionInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  threadId: string;
  threadTitle: string | null;
  initialResources?: Array<{ type: "file"; file_id: string; mount_path: string }>;
}
```

In the `sessions.create` call, spread `initialResources` into the body only when the array is non-empty.

### Step 4.4: Update `runManagedAgent` to upload before creating the session

The problem: we don't have Anthropic `file_id`s for the user's Supabase-hosted attachments — we only have signed URLs. We need to upload each file to Anthropic Files API first and get back a `file_id`.

Add a helper at `src/lib/managed-agents/upload-files-for-session.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { ManagedFilePart } from "./types";

export async function uploadFilePartsToAnthropic(
  anthropic: Anthropic,
  fileParts: readonly ManagedFilePart[],
): Promise<Array<{ fileId: string; filename: string }>> {
  return Promise.all(
    fileParts.map(async (part) => {
      const response = await fetch(part.url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch attachment ${part.filename ?? "(unnamed)"} (${response.status})`,
        );
      }
      const file = await response.blob();
      const uploaded = await anthropic.beta.files.upload({
        file: new File([file], part.filename ?? "upload"),
      } as never);
      return { fileId: uploaded.id, filename: part.filename ?? "upload" };
    }),
  );
}
```

Write a test for this helper using the same mock shape as `interrupt-session.test.ts`.

### Step 4.5: Wire it into `runManagedAgent`

In `src/lib/managed-agents/adapter.ts`, replace the `Promise.all([persistUserInput, getOrCreateSession, buildSystemReminder])` block with:

```ts
const uploadsPromise =
  (input.fileParts ?? []).length > 0
    ? uploadFilePartsToAnthropic(input.anthropic, input.fileParts ?? [])
    : Promise.resolve([] as Array<{ fileId: string; filename: string }>);

const [, uploadedFiles, reminder] = await Promise.all([
  persistUserInput({ /* unchanged */ }),
  uploadsPromise,
  buildSystemReminder(input.supabase, input.clientId),
]);

const session = await getOrCreateSession({
  anthropic: input.anthropic,
  supabase: input.supabase,
  threadId: input.threadId,
  threadTitle: input.threadTitle,
  initialResources: uploadedFiles.map((f) => ({
    type: "file",
    file_id: f.fileId,
    mount_path: `/mnt/session/uploads/${f.fileId}`,
  })),
});
```

Delete the `attachFilesToManagedSession` call when `session.created === true` — the files are mounted via `resources`. Keep it for the `session.created === false` path so mid-conversation attachments still work.

### Step 4.6: Run the tests

```bash
pnpm vitest run src/lib/managed-agents
```

### Step 4.7: Smoke test

Upload a PDF as part of a first message on a new thread. Check:
- The session-create POST in the Anthropic logs includes `resources`.
- No separate `attach` call for that file.
- The agent actually reads the file.

### Step 4.8: Commit

```bash
git add src/lib/managed-agents/session-kickoff.ts \
        src/lib/managed-agents/adapter.ts \
        src/lib/managed-agents/upload-files-for-session.ts \
        src/lib/managed-agents/__tests__/
git commit -m "perf(chat-session): mount first-turn files via sessions.create resources"
```

---

## Task 5: Extract the Session-to-UI-Stream Forwarder

**Why:** Task 6 needs to reuse the event → UI-chunk projection logic outside of `runManagedAgent`. Today that logic lives inside `buildUiStreamCallbacks` at `src/lib/managed-agents/adapter.ts:110–212`. Extract it as a standalone module with a clear interface. No behavior change; this is a pure refactor that keeps existing tests green.

**Files:**
- Create: `src/lib/managed-agents/session-stream-forwarder.ts`
- Create: `src/lib/managed-agents/__tests__/session-stream-forwarder.test.ts`
- Modify: `src/lib/managed-agents/adapter.ts` — import from the new module

### Step 5.1: Read `buildUiStreamCallbacks` end-to-end

`src/lib/managed-agents/adapter.ts:110–212`. Understand each case (agent.message, agent.tool_use, agent.tool_result, approval, error).

### Step 5.2: Move the function verbatim into `session-stream-forwarder.ts`

```ts
/**
 * Projects raw Anthropic session events into AI SDK v6 UI message chunks.
 *
 * Used by every code path that needs to render managed-agent events in a
 * UIMessageStream: the legacy one-turn-per-request adapter, the approval-
 * resume path, and the new long-lived `/api/chat/stream` endpoint. Keeping
 * this logic in one place ensures every path produces an identical UI
 * chunk shape.
 *
 * @module lib/managed-agents/session-stream-forwarder
 */
import type { UIMessageStreamWriter } from "ai";

import { toInternalManagedAgentToolName } from "./tool-name-aliases";
import type { SessionRunnerCallbacks } from "./types";

export function buildUiStreamCallbacks(
  writer: UIMessageStreamWriter,
): SessionRunnerCallbacks {
  // ... copy body from adapter.ts
}
```

### Step 5.3: Replace the adapter's definition with a re-export

In `adapter.ts`, delete the function body and import from the new module. Don't change any call site.

### Step 5.4: Write a test that locks in the chunk shape

Create `src/lib/managed-agents/__tests__/session-stream-forwarder.test.ts`. Test the output shape for each event type so future changes can't silently drift:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildUiStreamCallbacks } from "../session-stream-forwarder";

function mockWriter() {
  const writes: unknown[] = [];
  return {
    writes,
    writer: { write: (chunk: unknown) => writes.push(chunk) } as never,
  };
}

describe("buildUiStreamCallbacks", () => {
  it("emits text-start / text-delta / text-end for agent.message", () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);
    callbacks.onAgentMessage?.({
      id: "evt_1",
      content: [{ type: "text", text: "hi" }],
    } as never);
    expect(writes).toEqual([
      { type: "text-start", id: "evt_1" },
      { type: "text-delta", id: "evt_1", delta: "hi" },
      { type: "text-end", id: "evt_1" },
    ]);
  });

  it("emits tool-input-available for agent.tool_use", () => { /* ... */ });
  it("emits tool-output-available for agent.tool_result", () => { /* ... */ });
  it("emits tool-input-available + tool-approval-request for approvals", () => { /* ... */ });
  it("emits error for session.error", () => { /* ... */ });
});
```

### Step 5.5: Run tests

```bash
pnpm vitest run src/lib/managed-agents
```

Everything stays green. If anything breaks, it means the refactor wasn't pure — stop and find out why.

### Step 5.6: Commit

```bash
git add src/lib/managed-agents/session-stream-forwarder.ts \
        src/lib/managed-agents/__tests__/session-stream-forwarder.test.ts \
        src/lib/managed-agents/adapter.ts
git commit -m "refactor(chat-session): extract buildUiStreamCallbacks into its own module"
```

---

## Task 6: `GET /api/chat/stream` — Thread-Level Long-Lived Subscription

**Why:** The core of the refactor. A single SSE endpoint per thread that stays open as long as the user is viewing the thread. It tails the Anthropic session's event stream and emits AI SDK UI chunks for every agent event. This is the "stream" half of send + stream.

**Files:**
- Create: `app/api/chat/stream/route.ts`
- Create: `app/api/chat/stream/__tests__/route.test.ts`

### Step 6.1: Understand the session reconnect helper

Read `src/lib/managed-agents/session-reconnect.ts` in full. The important export is `iterateSessionEvents` — an async iterator that handles dedup, reconnect, and terminal gates. You want to use this directly instead of `consumeAnthropicSession`, because the thread-level stream doesn't care about "one turn terminal" — it keeps going forever until the client disconnects.

Check whether `iterateSessionEvents` exits on `session.status_idle` or keeps going. If it exits (likely, since it was designed for one-turn consumption), you need a thin wrapper that re-opens the subscription when it exits but the client is still connected. Name the wrapper `iterateSessionEventsForever`.

### Step 6.2: Write the failing test

Create `app/api/chat/stream/__tests__/route.test.ts`. Because SSE endpoints are awkward to test at the response level, test the **inner generator** instead — exported separately for this purpose.

```ts
import { describe, it, expect, vi } from "vitest";
import { streamThreadEvents } from "../route";

describe("streamThreadEvents", () => {
  it("forwards agent.message events as text chunks", async () => {
    const fakeSessionEvents = async function* () {
      yield { type: "agent.message", id: "evt_1", content: [{ type: "text", text: "hi" }] };
      yield { type: "session.status_idle" };
    };
    // ... wire fakeSessionEvents into the generator and assert on chunks yielded
  });

  it("forwards session.status_changed to let the client know the run is active", async () => { /* ... */ });

  it("stops when the abort signal fires", async () => { /* ... */ });
});
```

### Step 6.3: Run and watch it fail

### Step 6.4: Implement the stream endpoint

```ts
/**
 * GET /api/chat/stream?threadId=<uuid>
 *
 * Long-lived SSE endpoint that tails the Anthropic Managed Agents session
 * cached on a conversation thread and forwards AI SDK UI chunks to the
 * browser. Open once when the thread becomes visible; close when the user
 * navigates away or the tab closes. Independent of any `send` POST — the
 * session keeps running whether or not a subscriber is attached.
 *
 * @module app/api/chat/stream/route
 */
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { buildUiStreamCallbacks } from "@/lib/managed-agents/session-stream-forwarder";
import { iterateSessionEventsForever } from "@/lib/managed-agents/session-reconnect";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return jsonError("Missing threadId", 400);

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;
  const clientId = await resolveClientId(auth.supabase, auth.userId);

  const { data: thread } = await auth.supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!thread?.session_id) return jsonError("Thread not found", 404);
  const sessionId = thread.session_id;
  const anthropic = getAnthropicClient();

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const callbacks = buildUiStreamCallbacks(writer);
      for await (const event of iterateSessionEventsForever(anthropic, sessionId, request.signal)) {
        // Dispatch to callbacks by event type.
        dispatchEventToCallbacks(event, callbacks);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

Where `iterateSessionEventsForever` is a new export from `session-reconnect.ts`:

```ts
/**
 * Like `iterateSessionEvents` but doesn't exit on terminal states — keeps
 * reopening the SSE subscription until the abort signal fires. Used by the
 * thread-level stream endpoint where "terminal" only means "the current
 * turn is done, wait for the next one".
 */
export async function* iterateSessionEventsForever(
  anthropic: Anthropic,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<AnthropicEvent> {
  while (!signal.aborted) {
    for await (const event of iterateSessionEvents(anthropic, sessionId, { signal })) {
      yield event;
      if (signal.aborted) return;
    }
    // Inner iterator exited on a terminal gate — loop to re-subscribe.
  }
}
```

Extract `dispatchEventToCallbacks` from the existing `consumeAnthropicSession` loop in `session-runner.ts` so both call sites share it.

### Step 6.5: Persistence concern

The thread-level stream emits UI chunks but doesn't persist assistant messages. The existing `runManagedAgent` path owns persistence today via `finalizeRun`. In the new world, persistence still has to happen — somewhere.

**Decision:** persistence and stream forwarding are independent concerns. Introduce a background persistence loop triggered by the **send** endpoint (Task 7), not the stream endpoint. The stream endpoint is purely a read-only window. This mirrors the "multiple clients can subscribe to one session" property we want.

Document this explicitly in the route's JSDoc. Persistence belongs to the **write path** (`/api/chat/send`), not the **read path** (`/api/chat/stream`).

### Step 6.6: Run tests

```bash
pnpm vitest run app/api/chat/stream
```

### Step 6.7: Smoke test

```bash
curl -N "http://localhost:3000/api/chat/stream?threadId=<your-thread>" \
  -H "Cookie: <your-auth-cookie>"
```

Send a message from another tab. Events should stream in on the curl output.

### Step 6.8: Commit

```bash
git add app/api/chat/stream/route.ts \
        app/api/chat/stream/__tests__/route.test.ts \
        src/lib/managed-agents/session-reconnect.ts \
        src/lib/managed-agents/session-runner.ts
git commit -m "feat(chat-session): add GET /api/chat/stream long-lived subscription"
```

---

## Task 7: `POST /api/chat/send` — Fire-and-Forget Send

**Why:** The "write" half of send + stream. Persists the user message, uploads attachments, posts `user.message` to the session, kicks off a persistence worker for the resulting assistant turn, returns 200 immediately. No streaming response body — the browser's already-open `/api/chat/stream` subscription receives the events.

**Files:**
- Create: `app/api/chat/send/route.ts`
- Create: `app/api/chat/send/__tests__/route.test.ts`
- Create: `src/lib/managed-agents/persist-turn-in-background.ts`

### Step 7.1: Define the request body

```ts
const bodySchema = z.object({
  threadId: z.string().min(1),
  message: z.object({
    id: z.string().optional(),
    role: z.literal("user"),
    parts: z.array(z.unknown()),
  }),
});
```

### Step 7.2: Write the failing test

Mock `getAnthropicClient`, `resolveClientId`, and the Supabase chain. Assert:
1. User message is persisted via `upsertMessage`.
2. `sessions.events.send` is called with `user.message` content blocks.
3. Response status is 200.
4. On a brand-new thread, a session is created first.

### Step 7.3: Implement the route

```ts
/**
 * POST /api/chat/send
 *
 * Fire-and-forget endpoint for pushing a user message into a thread's
 * Anthropic session. Persists the user message, uploads any attachments,
 * sends `user.message` to the session, and kicks off a background
 * persistence worker for the resulting assistant turn. Returns 200
 * immediately — the browser's open /api/chat/stream subscription is
 * responsible for streaming agent events to the UI.
 *
 * Works whether the session is `idle` or `running` — the Managed Agents
 * runtime natively handles mid-run steering, so there is no thread lock.
 *
 * @module app/api/chat/send/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { upsertMessage } from "@/lib/chat/messages";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { getOrCreateSession, buildKickoffContent } from "@/lib/managed-agents/session-kickoff";
import { uploadFilePartsToAnthropic } from "@/lib/managed-agents/upload-files-for-session";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
import { persistTurnInBackground } from "@/lib/managed-agents/persist-turn-in-background";
// ...

export async function POST(request: Request): Promise<Response> {
  const body = bodySchema.parse(await request.json());

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;
  const clientId = await resolveClientId(auth.supabase, auth.userId);

  // 1. Extract text + files from message parts (reuse existing helpers from
  //    /api/chat/route.ts — pull them into src/lib/chat/extract-user-input.ts
  //    as part of this task).
  const { text, fileParts, userMessageSourceId } = extractUserInput(body.message);

  // 2. Resolve thread (create on first turn), load profile + prefs, build reminder.
  const thread = await ensureThreadExists(auth.supabase, clientId, body.threadId);
  const clientContext = await loadClientContext(auth.supabase, clientId);
  const reminder = await buildSystemReminder(auth.supabase, clientId);

  // 3. Persist user message (idempotent via source_event_id).
  await upsertMessage(auth.supabase, {
    thread_id: body.threadId,
    role: "user",
    content: text.length > 0 ? text : null,
    parts: body.message.parts as never,
    source_event_id: userMessageSourceId ?? `user:${crypto.randomUUID()}`,
  });

  // 4. Upload attachments (if any) and get/create the session with resources.
  const anthropic = getAnthropicClient();
  const uploads = fileParts.length > 0
    ? await uploadFilePartsToAnthropic(anthropic, fileParts)
    : [];
  const session = await getOrCreateSession({
    anthropic,
    supabase: auth.supabase,
    threadId: body.threadId,
    threadTitle: thread.title,
    initialResources: uploads.map((f) => ({
      type: "file",
      file_id: f.fileId,
      mount_path: `/mnt/session/uploads/${f.fileId}`,
    })),
  });

  // 5. Build kickoff content and send.
  const kickoff = buildKickoffContent({
    clientProfile: session.created ? clientContext.client_profile : null,
    userPreferences: session.created ? clientContext.user_preferences : null,
    systemReminder: reminder,
    userMessage: text,
    customizedSkillSlugs: await listCustomizedSkillSlugs(auth.supabase, clientId),
  });

  await anthropic.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: kickoff }],
  } as never);

  // 6. Fire the background persistence worker. Don't await it — it runs
  //    alongside the browser's /api/chat/stream subscription.
  persistTurnInBackground({
    anthropic,
    supabase: auth.supabase,
    clientId,
    threadId: body.threadId,
    sessionId: session.id,
    conversationInput: text,
  });

  return Response.json({ ok: true });
}
```

### Step 7.4: Implement `persistTurnInBackground`

This is where `finalizeRun` moves. Create `src/lib/managed-agents/persist-turn-in-background.ts` that:
1. Opens a **second** subscription to `iterateSessionEvents` (terminates on `status_idle` / `terminated`).
2. Accumulates events into `collectedEvents`.
3. On terminal, calls the existing `persistAssistantOutput`, `completeRun`, `runEvaluatorsForEvents`.
4. Catches errors, logs loud, marks the run failed.

Two subscribers on the same session is fine — Anthropic's streams are read-only fan-outs.

```ts
/**
 * Background worker: subscribes to a session after a user.message has been
 * sent, accumulates the resulting agent events, and on terminal state
 * persists the assistant turn, completes the run row, and runs evaluators.
 * Runs in parallel with any browser-side /api/chat/stream subscription.
 *
 * @module lib/managed-agents/persist-turn-in-background
 */
export async function persistTurnInBackground(input: {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  sessionId: string;
  conversationInput: string;
}): Promise<void> {
  // Fire-and-forget — caller doesn't await this.
  void (async () => {
    const runId = await createRunObservabilityRow(input.supabase, {
      threadId: input.threadId,
      clientId: input.clientId,
    });
    try {
      const events: AnthropicEvent[] = [];
      for await (const event of iterateSessionEvents(input.anthropic, input.sessionId)) {
        events.push(event);
        // iterateSessionEvents exits on status_idle / status_terminated — see its JSDoc.
      }
      await persistAssistantOutput({ /* ... */ events });
      await completeRun(input.supabase, { runId, status: "completed", /* ... */ });
      await runEvaluatorsForEvents(events, runId, input.supabase, {
        conversationInput: input.conversationInput,
      });
    } catch (error) {
      console.error("[persistTurnInBackground] failed", error);
      await completeRun(input.supabase, { runId, status: "failed", /* ... */ }).catch(() => {});
    }
  })();
}
```

**Important:** in serverless (Vercel Functions) a POST handler typically can't keep background work alive after the response is sent. You have two choices:
1. `await` the background worker inside the route handler (gives up the fire-and-forget latency win).
2. Use Vercel's `waitUntil` via `after()` from `next/server` (the modern App Router primitive). Look up the current API via context7: `query: "next.js after() route handler background work"`.

**Default to `after()`** — that's the correct primitive. If you can't find it, fall back to awaiting inside the handler; the latency win is secondary to correctness.

### Step 7.5: Run tests

```bash
pnpm vitest run app/api/chat/send
```

### Step 7.6: Smoke test end-to-end with curl

In one terminal, open the stream:
```bash
curl -N "http://localhost:3000/api/chat/stream?threadId=<t>" -H "Cookie: <auth>"
```

In another, send:
```bash
curl -X POST "http://localhost:3000/api/chat/send" -H "Cookie: <auth>" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"<t>","message":{"role":"user","parts":[{"type":"text","text":"hello"}]}}'
```

Expect: stream prints agent events; send returns `{"ok":true}` instantly.

### Step 7.7: Commit

```bash
git add app/api/chat/send/ \
        src/lib/managed-agents/persist-turn-in-background.ts \
        src/lib/chat/extract-user-input.ts
git commit -m "feat(chat-session): add POST /api/chat/send fire-and-forget endpoint"
```

---

## Task 8: Custom AI SDK Transport Behind a Feature Flag

**Why:** We need the browser's `useChat` to use `/api/chat/stream` and `/api/chat/send` instead of the default `POST /api/chat` transport. Do this behind a flag so we can roll back without reverting.

**Files:**
- Create: `src/components/chat/session-chat-transport.ts`
- Create: `src/components/chat/__tests__/session-chat-transport.test.tsx`
- Create: `src/lib/chat/session-transport-flag.ts`
- Modify: `src/components/chat/chat-panel.tsx`

### Step 8.1: Read the AI SDK v6 `ChatTransport` interface

Use context7 to look up the v6 `ChatTransport` contract. Specifically:
- How `sendMessage` is expected to return a stream.
- Whether the transport can be "pre-subscribed" (an always-open inbound stream).

```
context7 → resolve-library-id → "AI SDK"
context7 → query-docs → "ChatTransport interface custom transport sendMessages implementation returning a ReadableStream of UIMessageChunks"
```

Write down the interface shape before writing code — the rest of the task depends on it.

### Step 8.2: Implement `SessionChatTransport`

Sketch (adjust to match the real interface):

```ts
/**
 * Custom AI SDK v6 ChatTransport that talks to /api/chat/send + /api/chat/stream
 * instead of the default one-request/one-stream /api/chat. Opens the thread-level
 * SSE stream lazily on the first `sendMessages` call, then keeps it open for
 * the lifetime of the useChat instance.
 *
 * Two client-side patterns from the Vercel managed-agents starter are
 * included here:
 *
 * 1. **Event dedup** — a `Set<string>` tracks every event id we've already
 *    enqueued into the ReadableStream. When the EventSource reconnects
 *    (tab wake, network hiccup, server restart), the server may replay
 *    events the client already rendered. Without dedup, users see duplicate
 *    text blocks or tool calls. ~5 lines.
 *
 * 2. **Optimistic user messages** — `sendMessages` synchronously appends the
 *    user's message to the local message list before the POST returns, so
 *    the gap between "I pressed enter" and "my message appears" is zero.
 *    The optimistic entry is filtered out when the real `user.message`
 *    event arrives from the stream. ~10 lines.
 */
export class SessionChatTransport implements ChatTransport<UIMessage> {
  private streamController: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private upstream: ReadableStream<UIMessageChunk> | null = null;
  private sseAbort: AbortController | null = null;

  /** Event dedup — tracks ids already enqueued to avoid duplicates on reconnect. */
  private seenEventIds = new Set<string>();

  constructor(private readonly threadId: string) {}

  async sendMessages({ messages }: SendMessagesArgs): Promise<ReadableStream<UIMessageChunk>> {
    if (!this.upstream) this.openStream();
    const last = messages[messages.length - 1];
    // Fire-and-forget send.
    await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: this.threadId, message: last }),
    });
    return this.upstream!;
  }

  private openStream() {
    this.sseAbort = new AbortController();
    this.upstream = new ReadableStream<UIMessageChunk>({
      start: (controller) => { this.streamController = controller; },
      cancel: () => { this.sseAbort?.abort(); },
    });
    // Tail /api/chat/stream and enqueue chunks into the ReadableStream.
    fetch(`/api/chat/stream?threadId=${encodeURIComponent(this.threadId)}`, {
      signal: this.sseAbort.signal,
    }).then(async (res) => {
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      // Parse SSE events, dedup, and enqueue:
      //
      //   const event = parseSSE(line);
      //   if (event.id && this.seenEventIds.has(event.id)) continue;
      //   if (event.id) this.seenEventIds.add(event.id);
      //   this.streamController!.enqueue(event.chunk);
    });
  }
}
```

The exact shape depends on what v6's `ChatTransport` actually expects. Don't fake it — read the types in `node_modules/ai/dist/**`.

### Step 8.2a: Wire optimistic user messages in `chat-panel.tsx`

Optimistic messages live at the `useChat` call site, not in the transport — the transport doesn't own the message list, the hook does. In `chat-panel.tsx`, wrap the submit handler:

```tsx
const optimisticId = useRef<string | null>(null);

const handleSubmit = useCallback(async () => {
  // 1. Generate a temporary id and append the user message immediately.
  const tempId = `optimistic-${Date.now()}`;
  optimisticId.current = tempId;
  setMessages((prev) => [
    ...prev,
    { id: tempId, role: "user", content: inputValue, parts: [{ type: "text", text: inputValue }] },
  ]);

  // 2. Fire the real send (non-blocking relative to the UI update above).
  await append({ role: "user", content: inputValue });

  // 3. When the real user.message event arrives from the stream, filter
  //    out the optimistic entry. This happens in the stream consumer:
  //    setMessages(prev => prev.filter(m => m.id !== optimisticId.current));
}, [inputValue, append]);
```

The exact integration depends on how `useChat`'s `append` and `setMessages` interact with the custom transport. Read the AI SDK source for `useChat` before committing to a shape — the sketch above is directionally correct but may need adjustment.

### Step 8.2b: Write tests for event dedup and optimistic messages

Add to `src/components/chat/__tests__/session-chat-transport.test.tsx`:

```ts
describe("SessionChatTransport", () => {
  describe("event dedup", () => {
    it("drops events with an id already seen", () => {
      // Simulate two chunks with the same event id arriving (reconnect replay).
      // Assert only the first is enqueued into the ReadableStream.
    });

    it("passes through events with no id (heartbeats, status changes)", () => {
      // Events without an id field should never be deduped.
    });
  });
});

describe("optimistic user messages", () => {
  it("appends the user message to the list before the POST resolves", () => {
    // Call handleSubmit, assert messages contains the optimistic entry
    // before fetch has resolved.
  });

  it("removes the optimistic entry when the real user.message event arrives", () => {
    // Simulate stream delivering a user.message event.
    // Assert the optimistic-* id is gone and replaced by the real event.
  });
});
```

### Step 8.3: Wire the flag

`src/lib/chat/session-transport-flag.ts`:

```ts
/** `"legacy"` = POST /api/chat; `"session"` = send + stream. */
export type ChatTransportMode = "legacy" | "session";

export function resolveChatTransportMode(): ChatTransportMode {
  if (typeof window === "undefined") return "legacy";
  const override = window.localStorage.getItem("sunder_chat_transport");
  if (override === "legacy" || override === "session") return override;
  return process.env.NEXT_PUBLIC_CHAT_TRANSPORT_MODE === "session" ? "session" : "legacy";
}
```

Set `NEXT_PUBLIC_CHAT_TRANSPORT_MODE=legacy` in `.env.local` until you're ready to flip.

### Step 8.4: Update `chat-panel.tsx`

```tsx
const transport = useMemo(
  () =>
    resolveChatTransportMode() === "session"
      ? new SessionChatTransport(id)
      : new DefaultChatTransport({ api: "/api/chat" }),
  [id],
);
```

### Step 8.5: Manual browser test with the flag flipped on

```bash
pnpm dev
# In the browser devtools console:
localStorage.setItem("sunder_chat_transport", "session")
location.reload()
```

Send a few messages. Check:
- Network panel: `/api/chat/stream` open as long as the thread is visible.
- Network panel: each send is a small `POST /api/chat/send`.
- UI behavior: identical to the legacy transport.
- Send a second message while the first is still streaming. The second response appends instead of 409-ing.
- Click Stop — the agent halts.
- Navigate to another thread and back — the stream re-subscribes.
- **Optimistic messages:** user message appears in the chat immediately on enter, before the POST resolves. No flicker or double-render when the real event arrives.
- **Event dedup on reconnect:** throttle the network to "Slow 3G" in DevTools, let a response stream partially, then toggle online/offline to force a reconnect. Verify no duplicate text blocks or tool calls appear after reconnect.

### Step 8.6: Commit

```bash
git add src/components/chat/session-chat-transport.ts \
        src/components/chat/__tests__/session-chat-transport.test.tsx \
        src/lib/chat/session-transport-flag.ts \
        src/components/chat/chat-panel.tsx
git commit -m "feat(chat-session): custom useChat transport behind NEXT_PUBLIC_CHAT_TRANSPORT_MODE"
```

---

## Task 9: Delete the Run Lock and the Legacy Chat Path

**Why:** With the session transport stable, the per-thread run lock has no remaining purpose — the session itself serializes turns. The 409 "queued" return shape and the `create_run_if_idle` RPC become dead code. Delete them. Also delete the legacy `POST /api/chat` body; the route can become a redirect to the new send endpoint or be removed entirely.

**Only do this task after the session transport has been running on staging for at least a week with no regressions.** The rollback path for Tasks 5–8 is "flip the flag back to legacy"; this task removes that option.

**Files:**
- Modify: `src/lib/managed-agents/adapter.ts` — delete `runManagedAgent` and its queued shape
- Modify: `src/lib/runner/run-lifecycle.ts` — simplify `createRun` to a plain insert (no more `create_run_if_idle` RPC gating)
- Modify: `app/api/chat/route.ts` — delete the fresh-turn branch, keep only the approval-continuation branch if it's still in use, or delete the whole POST handler
- Modify: `src/components/chat/chat-panel.tsx` — remove the flag, default to the session transport
- Migration: drop the `create_run_if_idle` RPC if nothing else calls it (grep first)

### Step 9.1: Grep for every caller of the legacy path

```bash
# Run these via the Grep tool, not rg in Bash.
# - "runManagedAgent(" — should only be the legacy chat route
# - "create_run_if_idle" — should only be run-lifecycle + the RPC migration
# - "DefaultChatTransport" — should only be the chat-panel file
```

Document the results in the commit message. If anything unexpected calls `runManagedAgent`, **stop** — that caller needs to migrate to send + stream first.

### Step 9.2: Delete the legacy chat handler

```ts
// app/api/chat/route.ts
// Either:
export async function POST(): Promise<Response> {
  return new Response("Use /api/chat/send", { status: 410 });
}
// Or delete the file entirely if the approval-continuation logic has already
// moved into /api/chat/send.
```

Move the approval-continuation logic into `/api/chat/send` (it's already a user.tool_confirmation event — fits the "send" abstraction).

### Step 9.3: Delete `runManagedAgent` from the adapter

Keep `resumeManagedAgentFromApproval` only if it's still referenced elsewhere. Update imports; run `pnpm tsc --noEmit`.

### Step 9.4: Simplify `createRun`

```ts
// Before: calls create_run_if_idle RPC, returns { created, runId } discriminated union.
// After: plain insert into `runs`, returns the new run id.
export async function createRun(/* ... */): Promise<{ runId: string }> {
  const { data, error } = await supabase
    .from("runs")
    .insert({ thread_id, client_id, run_type, status: "running" })
    .select("run_id")
    .single();
  if (error) throw error;
  return { runId: data.run_id };
}
```

Update every caller. Run `pnpm tsc --noEmit`.

### Step 9.5: Drop the dead RPC migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_drop_create_run_if_idle.sql
drop function if exists public.create_run_if_idle;
```

Only do this after the grep in Step 9.1 confirms no other callers.

### Step 9.6: Remove the transport flag

Default `chat-panel.tsx` to `SessionChatTransport` unconditionally. Delete `session-transport-flag.ts` and `NEXT_PUBLIC_CHAT_TRANSPORT_MODE`. Don't leave dead flags lying around.

### Step 9.7: Run the full test suite

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm lint
```

### Step 9.8: Smoke test one more time end-to-end

- New thread → first message with a PDF attachment → agent responds.
- Send a second message mid-response → agent handles it.
- Click Stop → agent halts.
- Thread navigation → stream reconnects cleanly.
- Approval flow → still works.

### Step 9.9: Commit

```bash
git add -u
git commit -m "refactor(chat-session): delete legacy run lock and POST /api/chat path"
```

---

## Execution Notes

- **Frequent commits.** Every task has at least one commit. Many tasks have several. Don't let uncommitted work pile up — it makes bisects harder and rollbacks messier.
- **Run tests often.** `pnpm vitest run <path>` after every non-trivial change. Don't wait for a batch — the feedback loop is cheap.
- **Read first, write second.** Every parent task starts with "read these files." Don't skip it. The refactor touches implicit contracts; breaking one silently is easy.
- **Use the skills.** For test-driven discipline: `@1-test-driven-development`. Before claiming a task is done: `@1-requesting-code-review`. For systematic debugging if something breaks: `@1-systematic-debugging`.
- **Verify the docs.** The Managed Agents API is in beta. If something the plan says about the API contradicts what you see in the actual `@anthropic-ai/sdk` types, trust the SDK and update the plan. Use `context7` for AI SDK docs, `WebFetch` for Anthropic docs.
- **Don't silently expand scope.** If you find unrelated bugs, note them in `docs/tasks/` as a new tasklist or a TODO in the commit message. Fixing them in-place bloats the PR.

---

## Exit Criteria

You know this refactor is done when:

1. Sending two messages in rapid succession on the same thread both get answered — no 409, no dropped turn.
2. Clicking the Stop button while the agent is running halts it cleanly.
3. Navigating between threads reconnects the stream without losing events.
4. The Network panel shows exactly one `/api/chat/stream` open per visible thread, and each send is a small `POST /api/chat/send` returning in <100ms.
5. `grep -r "create_run_if_idle"` returns nothing except the drop migration.
6. `grep -r "queued"` in the managed-agents code returns nothing.
7. `pnpm vitest run` is green. `pnpm tsc --noEmit` is green. `pnpm lint` is green.
