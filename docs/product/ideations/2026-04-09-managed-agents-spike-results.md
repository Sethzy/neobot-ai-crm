---
date: 2026-04-09
topic: managed-agents-spike-results
---

# Managed Agents Spike Results

## Spike 1: Per-Tool MCP Permission Configs

**Result: WORKS.** The Anthropic API accepts per-tool `configs[]` on `mcp_toolset` with individual `permission_policy` overrides.

Tested: created an agent with `mcp_toolset` using `default_config: { permission_policy: always_allow }` and a per-tool override `configs: [{ name: "dangerous_tool", permission_policy: always_ask }]`. API returned 200 with the config reflected in the response.

This eliminates the critical risk from R19/R224. No need for the two-server workaround or server-side gating fallback.

## Spike 2: Session Latency

| Metric | Measurement |
|---|---|
| Session creation (API to response) | ~550ms avg (range: 519-610ms, n=5) |
| Existing session: user.message to agent.message | ~1.3s |
| Cold start: create + send to agent.message | ~1.7s (user.message to agent.message) |
| Cold start: total wall time | ~2.3s |

**Key finding:** Session creation adds ~400ms of overhead vs reusing an existing session. This is small relative to model response time (~1.3-1.7s). Session-per-message is architecturally viable.

**Note:** These tests used a trivial system prompt ("Reply with exactly: pong"). Sunder's real system prompt is significantly larger. Prompt caching on long-lived sessions would reduce input token costs and potentially improve latency on subsequent turns. However, Anthropic's prompt caching also works across sessions with matching prefixes, so the benefit may be smaller than expected.

Sessions start in `idle` status immediately — no `rescheduling` phase observed on any of the 7 sessions created.

## Spike 3: Idle Timeout / Auto-Termination

**Not yet tested.** Requires leaving sessions idle for 30-120+ minutes and polling status. The sessions created during spike 2 were archived during cleanup.

**Recommendation:** Start a session, leave it idle, check status at 30min, 1h, 2h, 4h intervals. This can run async — just needs someone to check back.

## Impact on Requirements Doc

### Confirmed safe (no changes needed):
- **R19 per-tool MCP configs** — works as designed
- **R2 model choice** — Sonnet 4.6 works on Managed Agents

### Simplification opportunity:
- **R25 long-lived sessions for chat** — session-per-message is viable given ~550ms creation latency. This would eliminate: session management state machine, recovery flow (R29), rotation policy (R26), session ID storage on tables. Tradeoff: ~400ms extra latency per turn, potential prompt caching cost difference.
- **Recommendation:** Start with session-per-message for simplicity. Add long-lived sessions later only if latency or cost (prompt caching) justifies the complexity.

### Still needs validation:
- **Idle timeout behavior** — determines whether long-lived sessions are even stable
- **Memory stores** — still research preview, access request pending
