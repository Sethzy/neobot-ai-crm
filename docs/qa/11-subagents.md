# QA Surface 11: Subagents

> **PRs covered:** 29 (subagent spawning + results)
> **Dogfoodable:** No (invisible to browser — results appear in chat)
> **Time estimate:** 15-20 min manual

---

## Prerequisites

- Logged in with working chat
- Agent has file tools available (read_file, write_file for instruction files)
- Subagent functionality implemented (PR 29 tasks 1-4)

> **Note:** PR 29 has tasks not yet marked done. Verify implementation status before testing. If not implemented, skip this surface.

---

## Dogfood Checklist (automated browser pass)

Not applicable — subagents are invisible backend operations. Results appear as normal agent messages in chat.

---

## Manual QA Scenarios

### 11.1 Subagent for parallel research

1. In chat: "Research the latest property market trends in Singapore Districts 9, 10, and 11 — cover prices, transaction volume, and notable launches for each"
2. **Expected:** Agent spawns subagent(s) for research (may use `run_subagent` tool)
3. **Expected:** Tool call visible showing subagent invocation
4. **Expected:** Results appear in the main thread (summarized, not raw dump)
5. **Expected:** Research covers all three districts (subagent handled the scope)

**Notes / failures:**

---

### 11.2 Subagent for document analysis

1. Upload a long document to knowledge base or storage
2. In chat: "Analyze the document at [path] and give me the key takeaways"
3. **Expected:** Agent spawns subagent for document analysis
4. **Expected:** Subagent reads and processes the document
5. **Expected:** Summary returned to main thread

**Notes / failures:**

---

### 11.3 Context isolation

1. In the main thread, have established context about a specific deal
2. Trigger a subagent for an unrelated research task
3. **Expected:** Subagent does NOT have access to the main thread's full context
4. **Expected:** Main thread context is NOT bloated by subagent's research data
5. After subagent returns, continue conversation in main thread
6. **Expected:** Main thread context remains clean — subagent results are summarized

**Notes / failures:**

---

### 11.4 Subagent with instruction files

1. Write a subagent instruction file: "Write a file at skills/research-singapore-market.md with instructions for how to research the Singapore property market"
2. Trigger a research request that would use this instruction file
3. **Expected:** Subagent reads the instruction file and follows its guidelines
4. **Expected:** Results quality reflects the instructions

**Notes / failures:**

---

### 11.5 Multiple subagents

1. Request a task that would benefit from parallel execution: "Compare property prices in Sentosa Cove vs Marina Bay — get current listings and recent transactions for both"
2. **Expected:** Agent may spawn multiple subagents (one per location)
3. **Expected:** Results from both are synthesized in the main thread
4. **Expected:** Response time is better than sequential (parallel benefit)

**Notes / failures:**

---

## Edge Cases

- [ ] Subagent fails (e.g., web search unavailable) — main thread gets error summary, not crash
- [ ] Subagent takes very long — timeout handling (if applicable)
- [ ] Subagent result is very large — summarized before injecting into main context
- [ ] Request that doesn't need subagent — agent handles directly without unnecessary spawning
- [ ] Subagent instruction file doesn't exist — graceful fallback

---

## Pass / Fail Criteria

- **Pass:** Subagents spawn for heavy research/analysis tasks. Results are summarized back to main thread. Context isolation works (main thread not bloated). Instruction files are respected.
- **Fail:** Subagents never spawn, results raw-dumped into context, main thread context explodes, subagent errors crash the main run.
