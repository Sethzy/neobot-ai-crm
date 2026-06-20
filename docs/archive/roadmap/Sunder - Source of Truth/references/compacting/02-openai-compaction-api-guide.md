# OpenAI Compaction API Guide

**Source:** https://developers.openai.com/api/docs/guides/compaction
**Retrieved:** 2026-03-06

---

## Overview

Compaction reduces context size while preserving essential state for long-running
conversations. Balances quality, cost, and latency as interactions grow.

Two approaches:
1. **Server-side compaction** — automatic, in-stream
2. **Standalone compact endpoint** — explicit, stateless

---

## 1. Server-Side Compaction

**How it works:**
- Enable via `context_management` with `compact_threshold` in Responses create requests
- When rendered tokens cross the threshold, the server automatically triggers compaction
- No separate `/responses/compact` call needed
- Response stream includes the encrypted compaction item
- ZDR-friendly when `store=false` is set

**Key characteristics:**
- Compaction item carries forward critical prior state and reasoning using fewer tokens
- Opaque format — not meant for human interpretation
- For stateless input-array chaining: append output items normally
- With `previous_response_id`: pass only new user messages; the ID carries context forward

**Latency optimization:** After appending output items, you can drop items preceding
the most recent compaction item to reduce request size and long-tail latency. The
latest compaction item preserves necessary context. If using `previous_response_id`
chaining, avoid manual pruning.

### Server-Side User Journey

1. Call `/responses` with `context_management` and `compact_threshold`
2. As response streams, server triggers compaction when context exceeds threshold
3. Compaction output item emits in the same stream; context gets pruned before inference continues
4. Continue using either stateless input-array chaining (append all outputs) or `previous_response_id` chaining (new message only per turn)

### Server-Side Example (Python)

```python
conversation = [
    {
        "type": "message",
        "role": "user",
        "content": "Let's begin a long coding task.",
    }
]

while keep_going:
    response = client.responses.create(
        model="gpt-5.3-codex",
        input=conversation,
        store=False,
        context_management=[{"type": "compaction", "compact_threshold": 200000}],
    )

    conversation.extend(response.output)

    conversation.append(
        {
            "type": "message",
            "role": "user",
            "content": get_next_user_input(),
        }
    )
```

---

## 2. Standalone Compact Endpoint

**Purpose:** Explicit control for stateless compaction in long-running workflows;
fully stateless and ZDR-friendly.

**How it works:**
- Send full context window (messages, tools, other items)
- Endpoint returns new compacted context window for next `/responses` call
- Returns encrypted compaction item plus retained items from previous window
- **Do not prune the returned window** — pass it as-is to your next call

### Standalone User Journey

1. Use `/responses` normally with user messages, assistant outputs, and tool interactions
2. Call `/responses/compact` when context grows large (window must still fit model's context limit)
3. Pass returned compacted window (including compaction item) to subsequent `/responses` calls

### Standalone Example (Python)

```python
# Full window collected from prior turns
long_input_items_array = [...]

# 1) Compact the current window
compacted = client.responses.compact(
    model="gpt-5.4",
    input=long_input_items_array,
)

# 2) Start the next turn by appending a new user message
next_input = [
    *compacted.output,  # Use compact output as-is
    {
        "type": "message",
        "role": "user",
        "content": user_input_message(),
    },
]

next_response = client.responses.create(
    model="gpt-5.4",
    input=next_input,
    store=False,  # Keep the flow ZDR-friendly
)
```

---

## Key Technical Details

| Aspect                | Detail                                                      |
|-----------------------|-------------------------------------------------------------|
| Compaction item       | Opaque, encrypted blob — not human-readable                  |
| Encryption            | Fernet (AES-128-CBC + HMAC-SHA256) — key on OpenAI servers   |
| Trigger               | Token count exceeds `compact_threshold`                      |
| Chaining (stateless)  | Append all output items (including compaction) to next input |
| Chaining (stateful)   | Use `previous_response_id` — new message only per turn       |
| Latency optimization  | Drop items before most recent compaction item                |
| ZDR compatibility     | Both approaches work with `store=false`                      |

---

## Pipeline Diagram

```
                    COMPACTION FLOW
                    ===============

1. Normal conversation grows:

   [msg1] [msg2] [msg3] ... [msgN]  →  tokens exceed threshold
                                              |
                                              v
2. Server triggers compaction:

   [msg1..N]  →  compactor LLM  →  [encrypted summary blob]
                                              |
3. Stream emits compaction item:              |
                                              v
   response.output = [...normal_output, compaction_item]

4. Next turn:

   input = [compaction_item, new_user_message]
            ↑                    ↑
            compressed history   fresh input
```
