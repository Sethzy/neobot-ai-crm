# Code Review Fixes — Atomic Mappings, Immediate Reconciliation, State Cleanup

**Date:** 2026-03-04
**Scope:** Fix 6 code review findings using Dorabot + Chat SDK patterns
**Method:** TDD (RED → GREEN → REFACTOR → VERIFY)

---

## PR-F1: Atomic channel mapping (Findings 1 + 2)

### F1-a: Make `upsertExternalConversationThreadMap` atomic + immutable

- [x] RED: Test that concurrent inserts for same scope resolve to first-write-wins thread_id
- [x] RED: Test that insert for existing mapping does NOT overwrite thread_id
- [x] RED: Test that insert for new mapping creates successfully
- [x] GREEN: Replace check-then-insert with `INSERT ... ON CONFLICT DO NOTHING` + SELECT returning winner
- [x] REFACTOR: Rename function to `ensureExternalConversationMapping` (no longer upserts)
- [x] VERIFY: All channel-routing tests pass

### F1-b: Update `processInboundMessage` to use winning thread_id from atomic mapping

- [x] RED: Test that when mapping already exists with different thread, canonical thread follows existing mapping
- [x] GREEN: Use returned thread_id from `ensureExternalConversationMapping` as canonical
- [x] VERIFY: All process-inbound-message tests pass

---

## PR-F2: Immediate URL reconciliation (Finding 3)

- [x] RED: Test that `onCanonicalThreadId` fires immediately when `x-thread-id` header differs from chatId, not in onFinish
- [x] RED: Test that `onCanonicalThreadId` fires for non-streaming responses (queued/duplicate)
- [x] GREEN: Move reconciliation from `onFinish` to custom fetch wrapper
- [x] REFACTOR: Remove `pendingCanonicalThreadId` ref (no longer needed)
- [x] VERIFY: All chat-panel tests pass

---

## PR-F3: Remove activeThreadId/selectThread dual state (Finding 4)

- [x] RED: Test that ThreadContext no longer exposes `activeThreadId` or `selectThread`
- [x] GREEN: Remove `activeThreadId` state and `selectThread` from ThreadContext
- [x] GREEN: Update any consumers that reference `activeThreadId` or `selectThread`
- [x] VERIFY: All thread-context, sidebar, and chat-thread-page-client tests pass

---

## PR-F4: Draft page stuck state + channel constraint (Findings 5 + 6)

### F4-a: Draft page error recovery

- [x] RED: Test that isCreating resets on navigation error
- [x] GREEN: Add try/catch around router.push with isCreating reset
- [x] VERIFY: Chat page tests pass

### F4-b: Channel CHECK constraint migration

- [x] Write migration: `ALTER TABLE ... ADD CONSTRAINT ... CHECK (channel IN ('web', 'telegram', 'whatsapp'))`
- [x] Apply to both tables (mappings + delivery_receipts)
- [x] VERIFY: Migration applies cleanly

---

## Final

- [x] Full test suite green (17 pre-existing failures in unrelated CRM/analyst/runner tests)
- [x] Commit: `fix(pr-f1-f4): atomic mappings, immediate reconciliation, state cleanup`
