# Google Gemini Context Caching — Technical Reference

- **Source:** Google AI for Developers
- **URL:** https://ai.google.dev/gemini-api/docs/caching
- **Date accessed:** 2026-03-20

---

## Overview

Gemini offers two caching mechanisms:

1. **Implicit Caching** — Enabled by default, automatic cost savings with no developer action required.
2. **Explicit Caching** — Manually configured with named cache objects and full CRUD API.

---

## Minimum Token Requirements

| Model | Minimum Tokens |
|-------|---------------|
| Gemini 3.1 Pro Preview | 4,096 |
| Gemini 3 Flash Preview | 1,024 |
| Gemini 2.5 Flash | 1,024 |
| Gemini 2.5 Pro | 4,096 |

---

## TTL

- **Default TTL:** 1 hour (3,600 seconds).
- **Customizable:** Any duration — no minimum or maximum bounds.
- TTL can be updated after cache creation.
- Can set absolute `expire_time` instead of relative TTL.

---

## Pricing

Three billing components:
1. **Cached token usage** — reduced rate vs. regular input.
2. **Storage duration** — charged based on TTL and cached token count (token-hours).
3. **Non-cached tokens + output tokens** — standard rates.

---

## Explicit Caching — Create Cache (Python)

```python
from google import genai
from google.genai import types

client = genai.Client()

cache = client.caches.create(
    model='models/gemini-3-flash-preview',
    config=types.CreateCachedContentConfig(
        display_name='my cached context',
        system_instruction='You are an expert analyzer...',
        contents=[uploaded_file],
        ttl="300s",
    )
)

response = client.models.generate_content(
    model='models/gemini-3-flash-preview',
    contents='Analyze this...',
    config=types.GenerateContentConfig(cached_content=cache.name)
)
```

---

## Cache Management

Full CRUD API: `client.caches.create()`, `.list()`, `.get()`, `.update()`, `.delete()`.

---

## Optimal Use Cases

- **Chatbots** — extensive system instructions reused across turns.
- **Video analysis** — repetitive analysis of lengthy video files.
- **Document Q&A** — recurring queries against large document sets.
- **Code review** — frequent repository analysis.

---

## Comparison with Anthropic

| Aspect | Gemini | Anthropic |
|--------|--------|-----------|
| Caching modes | Implicit (auto) + Explicit (named cache objects) | Explicit only (`cache_control`) |
| Cache lifecycle | Named object with CRUD API | Ephemeral, attached to request prefixes |
| TTL | Default 1 hr, fully customizable | 5 min, auto-refreshed on hit |
| Minimum tokens | 1,024 (Flash) / 4,096 (Pro) | 1,024–4,096 (model-dependent) |
| Multimodal | Video, PDF, images, text cacheable | Text and images only |
| Cache management | Full CRUD API | No management API — automatic eviction |
