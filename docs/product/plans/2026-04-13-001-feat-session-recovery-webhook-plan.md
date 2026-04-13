---
title: "feat: Session recovery via Anthropic webhook"
type: feat
status: active
date: 2026-04-13
origin: docs/product/ideations/2026-04-13-session-recovery-webhook-requirements.md
---

# feat: Session recovery via Anthropic webhook

## Overview

When a built-in agent tool hangs long enough to exceed the Vercel function timeout (300s), the SSE stream dies, the assistant message is never persisted, and the run is stuck in "running." This plan adds an Anthropic `session.status_idled` webhook as a server-side safety net, plus a minimal client-side change so the recovered message appears without a page refresh.

(see origin: `docs/product/ideations/2026-04-13-session-recovery-webhook-requirements.md`)

## Proposed Solution

Two layers:

1. **Server: Webhook handler** — receives `session.status_idled` from Anthropic, checks if the run was finalized, and if not, fetches events and persists. Includes a one-line `session_id` backfill in the adapter for lookup.
2. **Client: Extend auto-resume** — when the stream errors mid-turn, trigger the existing `useAutoResume` polling loop (same code, just a new trigger). Extend its timeout from 120s to 30 minutes. When the webhook persists the message, the next poll finds it.

No new Realtime subscriptions, no new client state machines, no recovery indicator component.

## Acceptance Criteria

- [ ] Webhook handler at `app/api/webhooks/anthropic/route.ts` receives `session.status_idled`, verifies HMAC, and recovers orphaned runs
- [ ] All webhook persistence is idempotent — safe to run concurrently with or after the SSE handler
- [ ] When SSE stream dies mid-turn, auto-resume polling kicks in and picks up the webhook-persisted message without page refresh
- [ ] Webhook skips `requires_action` sessions (approval path owns those)
- [ ] Tests for webhook verification, recovery logic, and route handler

## MVP

### Phase 1: session_id backfill (one line)

**File: `src/lib/managed-agents/adapter.ts` ~line 486**

After `sessionId = session.id;`, add:

```ts
await input.supabase.from("runs").update({ session_id: sessionId }).eq("run_id", runId);
```

Column already exists (migration `20260410100000`). Chat adapter just never writes it.

### Phase 2: Webhook HMAC verification

**File: CREATE `src/lib/managed-agents/webhook-verify.ts`**

Standard Webhooks spec (Svix). Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`. Signed content: `${webhookId}.${timestamp}.${rawBody}`. Secret is `whsec_`-prefixed base64.

```ts
export function verifyWebhookSignature(
  rawBody: string,
  headers: { "webhook-id": string; "webhook-timestamp": string; "webhook-signature": string },
  secret: string,
): boolean
```

### Phase 3: Recovery logic

**File: CREATE `src/lib/managed-agents/recover-orphaned-run.ts`**

Follows the pattern from `finalize-trigger-run.ts`. Reuses existing functions:

| Function | Import from |
|----------|-------------|
| `buildAssistantPartsFromEvents()` | `./events-to-assistant-parts` |
| `pickSourceEventId()` | `./source-event-id` |
| `getAssistantTextFromParts()` | `@/lib/runner/message-utils` |
| `upsertMessage()` | `@/lib/chat/messages` |
| `downloadSessionFiles()` | `./download-session-files` |
| `deliverToExternalChannels()` | `@/lib/channels/deliver` |
| `accumulateModelUsage()`, `computeTurnCost()` | `./adapter-cost` |
| `completeRun()` | `@/lib/runner/run-lifecycle` |

```ts
export async function recoverOrphanedRun(input: {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
  run: { runId: string; threadId: string; clientId: string; sessionId: string; model: string };
  stopReasonType: string;
}): Promise<{ recovered: boolean; reason: string }>
```

Flow:
1. If `stopReasonType === "requires_action"` → skip (approval pause)
2. Fetch events via `anthropic.beta.sessions.events.list(sessionId)`
3. Extract current turn (from last `user.message` onward)
4. Download session files, build parts, persist via `upsertMessage()` (idempotent)
5. Compute cost, `completeRun()` (try-catch — no-op if SSE already completed)

### Phase 4: Webhook route

**File: CREATE `app/api/webhooks/anthropic/route.ts`**

Follows the Telegram webhook pattern: validate signature, parse body, fire background work via `after()`, return 200 immediately.

```ts
export async function POST(request: Request): Promise<Response> {
  // 1. Verify HMAC
  // 2. If not session.status_idled → return 200
  // 3. SELECT * FROM runs WHERE session_id = ? AND status = 'running'
  // 4. If no running run → return 200 (already finalized)
  // 5. after(() => recoverOrphanedRun(...))
  // 6. Return 200
}
```

**File: MODIFY `src/lib/env.ts`** — add `ANTHROPIC_WEBHOOK_SECRET: z.string().min(1).optional()`

### Phase 5: Client — extend auto-resume to trigger on stream error

**File: MODIFY `src/hooks/use-auto-resume.ts`**

Change `MAX_POLL_DURATION_MS` from `120_000` to `1_800_000` (30 minutes).

**File: MODIFY `src/components/chat/chat-panel.tsx`**

Add a `useEffect` that triggers auto-resume when the stream errors mid-turn:

```ts
const wasStreamingRef = useRef(false);
const [streamErrorRecovery, setStreamErrorRecovery] = useState(false);

useEffect(() => {
  if (status === "streaming") wasStreamingRef.current = true;
}, [status]);

// When useChat reports an error after we were streaming, trigger recovery polling
useEffect(() => {
  if (error && wasStreamingRef.current) {
    setStreamErrorRecovery(true);
    wasStreamingRef.current = false;
  }
}, [error]);
```

Pass `streamErrorRecovery` into `useAutoResume` as an additional trigger alongside `autoResume`. The hook already polls the DB for the assistant message and injects it via `setMessages` — no new logic needed.

### Phase 6: Tests

| File | Tests |
|------|-------|
| `src/lib/managed-agents/__tests__/webhook-verify.test.ts` | Valid/invalid sig, expired timestamp, missing headers, key rotation |
| `src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts` | Happy path, no events, requires_action skip, idempotent upsert, completeRun race |
| `app/api/webhooks/anthropic/__tests__/route.test.ts` | Sig verification, no-op for finalized runs, recovery trigger |

## System-Wide Impact

- **No changes to SSE streaming path.** Session runner, adapter, stream forwarder untouched.
- **One-line adapter change.** `UPDATE runs SET session_id` after session creation.
- **Auto-resume timeout extended.** From 120s to 30 minutes. No impact on the happy path — polling exits immediately when the assistant message is found.
- **No new Realtime subscriptions.** Just polling (existing pattern).

## Dependencies & Risks

- **Manual Console setup:** Register webhook URL + store `whsec_` secret. One-time step.
- **Webhook payload shape:** Confirm exact field names against a real delivery.
- **30-min auto-resume timeout:** On the happy path, polling finds the message on the first poll (already persisted by SSE handler) and exits. The 30-min ceiling only matters for the recovery case. Cost: one DB query every 2s while recovering — negligible.

## Sources & References

- **Origin document:** [docs/product/ideations/2026-04-13-session-recovery-webhook-requirements.md](../ideations/2026-04-13-session-recovery-webhook-requirements.md)
- Anthropic production cookbook webhook pattern: `CMA_operate_in_production.ipynb`
- Trigger finalization analog: `src/lib/managed-agents/finalize-trigger-run.ts:152-227`
- Telegram webhook pattern: `app/api/webhook/telegram/route.ts`
- Session ID gap: `src/lib/managed-agents/adapter.ts:485`
- Auto-resume hook: `src/hooks/use-auto-resume.ts`
- Adapter cost utilities: `src/lib/managed-agents/adapter-cost.ts`
