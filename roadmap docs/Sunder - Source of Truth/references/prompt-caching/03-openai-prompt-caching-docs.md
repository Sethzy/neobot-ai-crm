# OpenAI Prompt Caching — Technical Reference

- **Source:** OpenAI Documentation
- **URL:** https://platform.openai.com/docs/guides/prompt-caching
- **Date accessed:** 2026-03-20

---

## How It Works

Prompt caching routes API requests to servers that recently processed identical prompt prefixes. Caching is **automatic** — no code changes or opt-in required.

1. **Cache Routing** — Requests are hashed based on the initial prompt prefix (typically first 256 tokens). An optional `prompt_cache_key` parameter can influence routing.
2. **Cache Lookup** — The system checks if the prefix exists in cache on the selected machine.
3. **Cache Hit** — Matching prefixes return cached results, reducing latency by up to 80% and input costs by up to 90%.
4. **Cache Miss** — Full prompt processing occurs; the prefix gets cached for future requests.

---

## Pricing

- **No additional fees** for caching — fully automatic.
- Cache hits reduce input token costs by up to **90%**.
- Cache hits reduce latency by up to **80%** for prompts over 10,000 tokens.

---

## Minimum Token Requirements

- **1,024 tokens** minimum for caching to activate.

---

## Cache Retention / TTL

### In-Memory (Default)
- 5 to 10 minutes of inactivity, up to a maximum of 1 hour.

### Extended Retention (24 Hours)
- Set via `prompt_cache_retention: "24h"`.
- Available on: gpt-5.4, gpt-5.2, gpt-5.1, gpt-5, gpt-4.1.
- Incompatible with Zero Data Retention.

---

## Response Fields

```json
{
  "usage": {
    "prompt_tokens": 2006,
    "completion_tokens": 300,
    "prompt_tokens_details": {
      "cached_tokens": 1920
    }
  }
}
```

---

## Best Practices

1. **Position static content first** — system instructions, tool definitions, large reference material at the beginning.
2. **Maintain consistent ordering** — tools and images must be identical in content and order.
3. **Use `prompt_cache_key`** — apply consistently across requests sharing prefixes.
4. **Keep request rate moderate** — each prefix-key combination below ~15 requests/minute.
5. **Monitor metrics** — track cached token counts via `usage` fields.

---

## Comparison with Anthropic

| Aspect | OpenAI | Anthropic |
|--------|--------|-----------|
| Activation | Fully automatic | Requires explicit `cache_control` breakpoints |
| Minimum tokens | 1,024 | 1,024–4,096 (model-dependent) |
| TTL | 5-10 min default; optional 24h | 5 min (auto-refreshed on hit) |
| Pricing | No extra charge; up to 90% reduction | 90% read discount; 25% write surcharge |
| Cache control | Automatic + optional `prompt_cache_key` | Manual breakpoint placement |
