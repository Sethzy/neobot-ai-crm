---
title: "feat: Session recovery via Anthropic webhook"
type: feat
status: active
date: 2026-04-13
origin: docs/product/ideations/2026-04-13-session-recovery-webhook-requirements.md
---

# feat: Session recovery via Anthropic webhook

## Overview

When a built-in agent tool hangs long enough to exceed the Vercel function timeout (300s), the SSE stream dies, the assistant message is never persisted, and the run is stuck in "running." This plan adds an Anthropic `session.status_idled` webhook as a server-side safety net, plus a client-side recovery UX that auto-transitions to a "still working" state and receives the recovered message via Supabase Realtime.

(see origin: `docs/product/ideations/2026-04-13-session-recovery-webhook-requirements.md`)

## Proposed Solution

Three layers, each independent and additive:

1. **Server: Webhook handler** — receives `session.status_idled` from Anthropic, checks if the run was finalized, and if not, fetches events and persists.
2. **Server: session_id backfill** — writes `session_id` to the `runs` table so the webhook can look up orphaned runs.
3. **Client: Recovery UX** — detects stream death, shows "still working" indicator, subscribes to Supabase Realtime, injects the recovered message when it arrives.

## Acceptance Criteria

- [ ] R1: Webhook handler at `app/api/webhooks/anthropic/route.ts` receives `session.status_idled`, verifies HMAC, and recovers orphaned runs
- [ ] R2: All webhook persistence is idempotent — safe to run concurrently with or after the SSE handler
- [ ] R3: Chat UI auto-transitions to "still working" state when SSE stream drops unexpectedly
- [ ] R4: Recovered message delivered to browser via Supabase Realtime (existing subscription extended)
- [ ] R5: 30-minute client-side timeout before showing failure state
- [ ] R6: Navigate-away recovery handled by existing `useAutoResume` (no new work)
- [ ] R7: Webhook skips `requires_action` sessions (approval path owns those)
- [ ] Tests for webhook verification, recovery logic, and route handler

## MVP

### Phase 1: Server-side — session_id backfill

**File: `src/lib/managed-agents/adapter.ts` ~line 486**

After `sessionId = session.id;`, add:

```ts
// Backfill session_id on run record for webhook recovery lookup
await input.supabase
  .from("runs")
  .update({ session_id: sessionId })
  .eq("run_id", runId);
```

The `runs.session_id` column already exists (migration `20260410100000`). The chat adapter just never writes it — only the trigger path does.

### Phase 2: Server-side — webhook HMAC verification

**File: CREATE `src/lib/managed-agents/webhook-verify.ts`**

Anthropic uses the Standard Webhooks spec (Svix). Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`. Signed content: `${webhookId}.${timestamp}.${rawBody}`. Secret is `whsec_`-prefixed base64.

```ts
export function verifyWebhookSignature(
  rawBody: string,
  headers: { "webhook-id": string; "webhook-timestamp": string; "webhook-signature": string },
  secret: string,
): boolean
```

- Strip `whsec_` prefix, base64-decode secret
- HMAC-SHA256 over `${webhookId}.${timestamp}.${rawBody}`
- Timing-safe compare against each `v1,<sig>` in the signature header
- Reject timestamps older than 5 minutes (replay protection)

### Phase 3: Server-side — recovery logic

**File: CREATE `src/lib/managed-agents/recover-orphaned-run.ts`**

Follows the pattern from `finalize-trigger-run.ts` (see origin: R1). Reuses:

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
2. Fetch all events via `anthropic.beta.sessions.events.list(sessionId)`
3. Extract current turn: find last `user.message`, take everything after it
4. Download session files via `downloadSessionFiles()`
5. Build parts via `buildAssistantPartsFromEvents()`
6. Persist via `upsertMessage()` (idempotent on `source_event_id`)
7. Deliver to external channels
8. Extract usage from `span.model_request_end` events, compute cost
9. `completeRun()` — wrapped in try-catch (no-op if SSE handler already completed)

### Phase 4: Server-side — webhook route

**File: CREATE `app/api/webhooks/anthropic/route.ts`**

Follows the Telegram webhook pattern (`app/api/webhook/telegram/route.ts`): validate signature, parse body, fire background work via `after()`, return 200 immediately.

```ts
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  // 1. Read raw body, verify HMAC
  // 2. Parse payload — if not session.status_idled, return 200
  // 3. Look up run: SELECT * FROM runs WHERE session_id = ? AND status = 'running'
  // 4. If no running run → return 200 (already finalized)
  // 5. after(() => recoverOrphanedRun(...))
  // 6. Return 200
}
```

Uses `createAdminClient()` (service-role, no user session) and `getAnthropicClient()`.

**File: MODIFY `src/lib/env.ts`**

Add to `serverEnvSchema`:
```ts
ANTHROPIC_WEBHOOK_SECRET: z.string().min(1).optional(),
```

### Phase 5: Client-side — recovery UX

**File: MODIFY `src/components/chat/chat-panel.tsx`**

The chat panel already has a Realtime subscription on `conversation_messages` for background-job messages (lines 166-216). The recovery extends this:

**5a. Detect stream death:**

The `useChat` hook exposes `error` and `status`. When `status` transitions from `"streaming"` to anything while `error` is set (and no clean terminal was received), we know the stream broke.

Add a `isRecovering` state:
```ts
const [isRecovering, setIsRecovering] = useState(false);

// In onError callback:
onError: (err) => {
  refreshQuota();
  // If we were streaming (not a pre-flight error), enter recovery
  if (wasStreaming.current) {
    setIsRecovering(true);
  }
},
```

Track `wasStreaming` via a ref updated when `status === "streaming"`.

**5b. Extend existing Realtime subscription:**

The existing subscription at lines 166-216 already listens for `INSERT` on `conversation_messages` filtered by `thread_id`. Currently it only handles `isBackgroundJob` messages. Extend it to also handle recovery messages:

```ts
// Inside the existing .on('postgres_changes', ...) callback:
if (isRecovering && newRow.role === "assistant") {
  const normalized = mapDbMessageToUiMessage(newRow);
  setMessages((prev) => {
    if (prev.some((m) => m.id === normalized.id)) return prev;
    return [...prev, normalized];
  });
  setIsRecovering(false);
  return;
}
```

No new subscription needed — just widen the existing one.

**5c. Recovery indicator UI:**

When `isRecovering` is true, show a subtle indicator instead of the error banner:

```tsx
{isRecovering ? (
  <div className="mx-auto mt-3 flex w-full max-w-2xl items-center gap-2 rounded-md border border-muted px-3 py-2 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <p>Claude is still working on this — results will appear shortly</p>
  </div>
) : error ? (
  // existing error banner
) : null}
```

**5d. 30-minute timeout:**

```ts
useEffect(() => {
  if (!isRecovering) return;
  const timer = setTimeout(() => {
    setIsRecovering(false);
    // error state will show the failure banner
  }, 30 * 60 * 1000);
  return () => clearTimeout(timer);
}, [isRecovering]);
```

### Phase 6: Tests

| File | Tests |
|------|-------|
| `src/lib/managed-agents/__tests__/webhook-verify.test.ts` | Valid/invalid sig, expired timestamp, missing headers, key rotation |
| `src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts` | Happy path, no events, requires_action skip, idempotent upsert, completeRun race |
| `app/api/webhooks/anthropic/__tests__/route.test.ts` | Sig verification, no-op for finalized runs, recovery trigger |

## System-Wide Impact

- **No changes to SSE streaming path.** The session runner, adapter, and stream forwarder are untouched.
- **No changes to session creation.** The only adapter change is a single `UPDATE runs SET session_id` after line 485.
- **Realtime subscription widened.** The existing `conversation_messages` subscription in `chat-panel.tsx` handles one more case (recovered messages). No new channel.
- **Idempotency is the safety mechanism.** `upsertMessage` on `(thread_id, source_event_id)` prevents duplicate messages even if both SSE and webhook persist simultaneously.

## Dependencies & Risks

- **Manual Console setup:** Webhook URL + `whsec_` secret must be registered in Anthropic Console. This is a one-time step, not automatable via API.
- **Webhook payload shape:** The exact field names for `session.status_idled` need to be confirmed against a real delivery. The Standard Webhooks spec gives us the envelope; the inner payload structure follows Anthropic's event types.
- **`after()` timeout:** Next.js `after()` runs in the same function invocation. If recovery takes >120s (maxDuration), it could be killed. Unlikely — fetching events + persisting is fast.

## Sources & References

- **Origin document:** [docs/product/ideations/2026-04-13-session-recovery-webhook-requirements.md](../ideations/2026-04-13-session-recovery-webhook-requirements.md) — key decisions: webhook over workflow, Realtime over polling, static inject, 30-min timeout, session_id backfill
- Anthropic production cookbook webhook pattern: `CMA_operate_in_production.ipynb`
- Existing Realtime subscription: `src/components/chat/chat-panel.tsx:166-216`
- Trigger finalization analog: `src/lib/managed-agents/finalize-trigger-run.ts:152-227`
- Telegram webhook pattern: `app/api/webhook/telegram/route.ts`
- Session ID gap: `src/lib/managed-agents/adapter.ts:485` (sessionId assigned, never written to runs)
- Adapter cost utilities: `src/lib/managed-agents/adapter-cost.ts`
