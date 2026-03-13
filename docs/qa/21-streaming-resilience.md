# QA Surface 21: Streaming & Recovery

> **PRs covered:** 1 (streaming endpoint), 4 (runner engine), 22 (context recovery), 42a-i (pipeJsonRender)
> **Dogfoodable:** Partial (stop button testable, network interruption needs manual simulation)
> **Time estimate:** 15-20 min manual
> **Components:** `app/api/chat/route.ts`, `run-agent.ts`, `pipeJsonRender`

---

## Prerequisites

- Logged in with working chat
- Browser DevTools open (Network tab)
- Ability to throttle/kill network (DevTools network conditions or airplane mode)

---

## What This Tests

Chat responses are streamed via SSE through a pipeline: `streamText()` → `pipeJsonRender()` → `createUIMessageStream()`. This surface tests that streaming works reliably and degrades gracefully under adverse conditions.

---

## Manual QA Scenarios

### 21.1 Normal streaming

1. Send any message
2. **Expected:** Response streams token-by-token (not all at once)
3. **Expected:** Tool call pills appear during execution, then results render
4. **Expected:** No flickering or duplicate content during stream
5. **Verify in Network tab:** SSE event stream with progressive data chunks

**Notes / failures:**

---

### 21.2 Stop button mid-stream

1. Send a prompt that triggers a long response: "Write a detailed market analysis for District 10 condos"
2. While streaming, click the stop button
3. **Expected:** Stream stops cleanly
4. **Expected:** Partial response is preserved (not deleted)
5. **Expected:** Chat input re-enables, can send new message
6. **Expected:** No console errors

**Notes / failures:**

---

### 21.3 Stop button during tool execution

1. Send a prompt that triggers multiple tool calls: "Find all my contacts, then list all my deals"
2. While a tool is executing (pill shows loading), click stop
3. **Expected:** Execution stops after current tool completes
4. **Expected:** Partial results preserved (tools that completed show results)
5. Send a follow-up message
6. **Expected:** Agent can continue normally in new turn

**Notes / failures:**

---

### 21.4 Network interruption mid-stream

1. Send a message
2. While streaming, toggle airplane mode or kill network in DevTools
3. **Expected:** Stream stops (no infinite spinner)
4. **Expected:** Error state shown or partial content preserved
5. Restore network
6. **Expected:** Can send new messages without page refresh

**Notes / failures:**

---

### 21.5 Page refresh during stream

1. Send a message
2. While streaming, refresh the page (Cmd+R)
3. **Expected:** After reload, thread shows the last persisted message state
4. **Expected:** In-flight response may be lost (acceptable) but no corruption
5. **Expected:** Thread is usable — can send new messages

**Notes / failures:**

---

### 21.6 pipeJsonRender inline views during stream

1. "Show me my deals pipeline" (triggers inline view via ```spec fence)
2. **Expected:** View renders progressively as spec JSON streams in
3. **Expected:** No flash of raw JSON before view renders
4. **Expected:** View is interactive after stream completes

**Notes / failures:**

---

### 21.7 Concurrent messages (queue test)

1. Send a message
2. While response is streaming, type and send ANOTHER message
3. **Expected:** Second message is queued (not dropped)
4. **Expected:** First response completes, then second message is processed
5. **Expected:** Both responses appear in correct order

**Notes / failures:**

---

## Edge Cases

- [ ] Very long response (agent uses all 9 steps) — stream stays alive, no timeout
- [ ] Rapid-fire 5+ messages — all queued and processed in order
- [ ] Slow network (3G throttle) — stream works but slower, no corruption
- [ ] Tab backgrounded during stream — response still appears when tab refocused
- [ ] Multiple tabs open to same thread — no conflict or duplicate messages

---

## Pass / Fail Criteria

- **Pass:** Streaming delivers tokens progressively. Stop button works mid-stream and mid-tool. Network interruption doesn't corrupt state. Page refresh preserves persisted messages. Queued messages process in order. Inline views render during stream.
- **Fail:** Stream hangs indefinitely. Stop button doesn't work or corrupts state. Network interruption causes infinite spinner. Queued messages dropped or reordered. Raw JSON flashes before view renders.
