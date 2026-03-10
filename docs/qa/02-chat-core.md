# QA Surface 2: Chat Core

> **PRs covered:** 1 (gateway + streaming), 2 (chat UI), 3 (DB schema + persistence), 4 (runner + queue)
> **Dogfoodable:** Yes
> **Time estimate:** 20-25 min manual

---

## Prerequisites

- Logged in as a test user with a `clients` row
- `.env` has `AI_GATEWAY_API_KEY` set (Vercel AI Gateway)
- Runner is functional (Gemini Flash responding)

---

## Dogfood Checklist (automated browser pass)

- [ ] `/chat` loads without console errors
- [ ] Sidebar shows thread rail (thread list + new thread button)
- [ ] New thread button creates a thread
- [ ] Chat input box is visible and focusable
- [ ] Typing and submitting a message works
- [ ] Response streams in token-by-token (not all at once)
- [ ] Message bubbles render: user on right, assistant on left
- [ ] Thread title appears in sidebar after first exchange
- [ ] Responsive: chat works on mobile viewport (375px) — sidebar collapses, input stays visible

---

## Manual QA Scenarios

### 2.1 Basic conversation (happy path)

1. Click "New Thread" in sidebar
2. Type: **"Hello, what can you help me with?"**
3. Press Enter
4. **Expected:** Message appears as user bubble immediately
5. **Expected:** Assistant response streams in (tokens appear progressively)
6. **Expected:** After response completes, thread title appears in sidebar (agent auto-titles via `rename_chat`)
7. Send a follow-up: **"Tell me more about CRM features"**
8. **Expected:** Response references the context of the first message (conversation continuity)

**Notes / failures:**

---

### 2.2 Message persistence across refresh

1. Have a conversation with 3+ messages in a thread
2. Note the thread title and last message content
3. Hard refresh the page (Cmd+R / Ctrl+R)
4. **Expected:** Same thread is selected, all messages restored from DB
5. **Expected:** Messages appear in correct order with correct roles
6. Navigate away to `/crm`, then back to `/chat`
7. **Expected:** Thread and messages still intact

**Notes / failures:**

---

### 2.3 Multiple threads

1. Create Thread A, send a message about "property at Orchard Road"
2. Create Thread B, send a message about "insurance policy"
3. Switch back to Thread A
4. **Expected:** Thread A shows only the Orchard Road conversation
5. Switch to Thread B
6. **Expected:** Thread B shows only the insurance conversation
7. **Expected:** Both threads visible in sidebar with distinct titles

**Notes / failures:**

---

### 2.4 Thread queue / serialization

1. Open a thread
2. Send a message that will trigger a long response (e.g., "Write me a detailed market analysis for District 10")
3. While the response is still streaming, send another message: "Also include rental yields"
4. **Expected:** Second message is queued (appears in UI but doesn't interrupt first response)
5. **Expected:** After first response completes, second message is processed automatically
6. **Verify in Supabase:** `thread_queue_records` shows the queued message was drained

**Notes / failures:**

---

### 2.5 Empty state

1. Create a brand new thread (no messages)
2. **Expected:** Empty state shows suggestion chips / template prompts (from PR 20a)
3. Click a suggestion chip
4. **Expected:** Text pre-fills in composer (does NOT auto-send)

**Notes / failures:**

---

### 2.6 Long message handling

1. Paste a very long message (500+ words)
2. **Expected:** Input area expands or scrolls, message sends successfully
3. **Expected:** Agent responds to the full content (not truncated)

**Notes / failures:**

---

## Edge Cases

- [ ] Send empty message (just whitespace) — should be prevented or handled gracefully
- [ ] Rapid-fire 5 messages in < 2 seconds — queue handles without crashes
- [ ] Network interruption mid-stream — graceful error, not infinite spinner
- [ ] Very long assistant response (1000+ words) — renders without layout break
- [ ] Unicode / emoji in messages — renders correctly
- [ ] Thread with 50+ messages — scroll behavior works, no performance degradation

---

## Pass / Fail Criteria

- **Pass:** Can create threads, send messages, get streaming responses, switch between threads, and all messages persist across refresh. Queue handles concurrent messages.
- **Fail:** Messages lost on refresh, responses don't stream, thread switching corrupts history, queue deadlocks.
