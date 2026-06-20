# Review Handover: Context Pipeline Design Doc

Copy-paste the prompt below into a fresh Claude Code session for the review.

---

## Prompt

You are reviewing a design doc for Sunder's agent context pipeline redesign. The design doc proposes changes to compaction, prompt caching, persistence, and pre-stream latency — all informed by the `langchain-ai/deepagents` open-source codebase as the reference harness.

### Your job

1. Read the design doc at `roadmap docs/Sunder - Source of Truth/references/deepagents/01-context-pipeline-design-doc.md`
2. Read the Deep Agents reference codebase at `/Users/sethlim/Documents/deepagents` — specifically the agent harness engineering patterns for memory, compaction, prompt caching, context management, and tool handling
3. Read the relevant Sunder source files listed in the design doc's "Files to Touch" sections
4. Also read the existing reference docs in `roadmap docs/Sunder - Source of Truth/references/prompt-caching/` (especially docs 09 and 10) and `roadmap docs/Sunder - Source of Truth/references/compacting/` for additional context on the constraints

### What to evaluate

The default position is **minimal drift from Deep Agents**. Where we drift, there must be a clear reason (serverless runtime, different LLM provider, different SDK). Evaluate whether:

**A. Drift analysis is correct:**
- For each "no drift" item in Part 7's drift summary — verify we actually match the Deep Agents pattern by reading both codebases
- For each "justified drift" — verify the justification holds. Is there really no way to follow the Deep Agents pattern? Or are we drifting unnecessarily?
- Are there Deep Agents patterns in the harness engineering space (memory loading, compaction, context assembly, caching, tool management) that the design doc missed entirely?

**B. The "append-only wins over truncation" decision is sound:**
- The doc argues that with 1M context + prompt caching, in-flight tool arg truncation (which Deep Agents does) is unnecessary and we should skip it
- The doc argues we should delete our persistence-time truncation because it breaks the cache
- Challenge this: are there scenarios where a CRM agent on Gemini Flash 3 would hit context pressure before the 85% compaction trigger? Consider which tools produce the largest outputs (note: `browse_website` uses Browser-Use Cloud which returns structured summaries, not raw HTML — check the tool implementation to confirm).
- Is the math in "The Key Decision" section actually right?

**C. The implementation is complete:**
- Are there files in the Sunder codebase that would break if we delete `toolcall-artifacts.ts` that the doc doesn't list?
- Does the system reminder move (from system prompt to message) actually work with Vercel AI SDK's `streamText()`? Can you inject a system-reminder as a message rather than part of the system string?
- Does Gemini's implicit caching give us cache hits automatically with the proposed prefix structure, or do we need explicit `CachedContent` setup? This is the open question flagged in the doc.

**D. Anything we should steal from Deep Agents that we're not:**
- Read through Deep Agents' middleware implementations beyond what the doc covers. Is there anything in their memory middleware, skills middleware, or filesystem middleware that's relevant to our harness and missing from the doc?
- Their `PatchToolCallsMiddleware` fixes dangling tool calls — the doc says AI SDK handles this. Verify that's true.
- Their `SummarizationToolMiddleware` exposes a `compact_conversation` tool to the agent. The doc says "overkill." Is it really, or would it help with the CRM use case?

### Output format

Write your review as a structured response:

1. **Agreements** — things the design doc gets right, briefly noted
2. **Challenges** — things you disagree with or think are wrong, with evidence from the codebases
3. **Gaps** — patterns or edge cases the doc missed
4. **Recommendations** — specific changes to the design doc, if any

Be direct. Technical rigor over social comfort. If the doc is solid, say so briefly and focus on gaps. If something is wrong, say exactly what and why with file paths and line numbers.
