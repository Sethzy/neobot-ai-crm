# Anthropic Prompt Caching — Official Documentation Reference

- **Source:** Anthropic Developer Documentation
- **URL:** https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- **Date accessed:** 2026-03-20

---

## Overview

Prompt caching optimizes API usage by resuming from specific prefixes in prompts, reducing processing time and costs for repetitive tasks or prompts with consistent elements. The cache stores KV cache representations and cryptographic hashes of cached content (not raw text).

## How It Works

1. System checks if a prompt prefix up to a specified cache breakpoint is already cached from a recent query.
2. If found, the cached version is used, reducing processing time and costs.
3. Otherwise, the full prompt is processed and the prefix is cached once the response begins.

### Prefix-based caching

The entire prompt prefix up to a breakpoint is treated as a single cacheable unit. Changes to any block at or before the breakpoint invalidate that cache entry. Cache follows a strict hierarchy: `tools` -> `system` -> `messages`.

### Lookback window algorithm

The system employs a **20-block lookback** mechanism:

1. **Cache writes happen only at breakpoints** — exactly one cache entry is written per breakpoint.
2. **Cache reads look backward** — the system walks backward one block at a time checking for matching entries.
3. **20-block window limit** — the system checks at most 20 positions per breakpoint; if no match is found within the window, checking stops.

---

## Pricing (Per Million Tokens)

| Model | Base Input | 5m Cache Writes | 1h Cache Writes | Cache Hits & Refreshes | Output |
|-------|-----------|-----------------|-----------------|----------------------|--------|
| Claude Opus 4.6 | $5 | $6.25 | $10 | $0.50 | $25 |
| Claude Sonnet 4.6 | $3 | $3.75 | $6 | $0.30 | $15 |
| Claude Haiku 4.5 | $1 | $1.25 | $2 | $0.10 | $5 |

### Pricing multipliers

- **5-minute cache writes:** 1.25x base input token price
- **1-hour cache writes:** 2x base input token price
- **Cache reads (hits & refreshes):** 0.1x base input token price (90% discount)

---

## TTL (Time-to-Live)

### Default: 5-minute cache
- Automatically applied when `cache_control` is specified without `ttl` parameter.
- Cache is refreshed at no additional cost each time cached content is used.

### 1-hour cache option
- Specified via `"ttl": "1h"` in `cache_control`.
- Costs 2x the base input token price for cache writes.

---

## Minimum Token Requirements

| Model | Minimum Tokens |
|-------|---------------|
| Claude Opus 4.6 / 4.5 | 4,096 |
| Claude Sonnet 4.6 / 4.5 / 4 / 3.7 | 1,024–2,048 |
| Claude Haiku 4.5 | 4,096 |
| Claude Haiku 3.5 / 3 | 2,048 |

---

## API Usage

### Automatic caching (recommended for multi-turn)

```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "cache_control": {"type": "ephemeral"},
  "system": "You are an AI assistant...",
  "messages": [...]
}
```

### Explicit cache breakpoints (fine-grained)

```json
{
  "system": [
    {
      "type": "text",
      "text": "Long system prompt...",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [...]
}
```

Up to **4 independent cache breakpoints** allowed per request.

---

## Tracking Cache Performance

```json
{
  "usage": {
    "input_tokens": 50,
    "cache_read_input_tokens": 100000,
    "cache_creation_input_tokens": 248,
    "output_tokens": 503
  }
}
```

---

## What Invalidates the Cache

| What Changes | Tools Cache | System Cache | Messages Cache |
|-------------|------------|-------------|---------------|
| Tool definitions | Invalidated | Invalidated | Invalidated |
| Web search toggle | Valid | Invalidated | Invalidated |
| Tool choice | Valid | Valid | Invalidated |
| Thinking parameters | Valid | Valid | Invalidated |

Changes follow the hierarchy: `tools` -> `system` -> `messages`.

---

## Best Practices

1. **Start with automatic caching** for multi-turn conversations.
2. **Use explicit block-level breakpoints** when different sections change at different frequencies.
3. **Cache stable, reusable content:** system instructions, tool definitions, large contexts.
4. **Place cached content at the prompt beginning.**
5. **Place `cache_control` on the last block whose prefix is identical across requests.**
6. **Monitor cache hit rates** and adjust strategy.

### Critical placement rule

Place `cache_control` on the **last block whose prefix is identical across requests**.

Wrong — breakpoint on changing content:
```json
{"type": "text", "text": "Timestamp: [current_time]", "cache_control": {...}}
```

Correct — breakpoint on stable content:
```json
{"type": "text", "text": "Static system prompt (5000 tokens)", "cache_control": {...}}
```

---

## Limitations

- **Max 4 explicit cache breakpoints** per request.
- **20-block lookback window** per breakpoint.
- **Minimum token thresholds** per model (1,024 to 4,096).
- **Exact prefix matching required.**
- Cache hits are NOT deducted against rate limits.
- Cache does NOT affect output — response is identical whether caching is used or not.
