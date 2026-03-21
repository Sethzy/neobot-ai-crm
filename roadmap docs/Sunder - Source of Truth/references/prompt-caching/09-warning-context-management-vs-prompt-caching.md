# Warning: Context Management Is Limited by Prompt Caching

**Source:** Community discussion on Thariq's Claude Code prompt caching article
**Date:** February 2026

---

## The Warning

> "Excited to see what you build but just FYI most context management and compaction techniques are limited by prompt caching.
>
> Coding agents would be cost prohibitive if they didn't maintain the prompt cache between turns.
>
> And it's very easy to break the cache when doing more creative context management.
>
> Not saying it's impossible to do this but just worth being careful about."

---

## Why This Matters

The tension is between **creative context management** (compaction, summarization, selective context injection, dynamic tool sets) and **prompt cache stability** (prefix must stay identical for cache hits).

### The economics are stark:

- **With cache hits:** input tokens cost 10% of base price → agents are affordable
- **Without cache hits:** full price on every turn → agents become cost-prohibitive at scale
- **Cache write penalty:** 25% surcharge on first write → breaking and rebuilding cache is actively expensive

### What breaks the cache:

1. **Compaction / summarization** — replacing conversation history with a summary changes the prefix
2. **Dynamic context injection** — inserting different documents or context per turn
3. **Tool set changes** — adding/removing tools mid-session
4. **Model switching** — each model has its own cache
5. **Reordering content** — even the same content in different order breaks the prefix match

### The safe patterns (from Claude Code):

1. **Never edit the system prompt** — use `<system-reminder>` messages instead
2. **Never change tools** — use `defer_loading` stubs + `ToolSearch`
3. **Never switch models** — use subagents for different models
4. **Compaction must share the parent prefix** — same system prompt, same tools, append compaction instruction as a new message
5. **Plan mode as a tool, not a tool set swap** — `EnterPlanMode` / `ExitPlanMode` are tools themselves

---

## Implication for Sunder

When building context management features (compaction, memory injection, dynamic tool loading), always verify that the approach maintains the prompt cache prefix. Monitor `cache_read_input_tokens` vs `cache_creation_input_tokens` in API responses to detect cache breaks.

The rule of thumb: **if you're being clever with context, you're probably breaking the cache.**
