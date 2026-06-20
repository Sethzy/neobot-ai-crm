# Prompt Auto-Caching with Claude

**Author:** Lance Martin (@RLanceMartin) — Anthropic
**Source:** https://x.com/RLanceMartin/status/2024573404888911886
**Date:** February 19, 2026

---

## TL;DR

Prompt caching is a great way to save cost + latency when using Claude. Input tokens that use the prompt cache are 10% the cost of non-cached tokens. Auto-caching was just added to the API, making it easy to use. This post explains how it works.

---

## Prompt Caching

Prompt caching lets you cache parts of your prompt so they can be reused across API calls. This is useful when you're sending the same large context (e.g., system prompt, documents, tool definitions) repeatedly. Cached input tokens cost 90% less than non-cached input tokens, and there's a small write cost the first time you cache.

**Cost summary:**

- Cache write tokens: 25% more than base input tokens
- Cache read tokens: 90% less than base input tokens (10% of base cost)
- Cache TTL (time to live): 5 minutes (refreshed on each hit)

**Diagram — The Case for Caching (repeated context across API calls):**

```
  API Call 1                API Call 2                API Call 3
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  System Prompt   │    │  System Prompt   │    │  System Prompt   │
│  (2,000 tokens)  │    │  (2,000 tokens)  │    │  (2,000 tokens)  │
│  ░░░░░░░░░░░░░░  │    │  ░░░░░░░░░░░░░░  │    │  ░░░░░░░░░░░░░░  │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│  Tool Defs       │    │  Tool Defs       │    │  Tool Defs       │
│  (1,000 tokens)  │    │  (1,000 tokens)  │    │  (1,000 tokens)  │
│  ░░░░░░░░░░░░░░  │    │  ░░░░░░░░░░░░░░  │    │  ░░░░░░░░░░░░░░  │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│  Context / Docs  │    │  Context / Docs  │    │  Context / Docs  │
│  (5,000 tokens)  │    │  (5,000 tokens)  │    │  (5,000 tokens)  │
│  ░░░░░░░░░░░░░░  │    │  ░░░░░░░░░░░░░░  │    │  ░░░░░░░░░░░░░░  │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│  Message 1       │    │  Msg 1 + Msg 2   │    │  Msg 1..3 + Msg 3│
│  (200 tokens)    │    │  (400 tokens)    │    │  (600 tokens)    │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │    │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │    │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
└──────────────────┘    └──────────────────┘    └──────────────────┘

░░ = repeated context (same across every call) — 8,000 tokens
▓▓ = unique per call (new messages) — ~200-600 tokens

Without caching: pay full price for ALL tokens every call
With caching:    pay 10% for ░░ repeated tokens, full price only for ▓▓ new tokens
```

---

## How It Works

When you send a request to the Claude API, you can mark certain blocks of your prompt as cacheable using `cache_control` breakpoints. The system will cache the content up to and including the block with the breakpoint. On subsequent requests, if the prefix matches, the cached content is read from cache instead of being reprocessed.

**Key constraints:**

- Caching is prefix-based — the cached content must be at the start of the prompt
- There's a minimum cacheable length (1024 tokens for Sonnet, 2048 for Haiku, 4096 for Opus 4.5+)
- Up to 4 cache breakpoints per request
- The cache has a 5-minute TTL, refreshed on each cache hit

**Diagram — Prefix Matching Across Requests:**

```
  Request 1 (first call)              Request 2 (second call)
┌────────────────────────────┐     ┌────────────────────────────┐
│  System: "You are a..."   │     │  System: "You are a..."   │
│  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │     │  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │
│  Tools: [get_weather, ...] │     │  Tools: [get_weather, ...] │
│  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │     │  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │
│  User: "What's the        │     │  User: "What's the        │
│         weather?"          │     │         weather?"          │
│ ◄── cache_control ──►     │     │  Asst: "It's sunny..."    │
├────────────────────────────┤     │  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │
│                            │     │  User: "And tomorrow?"    │  ← only this is new
│  → CACHE WRITE (1.25x)    │     │ ◄── cache_control ──►     │
│  → cache_creation: 1500   │     ├────────────────────────────┤
│                            │     │                            │
└────────────────────────────┘     │  → CACHE HIT (0.1x)       │
                                   │  → cache_read: 1500        │
                                   │  → cache_creation: 200     │
                                   └────────────────────────────┘

       ▲ identical prefix ▲              ▲ prefix matches ▲
       (written to cache)                (read from cache)
```

---

## Manual Caching

With manual caching, you explicitly add `cache_control` breakpoints to your messages:

```python
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": "You are a helpful assistant that answers questions about a large document...",
            "cache_control": {"type": "ephemeral"}
        }
    ],
    messages=[
        {"role": "user", "content": "What is the main topic?"}
    ]
)
```

The `cache_control` with `type: "ephemeral"` tells the API to cache that block. The cached content will be reused on subsequent requests that share the same prefix.

**Diagram — Manual Cache Breakpoints:**

```
  system: [                                    ┌─────────────────────┐
    {                                          │                     │
      type: "text",                            │  System prompt      │
      text: "You are a helpful...",            │  (1,500 tokens)     │
      cache_control: { type: "ephemeral" }  ◄──┤  ◄── BREAKPOINT     │
    }                                          │                     │
  ]                                            ├─────────────────────┤
  messages: [                                  │                     │
    { role: "user", content: "..." }           │  User message       │
  ]                                            │  (20 tokens)        │
                                               │  (not cached)       │
                                               └─────────────────────┘

  1st call: cache_creation=1500, cache_read=0      (write: 1.25x cost)
  2nd call: cache_creation=0,    cache_read=1500   (read:  0.1x cost)
```

Check the response's `usage` field to see caching metrics:

```python
print(response.usage)
# First call — cache write:
# Usage(input_tokens=20, output_tokens=50,
#        cache_creation_input_tokens=1500,
#        cache_read_input_tokens=0)

# Second call — cache hit:
# Usage(input_tokens=20, output_tokens=50,
#        cache_creation_input_tokens=0,
#        cache_read_input_tokens=1500)
```

---

## Auto-Caching

Auto-caching is a new feature that automatically handles prompt caching — no need to manually add `cache_control` breakpoints. When enabled, the API automatically determines what to cache based on the prompt structure.

To enable auto-caching, add a single top-level `cache_control`:

```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    cache_control={"type": "ephemeral"},
    system="You are an AI assistant...",
    messages=[...]
)
```

With auto-caching enabled, the system automatically caches:

1. **System prompt** — cached first
2. **Tool definitions** — cached next
3. **Conversation messages** — cached progressively as the conversation grows

The caching is applied automatically at each of these boundaries. You don't need to add any per-block `cache_control` breakpoints — the system handles it.

---

## The Cache Is Prefix-Based

This is the most important thing to understand about prompt caching. The cache works on **prefixes** of the prompt. This means:

- The cached content must be at the **beginning** of the prompt
- Any change to the prefix invalidates the cache
- Content after the cached prefix can change freely

This is why the auto-caching order matters:

1. System prompt (most stable, cached first)
2. Tool definitions (stable across calls)
3. Messages (grow over time, cached progressively)

In a multi-turn conversation, as messages accumulate, the cache grows. Each new turn adds to the cache, so previous messages don't need to be reprocessed.

**Diagram — Auto-Caching Layers:**

```
┌─────────────────────────────────────────────────────────┐
│  System Prompt                            cached first  │
├─────────────────────────────────────────────────────────┤
│  Tool Definitions                         cached next   │
├─────────────────────────────────────────────────────────┤
│  Messages (growing)              cached progressively   │
└─────────────────────────────────────────────────────────┘

Turn 1: [System + Tools + Msg1]           → all cached (write)
Turn 2: [System + Tools + Msg1 + Msg2]    → prefix hit, only Msg2 is new
Turn 3: [System + Tools + Msg1..3 + Msg3] → prefix hit, only Msg3 is new
```

---

## Costs in Practice

Practical example — multi-turn conversation with a large system prompt (2000 tokens), tool definitions (1000 tokens), and growing message history:

| Turn | Total Input Tokens | Cached Tokens | Non-cached Tokens | Effective Cost |
|------|-------------------|---------------|-------------------|----------------|
| 1    | 3,200             | 0             | 3,200             | 100%           |
| 2    | 3,400             | 3,200         | 200               | ~16%           |
| 3    | 3,800             | 3,400         | 400               | ~20%           |
| 4    | 4,200             | 3,800         | 400               | ~19%           |

After the first turn, you're only paying full price for the new tokens added in each turn. The previously seen prefix is read from cache at 10% cost.

**Diagram — Cost Savings Over a Multi-Turn Conversation:**

```
Turn 1:  ████████████████████████████████  3,200 tok @ full price     = 100%
         [write to cache — 1.25x]

Turn 2:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██  3,200 cached + 200 new   = ~16%
         [cache hit 0.1x]          [full]

Turn 3:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████  3,400 cached + 400 new = ~20%
         [cache hit 0.1x]               [full]

Turn 4:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████  3,800 cached + 400 new = ~19%
         [cache hit 0.1x]                    [full]

░░ = cached tokens (10% cost)    ██ = new tokens (full cost)

By turn 10+: effective cost approaches ~5-10% of non-cached price
```

---

## Key Points to Remember

- **Auto-caching is the easy path** — just add a top-level `cache_control` and you get caching automatically
- **Prefix-based** — keep your stable content (system prompt, tools) at the beginning
- **5-minute TTL** — cache expires after 5 minutes of no hits; keep requests flowing to maintain the cache
- **Cost savings compound** — the longer the conversation, the more you save
- **Check usage metrics** — monitor `cache_creation_input_tokens` and `cache_read_input_tokens` in responses to verify caching is working

Auto-caching makes it easy to get significant cost savings with Claude, especially for multi-turn conversations with large system prompts and tool definitions.

---

*Note: This article was transcribed from a screenshot. Some minor details may have slight imprecision due to image quality, but all sections, code examples, tables, and technical content are captured.*
