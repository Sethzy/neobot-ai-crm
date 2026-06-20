# Lessons from Building Claude Code: Prompt Caching Is Everything

**Author:** Thariq (@trq212) — Claude Code team, Anthropic
**Source:** https://x.com/trq212/status/2024574133011673516
**Date:** February 20, 2026

---

## Key Thesis

Prompt caching is a prefix match. Any change anywhere in the prefix invalidates everything after it. Design your entire system around this constraint.

## Prompt Ordering for Caching

Prompt caching works by prefix matching — the API caches everything from the start of the request up to each `cache_control` breakpoint. Order matters enormously — maximize shared prefixes across requests.

**Optimal layout (static → dynamic):**

1. Static system prompt & Tools (globally cached)
2. Claude.MD (cached within a project)
3. Session context (cached within a session)
4. Conversation messages

**Diagram — System Prompt Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Base System Instructions                 globally cached│
├─────────────────────────────────────────────────────────┤
│  Tools (Read, Write, Bash, Grep, Glob, ...)  globally cached│
├─────────────────────────────────────────────────────────┤
│  CLAUDE.md & Memory                  cached per project │
├─────────────────────────────────────────────────────────┤
│  Session State (env, MCP, output style)  cached per session│
├─────────────────────────────────────────────────────────┤
│  Messages (user messages, tool results, ...)  grows each turn│
└─────────────────────────────────────────────────────────┘
```

**Common breaks:** timestamps in system prompt, shuffling tool order non-deterministically, updating tool parameters mid-session.

## Use Messages for Updates, Not System Prompt Changes

When information becomes out of date (e.g., time, changed files), don't update the system prompt — that causes a cache miss. Instead, pass updated info via `<system-reminder>` tags in the next user message or tool result.

## Don't Change Models Mid-Session

Prompt caches are unique to models. Switching from Opus to Haiku 100k tokens in would cost more than staying on Opus, because the entire cache must be rebuilt for the new model.

**Solution for model switching:** Use subagents. Opus prepares a "handoff" message to another model. Claude Code does this with Explore agents (which use Haiku).

## Never Add or Remove Tools Mid-Session

Changing the tool set invalidates the cached prefix for the entire conversation. Even though it seems intuitive to only give the model relevant tools, the cache break isn't worth it.

### Plan Mode — Design Around the Cache

**Intuitive (wrong) approach:** Swap tool set to read-only tools when entering plan mode.
**Actual approach:** Keep all tools in every request. Use `EnterPlanMode` and `ExitPlanMode` as tools themselves. Send a system message explaining plan mode constraints. Tool definitions never change.

**Bonus:** Because `EnterPlanMode` is a tool the model can call itself, it can autonomously enter plan mode when it detects a hard problem — no cache break.

### Tool Search — Defer Instead of Remove

**Problem:** Dozens of MCP tools loaded, including all is expensive, removing them breaks cache.
**Solution:** `defer_loading`. Send lightweight stubs (just the tool name with `defer_loading: true`) that the model can discover via a `ToolSearch` tool when needed. Full schemas load on demand. Cached prefix stays stable — same stubs, same order.

## Compaction — Cache-Safe Forking

When compacting (summarizing conversation to fit context window), the naive approach — separate API call with different system prompt and no tools — misses the entire cache. Full price for all input tokens.

**Cache-safe approach:** Use the exact same system prompt, user context, system context, and tool definitions as the parent conversation. Prepend the parent's conversation messages, then append the compaction prompt as a new user message at the end. The cached prefix is reused — only new tokens are the compaction prompt itself.

**Implication:** Need to save a "compaction buffer" — enough room in the context window for the compact message and summary output tokens.

**Diagram — How Compaction Works with Prompt Caching:**

```
 BEFORE                    FORKED COMPACTION CALL           AFTER
┌─────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│  System + Tools     │   │  System + Tools          │   │  System + Tools          │
├─────────────────────┤   ├──────────────────────────┤   ├──────────────────────────┤
│  user message       │   │                          │   │  compact_boundary        │
├─────────────────────┤   │  Full conversation       │   ├──────────────────────────┤
│  assistant + tool   │   │  (all messages)          │   │  Conversation summary    │
├─────────────────────┤   │         │                │   │  (replaces all old msgs) │
│  user message       │   │  cache hit — 1/10 price  │   ├──────────────────────────┤
├─────────────────────┤   │                          │   │  Re-attached files       │
│  assistant + tool   │   ├──────────────────────────┤   │  & context               │
├─────────────────────┤   │ + "Summarize this        │   ├──────────────────────────┤
│  ... many more      │   │    conversation"         │   │                          │
│      turns ...      │   ├──────────────────────────┤   │  room for new            │
├─────────────────────┤   │ → Summary (~20k tokens   │   │  conversation            │
│  compaction buffer  │   │   max)                   │   │                          │
└─────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
 context window
 nearly full
```

The key insight: the forked compaction call uses the **exact same System + Tools prefix** as the parent conversation, so it gets a cache hit (1/10 price) on the entire prefix. Only the compaction prompt itself is new tokens.

## Lessons Summary

1. **Prefix match** — any change in the prefix invalidates everything after it
2. **Messages over system prompt changes** — insert updates as conversation messages
3. **Don't change tools or models mid-conversation** — use tools to model state transitions, defer tool loading
4. **Monitor cache hit rate like uptime** — alert on cache breaks, treat them as incidents
5. **Fork operations share the parent's prefix** — compaction, summarization, and skill execution must use identical cache-safe parameters
