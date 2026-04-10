# Handover: Verify Managed Agents Migration Consistency

## Your job

Three-way consistency check before implementation kicks off:

1. **Plan ↔ Design doc** — does the plan faithfully carry forward every decision in the requirements doc?
2. **Plan ↔ Official Anthropic docs** — does the plan match the current Managed Agents API shape and recommended patterns?
3. **Design doc ↔ Official Anthropic docs** — same check, at the requirements level.

Report anything that drifts. Do NOT fix it yourself — just flag it.

## Files to read

1. **Design doc (requirements):** `docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md`
2. **Plan (implementation):** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md`
3. **Spike results:** `docs/product/ideations/2026-04-09-managed-agents-spike-results.md`

## Official docs to verify against

Use the Claude Code built-in `claude-api` Skill. Just ask: **"start onboarding for managed agents in Claude API"** — this gives you Anthropic's official deploy-your-first-agent walkthrough.

Also fetch these directly:

- https://platform.claude.com/docs/en/managed-agents/overview
- https://platform.claude.com/docs/en/managed-agents/quickstart
- https://platform.claude.com/docs/en/managed-agents/agent-setup
- https://platform.claude.com/docs/en/managed-agents/sessions
- https://platform.claude.com/docs/en/managed-agents/events-and-streaming
- https://platform.claude.com/docs/en/managed-agents/permission-policies
- https://platform.claude.com/docs/en/managed-agents/mcp-connector
- https://platform.claude.com/docs/en/managed-agents/vaults
- https://platform.claude.com/docs/en/managed-agents/files
- https://platform.claude.com/docs/en/managed-agents/skills
- https://platform.claude.com/docs/en/managed-agents/memory
- https://platform.claude.com/docs/en/about-claude/pricing

You can also use `context7` MCP to query the Anthropic Claude API library for up-to-date SDK shapes.

## What to check

### Check 1: Plan ↔ Design doc

For every requirement R1-R52 in the design doc, verify it appears in the plan as either:
- A concrete task in one of the 4 phases
- An acceptance criterion
- An explicitly deferred item

Flag any requirement that's silently dropped or paraphrased in a way that changes its meaning.

### Check 2: Plan ↔ Official docs

For every API call, field name, event type, or beta header mentioned in the plan, verify it matches current Anthropic docs. Specifically check:

- **Agent creation shape** — `model`, `system`, `tools`, `skills`, `mcp_servers` fields; `agent_toolset_20260401` tool name
- **Session creation** — `agent`, `environment_id`, `vault_ids` fields
- **Event types** — `user.message`, `agent.message`, `agent.tool_use`, `agent.mcp_tool_use`, `agent.tool_result`, `agent.mcp_tool_result`, `span.model_request_start/end`, `session.status_idle`, `session.status_running`, `session.status_terminated`, `user.tool_confirmation`
- **Permission policies** — `always_allow`, `always_ask`, `default_config.permission_policy`, `configs[]` with per-tool overrides
- **Stop reason shape** — `stop_reason.requires_action.event_ids[]`
- **Tool confirmation shape** — `tool_use_id`, `result: "allow"|"deny"`, `deny_message`
- **Files API** — `POST /v1/files`, `GET /v1/files?scope_id=...`, `GET /v1/files/{id}/content`, beta header `files-api-2025-04-14`
- **Resources API** — `POST /v1/sessions/{id}/resources`
- **Skills API** — `POST /v1/skills`, beta header `skills-2025-10-02`, `source: "custom"|"anthropic"`
- **Beta header** — `managed-agents-2026-04-01` on all Managed Agents requests

### Check 3: Pricing and cost assumptions

The plan/design doc cite:
- Sonnet 4.6: $3/$15 per MTok input/output
- Session runtime: $0.08/session-hour (running only)
- Current Gemini 3 Flash baseline: $0.50/$3.00 per MTok
- Multiplier: ~5-6x

Verify these against the current pricing page.

### Check 4: One known undocumented behavior

The plan relies on **per-tool `configs` with `permission_policy` on `mcp_toolset`** (not just `agent_toolset`). Official docs only show this for `agent_toolset`. Our spike (2026-04-09) proved it works on `mcp_toolset` empirically.

Verify the docs still only show `default_config.permission_policy` for `mcp_toolset`. If Anthropic has updated the docs to officially support per-tool configs on `mcp_toolset`, update the design doc to remove the "undocumented" caveat.

### Check 5: Onboarding walkthrough sanity check

Run through the Anthropic "deploy your first agent" onboarding (via the claude-api Skill). Compare its recommended patterns to our Phase 1 plan:

- Does our agent object creation match the walkthrough?
- Does our environment creation match?
- Does our session lifecycle match?
- Does the walkthrough recommend anything we're not doing?
- Does the walkthrough warn against anything we're doing?

## Report format

For each discrepancy:

```
## [Finding N]: <short title>
**Location:** Plan R-number or phase, or design doc R-number
**Says:** <what the doc says>
**Reality:** <what Anthropic docs say> (cite URL)
**Impact:** doc fix | design change | blocker
```

Then a summary:
- X findings that are blockers (can't proceed without fixing)
- X findings that are design changes (would rework architecture)
- X findings that are doc fixes (cosmetic, fixable in 5 min)
- X items verified correct

## What NOT to flag

- Intentional design choices already debated (MCP-only for tools, server-side adapter, disposable triggers, no subagents, feature flag rollback, custom skills migration to Skills API, client_profile/user_preferences rename)
- Style, formatting, naming preferences
- Speculative concerns without evidence
- Items flagged as "needs empirical validation" in the design doc (those are known unknowns)

## Key context (don't re-litigate)

- MCP server will be built as a new Railway service exposing 35 tools via MCP protocol
- Chat uses a server-side adapter pattern (Vercel Function stays alive during turn, translates SSE → AI SDK UIMessageStream, preserves `useChat`)
- Triggers use disposable session-per-fire + polling cron on MCP server for persistence
- Feature flag `RUNNER_ENGINE=managed|legacy` keeps the current runner alive for 3 months
- Spike validated per-tool MCP permission configs work (even though undocumented)
- Spike measured session creation at ~550ms
- Memory stores are research preview, access request pending, shipping without cross-session memory for v1

Your report should be under 800 words unless you find a genuine blocker.
