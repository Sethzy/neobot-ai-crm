# QA Surface 22: Error Handling & Recovery

> **PRs covered:** 4 (runner engine), 38c (message quota), 33-34 (approvals), 25-26 (connections/Composio)
> **Dogfoodable:** No (requires simulating failure conditions)
> **Time estimate:** 20-25 min manual
> **Components:** `run-agent.ts`, `message-quota.ts`, `thread-queue.ts`

---

## Prerequisites

- Logged in with working chat
- Supabase dashboard open
- Access to modify client plan/quota in DB
- Langfuse dashboard for trace inspection

---

## What This Tests

The runner has multiple error recovery paths: quota enforcement, run creation failures, stream errors, and terminal state guards. This surface verifies the agent degrades gracefully under error conditions without data corruption.

---

## Manual QA Scenarios

### 22.1 Message quota — enforcement at limit

1. In Supabase, set client's monthly message count to 1 below the plan limit
2. Send a message — should succeed (last allowed message)
3. Send another message
4. **Expected:** 402 error returned — "Message limit reached"
5. **Expected:** Chat UI shows quota limit state (composer locked or error message)
6. **Expected:** No partial run created in DB

**Notes / failures:**

---

### 22.2 Message quota — release on error

1. Set quota to 1 below limit
2. Trigger a scenario where the run fails during startup (e.g., temporarily break AI Gateway key)
3. **Expected:** Consumed quota unit is released back (release guard fires)
4. Fix the gateway key
5. Send a message
6. **Expected:** Message succeeds (quota was released, not permanently consumed)

**Notes / failures:**

---

### 22.3 Message quota — exempt flows

1. Trigger an autopilot pulse (via cron scan)
2. **Expected:** Autopilot run does NOT consume a message quota unit
3. Trigger a webhook trigger
4. **Expected:** Trigger run does NOT consume quota
5. **Verify:** Only brand-new user-authored chat turns consume quota

**Notes / failures:**

---

### 22.4 Run creation failure — message queued

1. Send a message while another run is active on the same thread (rapid double-send)
2. **Expected:** Second message is enqueued to `thread_queue_records`
3. **Expected:** After first run completes, queued message is drained and processed
4. **Verify in Supabase:** `thread_queue_records` was used (may be empty after drain)

**Notes / failures:**

---

### 22.5 API route validation — bad request

1. (Via curl or Postman) Send a malformed POST to `/api/chat` with missing `messages` field
2. **Expected:** 400 error with descriptive message
3. Send with empty messages array
4. **Expected:** 400 error (or agent handles gracefully)
5. Send with invalid thread ID
6. **Expected:** 404 error

**Notes / failures:**

---

### 22.6 Tool execution error — graceful recovery

1. Ask agent to search for something that would cause an RPC error (e.g., very complex SQL)
2. **Expected:** Agent receives error from tool, explains to user, and continues
3. **Expected:** Run does NOT crash — agent's text response still appears
4. **Verify in Langfuse:** TOOL observation shows error, but GENERATION continues after

**Notes / failures:**

---

### 22.7 Composio connection failure

1. If a connection exists, temporarily invalidate its token (or disconnect the service)
2. Ask agent to use that connection: "Read my latest emails"
3. **Expected:** Agent reports the connection error gracefully
4. **Expected:** Other tools still work — partial Composio failure doesn't crash the whole run
5. **Verify:** Console/Langfuse shows Composio tool loading failure caught and logged

**Notes / failures:**

---

### 22.8 Approval — pending state persistence

1. Trigger an approval-gated action: "Delete contact QA Test"
2. **Expected:** Approval card appears
3. Refresh the page
4. **Expected:** Approval card still renders (persisted state, not in-memory only)
5. Wait 5+ minutes, then approve
6. **Expected:** Approval still resolves correctly (no timeout)

**Notes / failures:**

---

### 22.9 Terminal state guard

1. Trigger a run that produces an error
2. **Verify in Langfuse:** Only ONE terminal state recorded (not double-recorded)
3. **Verify:** `runs` table has correct `status` and `error_message`
4. Send a follow-up message
5. **Expected:** New run works normally — previous error doesn't block thread

**Notes / failures:**

---

## Edge Cases

- [ ] Quota at exactly 0 remaining — immediate rejection, no off-by-one
- [ ] Plan upgrade mid-month — new limit applies immediately
- [ ] Thread queue with 10+ messages — all drain in order
- [ ] Two browser tabs sending to same thread simultaneously — one succeeds, one queues
- [ ] AI Gateway returns 429 (rate limit) — agent retries or surfaces error
- [ ] Run fails after 5 successful tool calls — partial results preserved in thread
- [ ] Approval on a tool that no longer exists (edge case) — graceful error

---

## Pass / Fail Criteria

- **Pass:** Quota enforcement blocks at exact limit and releases on error. Queued messages drain correctly. Bad API requests return proper error codes. Tool errors don't crash runs. Composio failures are isolated. Approvals persist across page refresh. Terminal state recorded exactly once.
- **Fail:** Quota off-by-one allows extra messages. Consumed quota not released on error. Queued messages lost. Tool error crashes entire run. Composio failure takes down all tools. Approval lost on page refresh.
