# Prompt Caching — Simon Willison Coverage (Compilation)

- **Author:** Simon Willison
- **Source:** Simon Willison's Weblog (simonwillison.net)
- **Primary URL:** https://simonwillison.net/2024/Aug/14/prompt-caching-with-claude/
- **Additional URLs:**
  - https://simonwillison.net/2024/Oct/2/not-digital-god/#prompt-caching-aka-the-big-price-drop
  - https://simonwillison.net/2024/Aug/15/alex-albert/
  - https://simonwillison.net/2025/Jan/16/alex-albert/
- **Dates:** August 14, 2024 — January 16, 2025

---

## Provider Comparison (as of October 2024)

| Provider   | Discount on Cached Input Tokens | Implementation | Notes |
|------------|--------------------------------|----------------|-------|
| Anthropic  | 90% (cache reads at 0.1x base) | Explicit — requires `cache_control` markers | Cache writes cost 1.25x base. 5-min TTL, refreshed on each hit. |
| OpenAI     | 50% | Fully automatic — no code changes | No write premium. |
| Google     | 75% (implicit, Gemini 2.5+) | Implicit or explicit | Older models required hourly payments to keep cache warm. |
| DeepSeek   | Automated discount | Fully automatic | "Context Caching on Disk." |

---

## Key Analysis Points

### Anthropic

- Cached tokens cost ~10% of standard token prices within the TTL window.
- **Risk:** Applications prompting less frequently than every 5 minutes may lose money on cache write costs (the 25% write premium is wasted if the cache expires unused).

### OpenAI

- 50% discount on input tokens for prompts with a shared prefix, applied automatically with zero code changes.
- While Anthropic's 90% discount is mathematically superior, OpenAI's zero-friction approach may be more practically valuable.

### The "Examples" Insight (Alex Albert, Anthropic)

> "Examples are the #1 thing I recommend people use in their prompts because they work so well. The problem is that adding tons of examples increases your API costs and latency. Prompt caching fixes this."

- Practical alternative to fine-tuning: generate extensive test-case pairs using a strong model, then use those as few-shot examples with a cheaper model.

---

## Practical Implications for Agentic Applications

1. **Multi-turn conversations** are a natural fit — conversation transcript resent each turn, prefix grows monotonically, cache hit rate is high.
2. **System prompts + tool definitions** are highly cacheable — identical across requests.
3. **Large context injection** (documents, codebases) benefits enormously — 90% cost reduction + 75-79% latency reduction.
4. **Even low-traffic apps benefit** from caching within the TTL window during active sessions.
