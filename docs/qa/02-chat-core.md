# QA Surface 2: Chat Core

> **PRs covered:** 1 (gateway + streaming), 2 (chat UI), 3 (DB schema + persistence), 4 (runner + queue), 16 (model selector)
> **Dogfoodable:** Yes
> **Time estimate:** 25-30 min manual

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
- [ ] Model selector button visible in composer toolbar (shows default model name)
- [ ] Model selector dialog opens, shows models grouped by provider, search filters work
- [ ] Selecting a model updates the button label and persists across page refresh

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

### PR 16: Model Selector

### 2.7 Model picker — display and selection

1. Open `/chat` (new thread)
2. **Expected:** Model selector button visible in chat composer toolbar (shows "Gemini Flash 3" by default)
3. Click the model selector button
4. **Expected:** Dialog opens with search input and grouped model list (Google, MiniMax)
5. Type "Mini" in the search field
6. **Expected:** MiniMax M2.7 appears, other models filtered out
7. Click MiniMax M2.7
8. **Expected:** Dialog closes, button now shows "MiniMax M2.7"

**Notes / failures:**

---

### 2.8 Model picker — cookie persistence

1. Select MiniMax M2.7 in the model picker
2. Hard refresh the page (Cmd+R)
3. **Expected:** Model selector still shows "MiniMax M2.7" (persisted via cookie)
4. Click "New Thread" in sidebar
5. **Expected:** New thread also shows "MiniMax M2.7" (cookie carries across threads)
6. Open browser devtools → Application → Cookies
7. **Expected:** `chat-model` cookie exists with value `minimax/minimax-m2.7`, max-age ~1 year

**Notes / failures:**

---

### 2.9 Model picker — per-message model execution

1. Select Gemini Flash 3, send: **"What model are you?"**
2. **Expected:** Response comes from Gemini (check Langfuse trace: model_id = `google/gemini-3-flash`)
3. Switch to MiniMax M2.7, send: **"What model are you now?"**
4. **Expected:** Response comes from MiniMax (check Langfuse trace: model_id = `minimax/minimax-m2.7`)
5. **Verify in Supabase:** `agent_runs` table shows both model IDs for the same thread

**Notes / failures:**

---

### 2.10 Model selector — queued message preserves model

1. Select MiniMax M2.7
2. Send a message that triggers a long response (e.g., "Write a detailed market analysis for District 10")
3. While streaming, switch to Gemini Flash 3 and send: "Also add rental yields"
4. **Expected:** Second message queues
5. **Expected:** When the queue drains, the second message runs on Gemini Flash 3 (not MiniMax)
6. **Verify in Supabase:** `thread_queue_records.content` includes `selectedChatModel` field
7. **Verify:** `agent_runs` table shows the queued message used `google/gemini-3-flash`

**Notes / failures:**

---

## Edge Cases

- [ ] Send empty message (just whitespace) — should be prevented or handled gracefully
- [ ] Rapid-fire 5 messages in < 2 seconds — queue handles without crashes
- [ ] Network interruption mid-stream — graceful error, not infinite spinner
- [ ] Very long assistant response (1000+ words) — renders without layout break
- [ ] Unicode / emoji in messages — renders correctly
- [ ] Thread with 50+ messages — scroll behavior works, no performance degradation
- [ ] Invalid model ID via curl (e.g., `selectedChatModel: "fake/model"`) — returns 400
- [ ] Missing `selectedChatModel` in request — falls back to Gemini Flash 3 (no error)
- [ ] Model selector logo images load (models.dev CDN reachable)

---

## Pass / Fail Criteria

- **Pass:** Can create threads, send messages, get streaming responses, switch between threads, and all messages persist across refresh. Queue handles concurrent messages. Model selector persists choice via cookie, sends correct model per message, and queued messages preserve model fidelity.
- **Fail:** Messages lost on refresh, responses don't stream, thread switching corrupts history, queue deadlocks. Model selection lost on refresh, queued messages use wrong model, invalid model ID doesn't reject.
