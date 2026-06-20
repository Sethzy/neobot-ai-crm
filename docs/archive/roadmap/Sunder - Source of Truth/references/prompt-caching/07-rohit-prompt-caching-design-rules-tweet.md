# Prompt Caching Design Rules for AI Agents (Tweet Summary)

**Author:** Rohit (@rohit4verse)
**Source:** https://x.com/rohit4verse/status/2025213841341329453
**Date:** February 21, 2026
**Engagement:** 76 likes, 81 bookmarks, 14,687 views

---

## Tweet Content (Verbatim)

> prompt caching makes long-running AI agents fast and affordable.
>
> make sure to follow these design rules while making your ai agents:
>
> - keep prompt prefix stable
> - static content first, dynamic last
> - use messages instead of editing system prompts
> - never change tools mid-session
> - avoid switching models
> - use defer loading for tools
> - fork operations must share the same prefix
> - monitor cache hit rate
>
> read this article as it reveals real production learnings from claude code:

## Quoted Tweet

**Author:** Thariq (@trq212)
**Source:** https://x.com/trq212/status/2024574133011673516
**Date:** February 19, 2026
**Engagement:** 5,288 likes, 500 retweets, 13,838 bookmarks, 2.1M views
**Linked Article:** https://platform.claude.com/docs/en/build-with-claude/compaction#prompt-caching

The quoted tweet links to the official Anthropic documentation on compaction and prompt caching, titled "Lessons from Building Claude Code: Prompt Caching Is Everything".

---

## Design Rules Explained

Each bullet from Rohit's tweet maps to a production lesson from Claude Code:

### 1. Keep prompt prefix stable

Prompt caching is a prefix match. Any change anywhere in the prefix invalidates everything after it. The entire system must be designed around keeping the prefix identical across requests.

### 2. Static content first, dynamic last

Optimal prompt layout orders content from most stable to least stable:
1. Static system prompt and tool definitions (globally cached)
2. Project-level context like CLAUDE.md (cached within a project)
3. Session context (cached within a session)
4. Conversation messages (most dynamic, placed last)

### 3. Use messages instead of editing system prompts

When information becomes stale (timestamps, changed files, etc.), do NOT update the system prompt -- that causes a cache miss. Instead, pass updated info via `<system-reminder>` tags in the next user message or tool result. The cached system prompt prefix remains intact.

### 4. Never change tools mid-session

Changing the tool set invalidates the cached prefix for the entire conversation. Even if it seems intuitive to only give the model relevant tools, the cache break is not worth it.

Example: Claude Code's "Plan Mode" keeps all tools in every request. Instead of swapping to read-only tools, it uses `EnterPlanMode` and `ExitPlanMode` as tools the model can call. Tool definitions never change.

### 5. Avoid switching models

Prompt caches are unique to each model. Switching from Opus to Haiku at 100k tokens in would cost more than staying on Opus, because the entire cache must be rebuilt for the new model.

Solution: Use subagents instead. The primary model prepares a handoff message to a secondary model running in its own context (with its own cache).

### 6. Use defer loading for tools

When dozens of MCP tools are loaded, including all full schemas is expensive, but removing them breaks the cache. Solution: `defer_loading`. Send lightweight stubs (just the tool name with `defer_loading: true`) that the model discovers via a `ToolSearch` tool when needed. Full schemas load on demand. The cached prefix stays stable -- same stubs, same order.

### 7. Fork operations must share the same prefix

When compacting (summarizing conversation to fit context window), using a separate API call with a different system prompt and no tools misses the entire cache. Full price for all input tokens.

Cache-safe approach: Use the exact same system prompt, user context, and tool definitions as the parent conversation. Prepend the parent's messages, then append the compaction prompt as a new user message at the end. The cached prefix is reused -- only new tokens are the compaction prompt itself.

### 8. Monitor cache hit rate

Treat cache hit rate like uptime. Alert on cache breaks and treat them as incidents. Monitor the `cache_read_input_tokens` and `cache_creation_input_tokens` fields in API responses.

Cache hits provide a 90% discount on input token costs. A sustained drop in cache hit rate means something in the prefix is changing unexpectedly.

---

## Related References

- **[01-thariq-claude-code-prompt-caching-lessons.md](./01-thariq-claude-code-prompt-caching-lessons.md)** -- Full thread from the quoted tweet by Thariq (@trq212)
- **[02-anthropic-prompt-caching-docs.md](./02-anthropic-prompt-caching-docs.md)** -- Official Anthropic prompt caching documentation
- **Anthropic Compaction Docs:** https://platform.claude.com/docs/en/build-with-claude/compaction
- **Anthropic Prompt Caching Docs:** https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
- **Context Engineering Article:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
