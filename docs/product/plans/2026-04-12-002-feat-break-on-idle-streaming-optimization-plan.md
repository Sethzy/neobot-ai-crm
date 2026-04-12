---
title: "feat: Break-on-idle streaming optimization"
type: feat
status: active
date: 2026-04-12
---

# Break-on-idle streaming optimization

## Overview

Change the session SSE streaming architecture from "loop forever" to "break on idle." The Vercel function for `GET /api/chat/stream` currently stays alive for up to 300s across turns, burning compute during idle periods (between turns, during approval waits). The Anthropic docs and cookbooks show a per-turn pattern: open stream, consume until `session.status_idle`, close. We should match this.

## Problem Statement

The `GET /api/chat/stream` endpoint uses `iterateSessionEventsForever`, which restarts after every terminal event (end_turn, requires_action, retries_exhausted). The Vercel function stays alive:

- **Between turns** (user typing) — 30s to minutes of idle compute
- **During approval waits** (user deciding) — potentially minutes
- **On idle threads** (session not running) — up to 300s maxDuration

At scale, this adds up. Anthropic's own reference implementations ([cookbook](https://platform.claude.com/cookbook/managed-agents-slack-data-bot), [docs](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)) break on `session.status_idle`. The session sits idle for free on Anthropic's side.

## Proposed Solution

Two coordinated changes:

1. **Server:** Stream endpoint breaks after emitting `finish` chunk. Function dies.
2. **Client:** `SessionChatTransport` distinguishes clean close (turn ended) from dirty close (network error). Only auto-reconnects on dirty close. Reconnects lazily on next `sendMessages()`.

## Technical Approach

### Phase 1: Stream endpoint — break on idle

**File:** `app/api/chat/stream/route.ts`

The stream route already emits a `finish` chunk on terminal events but continues looping. Add `return` after the finish write to close the stream:

```typescript
// Before (loop continues):
if (reason === "end_turn" || reason === "retries_exhausted" || reason === "requires_action") {
  writer.write({ type: "finish", finishReason: ... } as never);
}

// After (stream closes):
if (reason === "end_turn" || reason === "retries_exhausted" || reason === "requires_action") {
  writer.write({ type: "finish", finishReason: ... } as never);
  return; // exit execute callback → closes UIMessageStream → SSE response ends → function dies
}
```

Breaking a `for await` loop or returning from the `execute` callback terminates the generator via `return()`, cleaning up the Anthropic SSE subscription.

**No changes to `session-reconnect.ts`.** The `iterateSessionEventsForever` function is still available for other consumers; the stream route just stops using the "forever" behavior by returning early.

### Phase 2: Transport — idle-aware reconnect

**File:** `src/components/chat/session-chat-transport.ts`

#### New state: `turnComplete`

```typescript
private turnComplete: boolean = false;
```

#### `handleSseEvent` — mark turn complete on finish

```typescript
// Existing finish handling (closes per-turn ReadableStream):
if (parsed.type === "finish") {
  // ... existing close logic ...
  this.turnComplete = true; // NEW
}
```

#### `consumeSse` — suppress reconnect after clean close

The `finally` block currently always calls `scheduleReconnect()`. Gate it:

```typescript
finally {
  this.sseConnected = false;
  if (this.alive && !signal.aborted && !this.turnComplete) {
    // Dirty close (network error, Vercel restart mid-stream) — reconnect
    this.scheduleReconnect();
  }
  // Clean close (turn ended) — stay idle until next sendMessages()
}
```

#### `sendMessages` — reconnect on demand

Before awaiting `sseReady`, check if the SSE needs reopening:

```typescript
async sendMessages(options) {
  // If SSE is dead (clean close from prior turn), reopen it
  if (!this.sseConnected && this.turnComplete) {
    this.turnComplete = false;
    this.openStream(); // sets new sseReady promise, starts consumeSse
  }
  await this.sseReady;
  // ... existing POST logic ...
}
```

The `openStream()` call uses `_lastFinalizedId` as the `afterId` cursor, so the new stream endpoint tails from the correct position.

### Phase 3 (optional): Deferred initial SSE open

Currently the constructor opens SSE eagerly:

```typescript
constructor(chatId: string) {
  // ...
  this.openStream(); // eager — opens SSE immediately
}
```

For idle threads (no active turn), this wastes a function invocation. Could defer to first `sendMessages()` call. **Not required for the core optimization** — the main savings come from closing between turns and during approval waits. Track as a follow-up if initial-load waste becomes significant.

## System-Wide Impact

### Interaction graph

```
User sends message
  → transport.sendMessages()
    → if (!sseConnected && turnComplete): openStream() → await sseReady
    → POST /api/chat/send → events.send(user.message)
    → background worker persists turn via openSessionTail (unchanged)
  → GET /api/chat/stream picks up events from Anthropic session
    → forwards as UIMessageChunks via SSE
    → on session.status_idle: emit finish → return → function dies
  → transport receives finish → turnComplete = true → no reconnect
  → user sees response complete
```

### Error propagation

- **Dirty SSE close** (network error mid-stream): `turnComplete` is false → auto-reconnect fires (existing behavior, unchanged)
- **Vercel function restart** (maxDuration, deploy): same as dirty close — `turnComplete` stays false → reconnect → cursor dedup prevents duplicates
- **Anthropic session error**: `session.status_terminated` or `session.error` → stream route handles as before → browser sees error → function dies
- **Send endpoint failure**: independent of stream lifecycle — fails with HTTP error, stream unaffected

### State lifecycle risks

- **Lost events between turn end and next open**: No risk. Events persist in the Anthropic session. Next `openSessionTail(afterId)` replays from cursor. Background worker in send route also persists independently.
- **Race: user sends before SSE reconnects**: `sendMessages()` awaits `sseReady` — the POST only fires after SSE headers are received. Subscribe-before-send preserved.
- **Race: server closes SSE while client reads last chunks**: SSE is a one-way stream. Server writes finish, then closes. Client reads finish from buffer, processes it, sets `turnComplete`. Clean.

### What doesn't change

- `POST /api/chat/send` — fire-and-forget, returns immediately. Background persistence via `openSessionTail` + `after()` is independent of the stream endpoint.
- `useAutoResume` — polls DB directly, independent of SSE state.
- `iterateSessionEventsForever` in `session-reconnect.ts` — still available, just not relied on by the stream endpoint to loop.
- Telegram webhook — calls `runManagedAgent` directly, never touches the stream endpoint.
- Tool-confirm route — calls `resumeManagedAgentFromApproval` directly, never touches the stream endpoint.
- Cursor-based dedup — `afterId` + `seenSourceEventIds` work identically across reconnects.

## Acceptance Criteria

### Functional Requirements

- [ ] Normal turn: send → stream → finish → SSE closes → function dies → send again works
- [ ] Approval turn: send → stream → requires_action → finish → SSE closes → user clicks approve → SSE reconnects → stream → finish → SSE closes
- [ ] Dirty close: network error mid-stream → auto-reconnect with cursor → no lost events
- [ ] Tab wake: SSE was closed (clean or dirty) → reconnects on next interaction → cursor dedup prevents duplicates
- [ ] Auto-resume: still works (polls DB, independent of SSE)
- [ ] Multiple turns in quick succession: each turn opens/closes SSE cleanly

### Non-Functional Requirements

- [ ] Zero Vercel function compute during idle periods (between turns, approval waits)
- [ ] No user-visible latency increase on send (SSE reconnect < 200ms typical)
- [ ] No regression in streaming reliability (same dedup, same cursor tracking)

### Quality Gates

- [ ] `pnpm vitest run` — all tests pass
- [ ] `pnpm tsc --noEmit` — no type errors
- [ ] Manual test: send message, verify SSE closes after response, send again
- [ ] Manual test: trigger approval, verify SSE closes, approve, verify SSE reconnects

## Sources & References

### Internal References

- Stream endpoint: `app/api/chat/stream/route.ts`
- Transport: `src/components/chat/session-chat-transport.ts`
- Reconnect layer: `src/lib/managed-agents/session-reconnect.ts`
- Send endpoint: `app/api/chat/send/route.ts`
- Stream forwarder: `src/lib/managed-agents/session-stream-forwarder.ts`
- Auto-resume: `src/hooks/use-auto-resume.ts`
- Managed agents patterns: `docs/product/plans/2026-04-10-managed-agents-h3-adapter-dispatcher-handover.md` (skill sections)

### External References

- Anthropic streaming docs: https://platform.claude.com/docs/en/managed-agents/events-and-streaming
- Anthropic Slack bot cookbook: https://platform.claude.com/cookbook/managed-agents-slack-data-bot
- Anthropic production patterns cookbook: https://platform.claude.com/cookbook/managed-agents-cma-operate-in-production
