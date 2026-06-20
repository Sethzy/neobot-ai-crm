# How Prompt Caching Works — Paged Attention and Automatic Prefix Caching

**Author:** Sankalp
**Source:** https://sankalp.bearblog.dev/how-prompt-caching-works/
**Date:** December 1, 2025

---

## TL;DR

Prompt caching works by reusing previously computed KV tensors for identical prompt prefixes. Under the hood, inference engines like vLLM use **paged attention** (inspired by OS virtual memory paging) to manage KV cache in fixed-size blocks, and **content-addressable hashing** with parent-chaining to find the longest cached prefix across requests. This is what makes prompt caching work across users and conversations — it's per-content, not per-request.

---

## Motivation — The Common Mistake

The author built a chat + tool calling feature and made a classic error: adding long user-specific data at the end of the system prompt, thinking cache hits only matter within a single conversation.

**The missed insight:** Cache hits can start at the system prompt across different users. Your system prompt can be shared across all conversations from your API key org.

**Wrong mental model:** Inference as a synchronous engine — a single blocking process for one user.
**Correct mental model:** Async distributed (multi-GPU, multi-node) systems with schedulers and message queues. KV-cache reuse enables prompt caching across all concurrent requests.

---

## Tips to Hit Prompt Cache More Consistently

### Why it matters

Code generation agents are a good example where context grows quickly and input-to-output token ratio is very large (100:1 in Manus). Prompt caching gives up to 10x savings on input tokens.

**Diagram — Pricing Comparison:**

```
                          Anthropic (Sonnet 4.5)        OpenAI (GPT-4o)
                         ┌─────────────────────────┐  ┌─────────────────────────┐
  Regular input tokens   │  $3.00 / MTok            │  │  $2.50 / MTok            │
                         ├─────────────────────────┤  ├─────────────────────────┤
  Cache WRITE tokens     │  $3.75 / MTok (1.25x) ▲  │  │  $2.50 / MTok (no extra) │
                         ├─────────────────────────┤  ├─────────────────────────┤
  Cache READ tokens      │  $0.30 / MTok (0.1x)  ▼  │  │  $1.25 / MTok (0.5x)  ▼  │
                         └─────────────────────────┘  └─────────────────────────┘

  Anthropic: 90% discount on reads, but 25% surcharge on writes
  OpenAI:    50% discount on reads, no surcharge on writes

  "I was calling Anthropic greedy because they charge more for cache writes.
   From a based engineer lens, storing KV tensors in GPU VRAM has a cost."
```

**Diagram — KV Cache Sharing Patterns:**

```
  Multi-turn Chat          RAG / Retrieval         Agent Tool Calls
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│▓▓ System Prompt  │    │▓▓ System Prompt  │    │▓▓ System Prompt  │
│▓▓ (shared)       │    │▓▓ (shared)       │    │▓▓ (shared)       │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│▓▓ Msg 1          │    │░░ Retrieved      │    │▓▓ Tool Defs      │
│▓▓ Msg 2          │    │░░ Docs (vary)    │    │▓▓ (shared)       │
│▓▓ (growing,      │    │                  │    ├──────────────────┤
│▓▓  cached)       │    │                  │    │▓▓ Action 1 + Obs │
├──────────────────┤    ├──────────────────┤    │▓▓ Action 2 + Obs │
│░░ New message    │    │░░ User query     │    │▓▓ (cached)       │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│   Output         │    │   Output         │    │░░ New action     │
└──────────────────┘    └──────────────────┘    ├──────────────────┤
                                                │   Output         │
▓▓ = shareable/cached (blue)                    └──────────────────┘
░░ = non-shareable (green)
   = output (yellow)
```

### Practical tips

1. **Make the prefix stable** — Remove all user-specific or dynamic content from system prompt. This makes it possible for other users to hit prompt cache even for the system prompt message as it will be a common prefix in the KV-cache blocks.

2. **Keep context append-only** — Don't truncate or modify previous tool call outputs in the messages array. This breaks the prefix. Prefer cost/latency benefits of caching over context truncation.

3. **Use deterministic serialization** — Use `sort_keys=True` when serializing JSON in tool call outputs. Even if two objects are semantically identical, different key ordering produces different strings → different cache keys → cache misses.

4. **Don't change tool call definitions dynamically** — Tool definitions are usually stored before or after the system prompt. Changing or removing tool definitions will break the entire prefix afterwards.

**Diagram — Prompt Structure for Optimal Cache Hits:**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  System Instructions (static)                      │  │
│  │  Tool Definitions (static)                         │  │  ◄── STABLE PREFIX
│  │  Static Context / Few-shot Examples                │  │      (cache this)
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Conversation History (append-only)                │  │  ◄── GROWING PREFIX
│  │  Previous tool calls + outputs                     │  │      (incrementally cached)
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  New user message / query (dynamic)                │  │  ◄── VARIABLE SUFFIX
│  └────────────────────────────────────────────────────┘  │      (never cached)
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## LLM Inference Basics

### Prefill and Decode

Two stages of LLM inference:

1. **Prefill** (input processing → first token): Processes entire prompt. Each token attends to previous tokens via causal self-attention, calculating Q, K, V tensors across all transformer layers. **Compute/GPU FLOPs bound** — highly parallel thanks to matrix multiplication.

2. **Decode** (output generation): **Memory-bound** — each step processes just 1 token but must load the entire KV cache from GPU memory.

**Diagram — Time to First Token (TTFT) Pipeline:**

```
┌───────────────┐     ┌───────────────────────────┐     ┌────────────────────────────────────┐
│               │     │                           │     │                                    │
│  Input Prompt │────►│  PREFILL                  │────►│  DECODE                            │
│               │     │  (process all tokens      │     │  (generate tokens one-by-one)      │
│  "The capital │     │   in parallel)            │     │                                    │
│   of France   │     │                           │     │  token → token → token → ... → EOS │
│   is"         │     │  compute-bound            │     │  memory-bound                      │
│               │     │  GPU FLOPs intensive      │     │  load KV cache each step           │
└───────────────┘     └─────────────┬─────────────┘     └────────────────────────────────────┘
                                    │
                                    ▼
                              First Token
                              ("Paris")
                                 TTFT
                        ◄────────────────►
                        Time to First Token
```

**Diagram — Prefill vs Decode:**

```
PREFILL (compute-bound, parallel)
┌──────────────────────────────────────────────────────┐
│  [The] [capital] [of] [France] [is]                  │
│    ↓       ↓       ↓      ↓      ↓                  │
│   Q,K,V  Q,K,V  Q,K,V  Q,K,V  Q,K,V  ← all at once│
│    ↓       ↓       ↓      ↓      ↓                  │
│              causal self-attention                    │
│                      ↓                               │
│                   "Paris"  (first token)              │
└──────────────────────────────────────────────────────┘

DECODE (memory-bound, sequential)
┌──────────────────────────────────────────────────────┐
│  Step 1: [Paris]  → load ALL KV cache → "which"     │
│  Step 2: [which]  → load ALL KV cache → "has"       │
│  Step 3: [has]    → load ALL KV cache → "the"       │
│  Step 4: [the]    → load ALL KV cache → "Eiffel"    │
│                                                      │
│  Each step: 1 new token computed, entire cache loaded│
└──────────────────────────────────────────────────────┘
```

### KV Caching

Without KV cache, each decode iteration recomputes KV tensors for ALL previous tokens — wasteful:

```
[The]→K₁V₁  [Capital]→K₂V₂  [of]→K₃V₃  [France]→K₄V₄  [is]→K₅V₅  [Paris]→K₆V₆  [which]→K₇V₇  [has]→K₈V₈
 WASTE        WASTE           WASTE       WASTE           WASTE       WASTE          WASTE         NEW
```

With KV cache: store KV tensors in GPU memory, reuse them. Each decode step only computes KV for the 1 new token and appends to cache.

**Diagram — Decode Without vs With KV Cache:**

```
WITHOUT KV CACHE (wasteful — recomputes everything each step)
┌──────────────────────────────────────────────────────────────────┐
│ Iter 1: [The capital of France is]      → compute ALL → "Paris" │
│ Iter 2: [The capital of France is Paris] → compute ALL → "which"│
│ Iter 3: [... is Paris which]            → compute ALL → "has"   │
│ Iter 4: [... Paris which has]           → compute ALL → "the"   │
│                                                                  │
│ Every iteration recomputes K,V for ALL previous tokens!          │
└──────────────────────────────────────────────────────────────────┘

WITH KV CACHE (efficient — only compute new token, read rest from cache)
┌──────────────────────────────────────────────────────────────────┐
│ Prefill: [The capital of France is]                              │
│          compute K,V for all 5 tokens → store in cache → "Paris"│
│                                                                  │
│ Iter 1:  x = [Paris]  (1 token only)                             │
│          cache: K,V for [The capital of France is] + [Paris]     │
│          → "which"                                               │
│                                                                  │
│ Iter 2:  x = [which]  (1 token only)                             │
│          cache: ... + [Paris] + [which]                          │
│          → "has"                                                 │
│                                                                  │
│ Each step: compute 1 new token, read rest from cache (O(1) add) │
└──────────────────────────────────────────────────────────────────┘
```

---

## The Memory Problem

**Diagram — Traditional KV Cache (Contiguous Allocation Per Request):**

```
                         GPU Memory (VRAM)
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Request A                                               │
│  ┌──────────────────────────────────────────────────┐    │
│  │ K₁V₁ K₂V₂ K₃V₃ K₄V₄ K₅V₅ ... K₁₀₂₄V₁₀₂₄    │    │
│  │ ◄──────── one big contiguous block ────────────► │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Request B                                               │
│  ┌──────────────────────────────────────────────────┐    │
│  │ K₁V₁ K₂V₂ K₃V₃ K₄V₄ K₅V₅ ... K₁₀₂₄V₁₀₂₄    │    │
│  │ ◄──────── one big contiguous block ────────────► │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Problems:                                               │
│  • Must pre-allocate for max sequence length             │
│  • Can't share identical prefixes between requests       │
│  • Fragmentation when requests finish at different times │
│  • Discarded after generation — no reuse across requests │
└──────────────────────────────────────────────────────────┘
```

### KV cache size scales linearly

```
kv_size = 2 (K+V) × layers × kv_heads × head_dim × seq_len × precision

Example (7B model, 32 layers, 32 KV heads, 128 head_dim, float16):
  Per token:         ~0.5 MB
  1K context:        ~512 MB per request
  100 concurrent:    ~50 GB just for KV cache
```

### Classic OS memory problems in KV cache

**Diagram — Memory Fragmentation:**

```
  INTERNAL FRAGMENTATION              EXTERNAL FRAGMENTATION

┌────────────────────────┐         ┌────────────────────────┐
│▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░│         │▓▓▓▓▓▓▓▓│  free  │▓▓▓▓▓│
│ Request A: 100 tokens  │         │ Req A   │ (small)│Req B│
│ Allocated: 1024 tokens │         ├─────────┤        ├─────┤
│ WASTED: 924 tokens     │         │  free   │▓▓▓▓▓▓▓│free │
│                        │         │ (small) │ Req C  │(sm) │
└────────────────────────┘         └────────────────────────┘
                                    Total free: enough for new request
 Pre-allocated for max length        But not contiguous → allocation fails!
 → unused space wasted
```

**Diagram — KV Cache Fragmentation (from vLLM Paper):**

```
  Request A     Request B     Request C          GPU Memory Layout
  (seq=5)       (seq=2)       (seq=4)
                                              ┌─────────────────────────┐
  Allocated     Allocated     Allocated       │▓▓▓▓▓░░░│▓▓░░░░░░│▓▓▓▓░░░░│
  for max=8     for max=8     for max=8       │ Req A  │ Req B  │ Req C  │
                                              └─────────────────────────┘
  ▓▓▓▓▓░░░      ▓▓░░░░░░      ▓▓▓▓░░░░
  used  waste    used waste    used waste       ▓ = used    ░ = wasted

  Three types of waste:
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. INTERNAL FRAGMENTATION: pre-allocated for max (1024)     │
  │    but only using 100 tokens → 924 tokens wasted per req    │
  │                                                             │
  │ 2. EXTERNAL FRAGMENTATION: requests finish at different     │
  │    times, leaving scattered gaps → can't fit new requests   │
  │                                                             │
  │ 3. REDUNDANCY: 100 requests with same system prompt         │
  │    = 100 identical copies of KV cache in GPU memory         │
  └─────────────────────────────────────────────────────────────┘
```

### Redundancy problem

100 requests with same system prompt = 100 copies of the same KV cache. If only we had blocks and pointers... like how operating systems solved this decades ago.

**Diagram — OS Paging Concept (the inspiration for Paged Attention):**

```
  VIRTUAL MEMORY (per process)          PAGE TABLE           PHYSICAL MEMORY (RAM)
  ┌──────────────────────┐                                   ┌──────────────────────┐
  │  Virtual Page 0      │──────┐    ┌──────────────┐        │                      │
  ├──────────────────────┤      └───►│ VP0 → PP3    │───────►│  Physical Page 3     │
  │  Virtual Page 1      │──────┐   │ VP1 → PP7    │───┐    ├──────────────────────┤
  ├──────────────────────┤      └──►│ VP2 → PP1    │─┐ │    │  (free)              │
  │  Virtual Page 2      │──────┐   │ VP3 → PP5    │ │ │    ├──────────────────────┤
  ├──────────────────────┤      │   └──────────────┘ │ │    │                      │
  │  Virtual Page 3      │──────┤                    │ └───►│  Physical Page 7     │
  └──────────────────────┘      │                    │      ├──────────────────────┤
                                │                    └─────►│  Physical Page 1     │
  Pages can be SCATTERED        └──────────────────────────►│  Physical Page 5     │
  in physical memory!                                       └──────────────────────┘

  Key insight: contiguous virtual addresses → scattered physical locations
  Same idea applied to KV cache blocks in GPU memory
```

---

## Paged Attention — vLLM's Solution

Inspired by OS virtual memory paging. Instead of one big contiguous chunk per request, pre-allocate a pool of **fixed-size blocks** (16 tokens each by default) at startup.

**Diagram — Simplified vLLM Engine Overview:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         vLLM Engine                                 │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │              │    │                  │    │                   │  │
│  │  Scheduler   │───►│  Model Executor  │◄──►│  KV Cache Manager │  │
│  │              │    │                  │    │                   │  │
│  │  • waiting   │    │  • prefill       │    │  • BlockPool      │  │
│  │    queue     │    │  • decode        │    │  • BlockHashMap   │  │
│  │  • running   │    │  • forward pass  │    │  • FreeBlockQueue │  │
│  │    queue     │    │                  │    │  • alloc/free     │  │
│  │  • preempt   │    │                  │    │                   │  │
│  └──────┬───────┘    └──────────────────┘    └───────────────────┘  │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GPU Memory Pool                                             │   │
│  │  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐ │   │
│  │  │ B0  ││ B1  ││ B2  ││ B3  ││ B4  ││ B5  ││ B6  ││ ... │ │   │
│  │  │16tok││16tok││16tok││16tok││16tok││16tok││16tok││     │ │   │
│  │  └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘ │   │
│  │  Pre-allocated fixed-size blocks at startup                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Block structure

```python
@dataclass
class KVCacheBlock:
    block_id: int          # which physical GPU memory block
    ref_cnt: int = 0       # how many requests are using this block
    _block_hash: BlockHashWithGroupId | None = None  # content hash
```

### Request to blocks — logical mapping

```
Request: "The capital of France is Paris which is known for..." (50 tokens)

Token positions:  [0-15]      [16-31]     [32-47]     [48-49]
                    ↓            ↓           ↓           ↓
Logical blocks:  Block 0     Block 1     Block 2     Block 3
                 (full)      (full)      (full)      (partial)

block_index = token_position // block_size   # which block
offset      = token_position % block_size    # position within block
```

### Block hashing — content-addressable lookup

```python
def hash_block_tokens(parent_block_hash, curr_block_token_ids, extra_keys):
    if not parent_block_hash:
        parent_block_hash = NONE_HASH  # seed for first block
    return BlockHash(
        sha256((parent_block_hash, tuple(curr_block_token_ids), extra_keys))
    )
```

Three inputs per hash:
- `parent_block_hash` — hash of previous block (or seed for block 0)
- `curr_block_token_ids` — token IDs in this block
- `extra_keys` — optional metadata (cache salt, LoRA adapter, multimodal inputs)

```
hash(block 0) = sha256(NONE_HASH,      tokens[0:16],  extras)
hash(block 1) = sha256(hash(block 0),  tokens[16:32], extras)
hash(block 2) = sha256(hash(block 1),  tokens[32:48], extras)
```

**Why parent chaining?** Because of causal attention. Token 32's KV values depend on tokens 0-31. If block 2's hash matches, blocks 0-1 are **guaranteed identical** — one lookup validates the entire prefix.

**Diagram — Parent Hash Chaining:**

```
Block 0                   Block 1                   Block 2
tokens[0:16]              tokens[16:32]             tokens[32:48]

┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ NONE_HASH (seed)│      │ hash(block 0)   │      │ hash(block 1)   │
│ + tokens[0:16]  │─────►│ + tokens[16:32] │─────►│ + tokens[32:48] │
│ + extras        │      │ + extras        │      │ + extras        │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ hash = 0xA3F... │      │ hash = 0x7B2... │      │ hash = 0xE91... │
└─────────────────┘      └─────────────────┘      └─────────────────┘

Each hash encodes its ENTIRE history.
If block 2's hash (0xE91...) matches → blocks 0 and 1 are GUARANTEED identical.
One O(1) lookup validates the whole prefix!

Why not hash each block independently?
  → Causal attention: token 32's KV depends on tokens 0-31
  → Reusing block 2's KV assumes blocks 0-1 are identical
  → Independent hashes can't guarantee that
  → Parent chaining solves this
```

### Allocation flow

**Diagram — Block Allocation:**

```
Request arrives
      │
      ▼
Compute block hashes for all full blocks
      │
      ▼
For each block hash:
      │
      ├── Hash found in BlockHashToBlockMap?
      │       │
      │    YES ▼                    NO ▼
      │    Reuse block              Pop from FreeKVCacheBlockQueue
      │    (ref_cnt++)              Allocate new block
      │       │                         │
      │       ▼                         ▼
      └──► Build block table (logical → physical GPU memory)
                  │
                  ▼
           Forward pass (prefill) writes KV tensors
           into the physical blocks
```

**Diagram — Block Reuse Across Requests:**

```
Request 0: "System prompt. Tool defs. What is the capital of France?"
Request 2: "System prompt. Tool defs. Tell me about Python."

                  Request 0                    Request 2
                  Block Table                  Block Table
               ┌──────────────┐            ┌──────────────┐
Logical 0  ──► │ Physical  7  │ ◄────────► │ Physical  7  │ ◄── Logical 0
               ├──────────────┤            ├──────────────┤
Logical 1  ──► │ Physical 12  │ ◄────────► │ Physical 12  │ ◄── Logical 1
               ├──────────────┤            ├──────────────┤
Logical 2  ──► │ Physical  3  │ ◄────────► │ Physical  3  │ ◄── Logical 2
               ├──────────────┤            ├──────────────┤
Logical 3  ──► │ Physical 19  │            │ Physical 25  │ ◄── Logical 3
               └──────────────┘            └──────────────┘
                  (unique)                    (unique)

Blocks 7, 12, 3: ref_cnt = 2 (shared — same system prompt + tools)
Blocks 19, 25:   ref_cnt = 1 (unique per request)

When both finish: ref_cnt → 0, blocks return to free queue (LRU eviction)
```

---

## Prefix Caching — The Full Picture

### The key insight

Cached blocks skip prefill computation. Find the **longest prefix of cached blocks** amongst multiple requests → skip prefill entirely for those blocks.

### Why "prefix"?

Causal attention: each token can only attend to tokens before it. If you change anything before position N, the KV tensor values at position N will differ. KV values are only valid if the **entire prefix is identical**.

### Finding the longest cache hit

```python
def find_longest_cache_hit(block_hashes, block_pool):
    computed_blocks = []
    for block_hash in block_hashes:
        if cached_block := block_pool.get_cached_block(block_hash):
            computed_blocks.append(cached_block)
        else:
            break  # stop at first miss — must be contiguous from start
    return computed_blocks
```

Walk through block hashes sequentially (block 0 → N) until first miss. The consecutive hits from block 0 are the cached prefix.

**Diagram — Prefix Cache Lookup:**

```
Request: "The capital of France is Paris which..."
         [block 0] [block 1] [block 2] [block 3]
              ↓         ↓         ↓         ↓
Lookup:     HIT       HIT       MISS      MISS
              ↓         ↓         ↓         ↓
Prefill:  [skip]    [skip]   [compute]  [compute]

Blocks 0 and 1: KV tensors already in GPU memory from previous request
                 → just point to them in block table, no recomputation
Blocks 2 and 3: new content → must run through transformer layers
```

### Cross-request caching dry run

**Diagram — Prefix Caching Across Requests:**

```
t=0: Request 1 arrives
┌───────────────────────────────────────────────────────────────┐
│  [Block 0: System]  [Block 1: System]  [Block 2: Tools]      │
│       MISS               MISS              MISS               │
│     compute            compute           compute              │
│                                                               │
│  [Block 3: "What is"]  [Block 4: "capital of France?"]       │
│       MISS                   MISS                             │
│     compute                compute                            │
└───────────────────────────────────────────────────────────────┘
  All blocks computed, cached, Request 1 starts decoding...

t=1: Request 2 arrives (different user, same system prompt + tools)
┌───────────────────────────────────────────────────────────────┐
│  [Block 0: System]  [Block 1: System]  [Block 2: Tools]      │
│       HIT ✓              HIT ✓             HIT ✓             │
│      skip               skip              skip               │
│                                                               │
│  [Block 3: "Tell me"]  [Block 4: "about Python"]             │
│       MISS                   MISS                             │
│     compute                compute                            │
└───────────────────────────────────────────────────────────────┘
  Blocks 0-2 reused from Request 1's cache!
  Only Blocks 3-4 need computation.

Same system prompt = same hash = same cached KV blocks
User B benefits from blocks cached by User A
```

---

## Key Insight

**The original mental model was wrong.** Caching is per-content, not per-conversation. Prefix caching works at the token level, not the request level — which is exactly why it works across requests.

This is why providers need a static prefix: any change in the prefix breaks the entire hash chain.

---

## Code Reference (vLLM v1)

```
vllm/
├── utils/
│   └── hashing.py
│       └── sha256()                     # Hash function for block content
│
└── v1/core/
    ├── kv_cache_utils.py
    │   ├── KVCacheBlock                 # Block metadata (block_id, ref_cnt, hash)
    │   ├── hash_block_tokens()          # Block hash with parent chaining
    │   └── BlockHash                    # Type alias for 32-byte hash
    │
    ├── block_pool.py
    │   ├── BlockHashToBlockMap          # Hash → KVCacheBlock lookup dictionary
    │   └── BlockPool                    # Manages free queue and cached blocks
    │
    ├── kv_cache_manager.py
    │   ├── get_computed_blocks()        # Entry point for prefix cache lookup
    │   └── allocate_slots()             # Allocates blocks for cache misses
    │
    ├── single_type_kv_cache_manager.py
    │   └── find_longest_cache_hit()     # Walks hashes until first miss
    │
    └── sched/
        └── scheduler.py                 # Orchestrates the allocation flow
```

---

## References

- [vLLM Paper](https://arxiv.org/abs/2309.06180) — Efficient Memory Management for Large Language Model Serving with PagedAttention
- [Manus Context Engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- [SGLang Blog](https://lmsys.org/blog/2024-01-17-sglang/) — Radix attention (alternative approach)
- [Aleksa Gordic's vLLM Blog](https://gordicaleksa.medium.com/eli5-vllm-pagedattention-and-more-a428e9bf5d64)
- [Karpathy's nanochat](https://github.com/karpathy/nanochat) — Clean KV cache implementation
- [Sebastian Raschka's KV Cache Guide](https://magazine.sebastianraschka.com/p/understanding-and-coding-the-kv-cache)
