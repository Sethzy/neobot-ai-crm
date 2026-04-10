# Final Sense-Check: Managed Agents Migration Requirements

## What to review

`docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md`

This doc has been through two adversarial reviews, empirical API spikes, and multiple rounds of refinement. It's ready for a final sense-check before implementation planning.

## Your job

Verify that what the doc says matches (a) the current Anthropic Managed Agents documentation and (b) the existing Sunder codebase. Flag anything that's wrong, contradictory, or will break during implementation.

## How to do this

### Step 1: Read the requirements doc in full

Read `docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md` end to end. Understand the architecture, the adapter pattern, the session lifecycle, the tool surface, and the approval flow.

### Step 2: Verify against Anthropic docs

Use `context7` MCP to resolve the Anthropic SDK library and query current docs. Also fetch these pages directly:

- Overview: https://platform.claude.com/docs/en/managed-agents/overview
- Agent setup: https://platform.claude.com/docs/en/managed-agents/agent-setup
- Sessions: https://platform.claude.com/docs/en/managed-agents/sessions
- Events and streaming: https://platform.claude.com/docs/en/managed-agents/events-and-streaming
- Tools: https://platform.claude.com/docs/en/managed-agents/tools
- Skills: https://platform.claude.com/docs/en/managed-agents/skills
- Permission policies: https://platform.claude.com/docs/en/managed-agents/permission-policies
- MCP connector: https://platform.claude.com/docs/en/managed-agents/mcp-connector
- Vaults: https://platform.claude.com/docs/en/managed-agents/vaults
- Files: https://platform.claude.com/docs/en/managed-agents/files
- Memory: https://platform.claude.com/docs/en/managed-agents/memory
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing

For each requirement (R1-R52), verify:
- Does the Anthropic API actually support what the doc claims?
- Are field names, event types, and API shapes correct?
- Are any assumptions flagged as "needs validation" that are now answerable from current docs?

### Step 3: Verify against the existing codebase

Read these key files to understand what's being replaced:

- `src/lib/runner/run-agent.ts` — current runner loop
- `src/lib/runner/tool-registry.ts` — tool assembly and conditional registration
- `src/lib/runner/context.ts` — context assembly (7 layers)
- `src/lib/runner/safety-gates.ts` — current approval gating
- `src/lib/runner/run-persistence.ts` — post-run persistence
- `src/lib/runner/drain-and-continue.ts` — queue drain pattern
- `src/lib/approvals/` — approval flow (queries, continue-after-approval)
- `app/api/chat/route.ts` — chat API route
- `src/lib/ai/system-prompt.ts` — current system prompt (~470 lines)
- `src/lib/ai/models.ts` — current model and pricing
- `src/lib/composio/activated-tools.ts` — Composio tool loading
- `src/lib/memory/loader.ts` — memory loading
- `src/lib/runner/compaction.ts` — compaction system

For each item in "What Gets Eliminated," verify the file exists and understand what it does. For each item in "What Stays," verify the doc's description matches reality.

### Step 4: Check for internal contradictions

The doc has been edited multiple times. Look for:
- Requirements that still reference deleted concepts (SOUL.md, USER.md, subagents, drain-and-continue)
- Resolved questions that contradict the requirements they reference
- The "What Stays" / "What Gets Eliminated" tables — do they match the requirements above?
- R-number cross-references — do they point to the right requirements?
- Any remaining references to "SOUL" or "USER" that should now say "client_profile" or "user_preferences"
- Any remaining references to long-lived trigger sessions or trigger session rotation (now disposable per R26)

### Step 5: Spike results validation

Read `docs/product/ideations/2026-04-09-managed-agents-spike-results.md`. The spikes validated:
- Per-tool `configs` on `mcp_toolset` — confirmed working
- Session creation latency — ~550ms

These results are referenced throughout the requirements doc. Verify they're cited correctly.

## What to flag

For each issue found:

1. **Requirement number** (e.g., R19)
2. **What the doc says**
3. **What the truth is** (cite the Anthropic doc URL or codebase file:line)
4. **Impact** — is this a doc fix, a design change, or a blocker?

## What NOT to flag

- Style, formatting, or naming preferences
- Speculative concerns without evidence from docs or code
- Things that are explicitly deferred (memory stores, callable_agents)
- The SOUL/USER → client_profile/user_preferences rename is intentional
- Subagents being cut from v1 is intentional
- Trigger sessions being disposable is intentional

## Key areas that deserve extra scrutiny

These have been addressed in prior reviews but are high-risk if wrong:

1. **Vault `vault_ids` on sessions** (R15, Dependencies) — the doc flags this as potentially blocked. Check current vault docs for whether session-level vault attachment is supported
2. **Event payload for `agent.mcp_tool_use`** (R20) — verify the event contains tool name, input params, and evaluated_permission — enough to render an approval card
3. **`files.list({ scope_id })` vs extracting file_ids from events** (R34) — verify which pattern is correct
4. **`sessions.resources.add()` for mid-session files** (R32) — verify current API support
5. **Adapter pattern feasibility** (R43-R44) — verify that AI SDK's `createUIMessageStream` + `writer.write()` can emit all needed part types (text, tool-call, tool-result, approval-request, step-start, step-finish)
6. **Cost numbers** — verify Sonnet 4.6 at $3/$15 per MTok and session runtime at $0.08/session-hour against current pricing page
7. **Per-tool MCP configs** — already validated by spike, but verify the exact API shape (field names in `configs[]` array) matches what the doc describes

## Context: key decisions already made

These were debated and decided. Don't re-litigate unless you find concrete evidence they're wrong:

- **MCP-only for tools** (no custom tools except ask_user_question, create_connection, reauthorize_connection)
- **Server-side adapter pattern** for chat (Vercel Function alive during turn, translates Anthropic SSE → AI SDK UIMessageStream)
- **Polling cron on Railway** for trigger persistence (fire-and-forget + async persistence)
- **Disposable sessions for all triggers** (session-per-fire, no reuse)
- **Long-lived sessions for chat** (one per thread, reused across turns)
- **No subagents in v1**
- **No cross-session memory in v1** (until memory stores are available)
- **Feature flag for rollback** (RUNNER_ENGINE=managed|legacy)
- **Trigger tool gating via system prompt** (not infrastructure)
