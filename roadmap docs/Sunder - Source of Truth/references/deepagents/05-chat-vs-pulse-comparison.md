# Chat vs. Pulse — Side-by-Side Comparison

How the same `runAgent()` function handles a chat message vs. an autopilot pulse.

---

## Entry Point

| | Chat | Pulse |
|---|---|---|
| **Who triggers it** | User types a message (web or Telegram) | Cron scanner fires every 6 hours |
| **Caller** | `/api/chat` route or Telegram webhook | `executor.ts` → `runAutopilot()` wrapper |
| **How it calls runAgent** | Directly | Wrapper calls `runAgent()`, consumes stream silently |

---

## runAgent() Step-by-Step

| Step | Chat (`triggerType: "chat"`) | Pulse (`triggerType: "pulse"`) | Same? |
|------|-----|-------|-------|
| **1. Quota** | Consume a message unit | Skip (not chat) | Different — but already handled by existing `triggerType === "chat"` check |
| **2. Mark stale runs** | `markStaleRunsFailed()` | `markStaleRunsFailed()` | Same |
| **3. Acquire lock** | `createRun()` | `createRun()` | Same |
| **4. Thread busy?** | Enqueue message, return `"queued"` | Return immediately, wrapper maps to `"skipped_busy"` | **Different — NEW check needed** |
| **5. Create user message** | Save user's text + files to DB | Skip (no inbound message, prompt is internal) | **Different — NEW check needed** |
| **6. Load CRM config** | `loadCrmConfig()` | `loadCrmConfig()` | Same (pulse gains CRM context — improvement) |
| **7. Load Composio tools** | `getActiveConnections()` → `loadActivatedConnectionTools()` | Same | Same |
| **8. Assemble context** | `assembleContext({ ...crmConfig, ...flags })` | `assembleContext({ ...crmConfig, ...flags, instructions })` | **Different — NEW: pass `instructions` for autopilot prompt** |
| **9. Browser tools** | Included (`triggerType === "chat"`) | Excluded (not chat) | Different — already handled |
| **10. Listing tools** | Included (`triggerType === "chat"`) | Excluded (not chat) | Different — already handled |
| **11. Trigger mutations** | Allowed (`triggerType === "chat"`) | Disallowed (not chat) | Different — already handled |
| **12. Connection mutations** | Allowed (default `true`) | Disallowed | **Different — NEW check needed** |
| **13. Market tools** | Included | Included | Same |
| **14. Create runner tools** | Full tool set | Same minus browser/listing/trigger mutations/connection mutations | Different — but all handled by existing or new flags |
| **15. Create subagent tool** | With CRM config | With CRM config | Same (pulse gains this — improvement) |
| **16. Model call** | `streamText()` | `streamText()` (wrapper consumes stream) | Same function, different consumer |
| **17. prepareStep** | Disable tools on final step | Same | Same |
| **18. stopWhen** | `stepCountIs(9)` | `stepCountIs(9)` | Same |
| **19. onFinish → finalizeRun** | Persist message, approvals, drain queue, compact | Same | Same |
| **20. Analytics** | Emit `agent_run_completed` / `agent_run_failed` | Same (pulse gains this — improvement) | Same |
| **21. Deliver to channels** | If thread has Telegram mapping → deliver | Same | Same |

---

## What's NEW (the 4 changes)

| # | Line | Current code | Change |
|---|------|-------------|--------|
| 1 | `run-agent.ts:182` | `if (!lockResult.created) { enqueueMessage(...) }` | Add: `if (triggerType === "pulse") return "queued"` before enqueue |
| 2 | `run-agent.ts:196` | `if (triggerType !== "cron")` → create user message | Change to: `if (triggerType !== "cron" && triggerType !== "pulse")` |
| 3 | `run-agent.ts:241` | `assembleContext({ ... })` | Add: `instructions: payload.instructions` |
| 4 | `run-agent.ts:258` | `allowConnectionMutations` not set (defaults `true`) | Add: `allowConnectionMutations: triggerType !== "pulse"` |

---

## What's ALREADY HANDLED (no changes needed)

| Concern | How it's handled | Line |
|---------|-----------------|------|
| Quota skip | `consumeMessageQuota === true && triggerType === "chat"` | 114-115 |
| Run type | `triggerType === "pulse" ? "autopilot" : triggerType` | 111-113 |
| Browser tools off | `triggerType === "chat"` | 249 |
| Listing tools off | `triggerType === "chat"` | 252 |
| Trigger mutations off | `triggerType === "chat"` | 258 |
| Config tool off | `payload.includeConfigTool` (not passed by pulse) | 264 |

---

## What the Wrapper Does

```typescript
// runAutopilot wrapper (25 lines)
async function runAutopilot({ clientId, threadId, supabase }) {
  try {
    const result = await runAgent({
      clientId,
      threadId,
      input: "",                              // no user message
      triggerType: "pulse",                   // triggers all the right conditionals
      channel: "web",
      consumeMessageQuota: false,             // no quota for pulse
      instructions: AUTOPILOT_INSTRUCTION_PROMPT,  // the 10-level priority prompt
    }, supabase);

    if (result.status === "streaming") {
      await result.streamResult.consumeStream();  // wait for finalizeRun
      return { status: "completed" };
    }
    return { status: "skipped_busy" };
  } catch (error) {
    // runAgent's recordFailedRun already handled completeRun(failed)
    return { status: "failed", error: error.message };
  }
}
```

---

## Visual Summary

```
CHAT:
  User types "check my deals"
    → /api/chat
    → runAgent({ triggerType: "chat", input: "check my deals" })
    → quota ✓ → lock ✓ → save user msg ✓ → context → tools (full set) → streamText
    → tokens stream to browser
    → onFinish → finalizeRun → deliver to Telegram (if mapped)

PULSE:
  Cron fires
    → executor.ts
    → runAutopilot({ clientId, threadId })
    → runAgent({ triggerType: "pulse", input: "", instructions: AUTOPILOT_PROMPT })
    → quota SKIP → lock ✓ → user msg SKIP → context (with instructions) → tools (restricted) → streamText
    → wrapper consumes stream silently
    → onFinish → finalizeRun → deliver to Telegram (if mapped)
    → wrapper returns { status: "completed" }
```

Same kitchen. Same recipe. Different order slip.
