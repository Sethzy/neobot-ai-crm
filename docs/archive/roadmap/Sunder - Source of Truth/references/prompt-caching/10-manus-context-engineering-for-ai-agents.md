# Context Engineering for AI Agents: Lessons from Building Manus

**Author:** Yichao 'Peak' Ji — Manus
**Source:** https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
**Date:** July 18, 2025

---

## Background

Manus bet on context engineering over fine-tuning. This allows shipping improvements in hours instead of weeks, and keeps the product orthogonal to underlying models: if model progress is the rising tide, Manus wants to be the boat, not the pillar stuck to the seabed.

Context engineering turned out to be anything but straightforward — an experimental science. Manus rebuilt their agent framework four times, each time after discovering a better way to shape context. They refer to this manual process of architecture searching, prompt fiddling, and empirical guesswork as "Stochastic Graduate Descent".

---

## 1. Design Around the KV-Cache

**If you had to choose just one metric, the KV-cache hit rate is the single most important metric for a production-stage AI agent.** It directly affects both latency and cost.

### How agents work

After receiving user input, the agent proceeds through a chain of tool uses. In each iteration, the model selects an action based on current context. That action is executed in the environment (e.g., Manus's virtual machine sandbox) to produce an observation. The action and observation are appended to the context, forming the input for the next iteration. This loop continues until the task is complete.

The context grows with every step, while the output — usually a structured function call — remains relatively short. This makes the prefill-to-decode ratio highly skewed. In Manus, the average input-to-output token ratio is around **100:1**.

**Diagram — Agent Loop:**

```
                    ┌──────────────┐
                    │  User Input  │
                    └──────┬───────┘
                           ▼
              ┌────────────────────────┐
              │    Model (LLM)         │
              │  selects action from   │
              │  current context       │
              └────────────┬───────────┘
                           ▼
              ┌────────────────────────┐
              │    Environment         │
              │  executes action,      │
              │  produces observation  │
              └────────────┬───────────┘
                           ▼
              ┌────────────────────────┐
              │  Append action +       │
              │  observation to        │◄──── context grows
              │  context               │      every step
              └────────────┬───────────┘
                           │
                    ┌──────┴───────┐
                    │  Task done?  │
                    └──┬───────┬───┘
                   No  │       │ Yes
                       ▼       ▼
                    (loop)   (done)
```

**Diagram — KV-Cache Growth Across Iterations:**

```
  Step 1           Step 2           Step 3           Step 4
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│░░ System   │  │▓▓ System   │  │▓▓ System   │  │▓▓ System   │
│░░ Prompt   │  │▓▓ Prompt   │  │▓▓ Prompt   │  │▓▓ Prompt   │
├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤
│░░ Tools    │  │▓▓ Tools    │  │▓▓ Tools    │  │▓▓ Tools    │
├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤
│░░ Action 1 │  │▓▓ Action 1 │  │▓▓ Action 1 │  │▓▓ Action 1 │
│░░ Obs 1    │  │▓▓ Obs 1    │  │▓▓ Obs 1    │  │▓▓ Obs 1    │
│            │  ├────────────┤  ├────────────┤  ├────────────┤
│            │  │░░ Action 2 │  │▓▓ Action 2 │  │▓▓ Action 2 │
│            │  │░░ Obs 2    │  │▓▓ Obs 2    │  │▓▓ Obs 2    │
│            │  │            │  ├────────────┤  ├────────────┤
│            │  │            │  │░░ Action 3 │  │▓▓ Action 3 │
│            │  │            │  │░░ Obs 3    │  │▓▓ Obs 3    │
│            │  │            │  │            │  ├────────────┤
│            │  │            │  │            │  │░░ Action 4 │
│            │  │            │  │            │  │░░ Obs 4    │
└────────────┘  └────────────┘  └────────────┘  └────────────┘

▓▓ = KV-cache HIT (prefix reused — 10% cost)
░░ = NEW tokens (must be computed — full cost)

Input:output ratio ≈ 100:1 — cache savings are enormous
```

### Cost impact

With Claude Sonnet, cached input tokens cost $0.30/MTok, while uncached ones cost $3/MTok — a **10x difference**.

### Key practices for improving KV-cache hit rate

1. **Keep your prompt prefix stable.** Due to the autoregressive nature of LLMs, even a single-token difference can invalidate the cache from that token onward. A common mistake is including a timestamp — especially one precise to the second — at the beginning of the system prompt. Sure, it lets the model tell you the current time, but it kills your cache hit rate.

2. **Make your context append-only.** Avoid modifying previous actions or observations. Ensure your serialization is deterministic. Many programming languages and libraries don't guarantee stable key ordering when serializing JSON objects, which can silently break the cache.

3. **Mark cache breakpoints explicitly when needed.** Some model providers or inference frameworks don't support automatic incremental prefix caching, and instead require manual insertion of cache breakpoints. When assigning these, account for potential cache expiration and at minimum ensure the breakpoint includes the end of the system prompt.

4. **If self-hosting**, make sure prefix caching is enabled, and use techniques like session IDs to route requests consistently across distributed workers.

---

## 2. Mask, Don't Remove

As your agent takes on more capabilities, its action space naturally grows — the number of tools explodes. MCP only adds fuel to the fire. If you allow user-configurable tools, someone will inevitably plug hundreds of mysterious tools into your carefully curated action space. The model is more likely to select the wrong action or take an inefficient path. Your heavily armed agent gets dumber.

### Why not dynamic tool loading?

A natural reaction is to design a dynamic action space — loading tools on demand using something RAG-like. Manus tried that. But experiments suggest a clear rule: **unless absolutely necessary, avoid dynamically adding or removing tools mid-iteration.** Two reasons:

1. In most LLMs, tool definitions live near the front of the context after serialization (before or after the system prompt). **Any change will invalidate the KV-cache for all subsequent actions and observations.**

2. When previous actions and observations still refer to tools that are no longer defined in the current context, the model gets confused. Without tool-use grounding, this often leads to schema violations or hallucinated actions.

### The solution: constrained decoding

Instead of removing tools, Manus uses a **context-aware state machine** to manage tool availability. Rather than removing tools, it **masks the token logits during decoding** to prevent (or enforce) the selection of certain actions based on the current context.

In practice, most model providers support some form of response prefill, which allows constraining the action space without modifying tool definitions. Three modes:

- **Auto** — model may choose to call a function or not. Prefill only the reply prefix.
- **Required** — model must call a function, but choice is unconstrained. Prefill up to tool call token.
- **Specified** — model must call from a specific subset. Prefill up to beginning of function name.

**Diagram — Mask Over Remove:**

```
  ❌ REMOVE tools (breaks cache)         ✅ MASK tools (cache preserved)

  Step N              Step N+1            Step N              Step N+1
┌──────────────┐  ┌──────────────┐     ┌──────────────┐  ┌──────────────┐
│ System       │  │ System       │     │ System       │  │ System       │
├──────────────┤  ├──────────────┤     ├──────────────┤  ├──────────────┤
│ Tool A  ░░░  │  │ Tool A  ░░░  │     │ Tool A  ░░░  │  │ Tool A  ░░░  │
│ Tool B  ░░░  │  │              │     │ Tool B  ░░░  │  │ Tool B  ░░░  │
│ Tool C  ░░░  │  │ Tool D  ░░░  │     │ Tool C  ░░░  │  │ Tool C  ░░░  │
├──────────────┤  ├──────────────┤     ├──────────────┤  ├──────────────┤
│ Messages     │  │ Messages     │     │ Messages     │  │ Messages     │
└──────────────┘  └──────────────┘     └──────────────┘  └──────────────┘
                                                          (logits mask
       Tools changed!                    Tools identical!   blocks Tool C
       KV-cache INVALIDATED              KV-cache HIT ✓    at decode time)
```

**Diagram — Three Modes of Constrained Decoding:**

```
Auto:      <|im_start|>assistant
           └── model freely chooses: reply OR tool call

Required:  <|im_start|>assistant<tool_call>
           └── model MUST call a tool, but any tool

Specified: <|im_start|>assistant<tool_call>{"name": "browser_
           └── model MUST call a tool starting with "browser_"
```

### Consistent naming convention

Manus deliberately designed action names with consistent prefixes — all browser-related tools start with `browser_`, command-line tools with `shell_`. This allows enforcing that the agent only chooses from a certain group of tools at a given state without using stateful logits processors.

---

## 3. Use the File System as Context

Modern frontier LLMs offer 128K+ token context windows. But in real-world agentic scenarios, that's often not enough. Three pain points:

1. **Observations can be huge** — especially when agents interact with unstructured data like web pages or PDFs. Easy to blow past the context limit.
2. **Model performance degrades** beyond a certain context length, even if the window technically supports it.
3. **Long inputs are expensive** — even with prefix caching, you're still paying to transmit and prefill every token.

### File system as externalized memory

Manus treats the **file system as the ultimate context**: unlimited in size, persistent by nature, and directly operable by the agent itself. The model learns to write to and read from files on demand — using the file system not just as storage, but as structured, externalized memory.

### Restorable compression

Compression strategies are always designed to be **restorable**:
- A web page's content can be dropped from context as long as the URL is preserved
- A document's contents can be omitted if its file path remains available in the sandbox

This allows shrinking context length without permanently losing information.

**Diagram — File System as Externalized Context:**

```
┌─ Context Window (128K limit) ─────────┐    ┌─ File System (unlimited) ────────┐
│                                        │    │                                  │
│  System Prompt                         │    │  /workspace/                     │
│  Tool Definitions                      │    │  ├── research/                   │
│  ...                                   │    │  │   ├── page1.html  (50K)       │
│  Action: browser_navigate(url)         │    │  │   ├── page2.html  (80K)       │
│  Obs: [URL preserved, content in file] │◄──►│  │   └── notes.md               │
│  Action: read_file("notes.md")         │    │  ├── output/                     │
│  Obs: [file contents loaded on demand] │    │  │   └── report.md               │
│  ...                                   │    │  └── todo.md                     │
│                                        │    │                                  │
│  Context stays small — only refs!      │    │  Full data lives here            │
└────────────────────────────────────────┘    └──────────────────────────────────┘

Compression is RESTORABLE:
  - Drop web page content → keep URL (can re-fetch)
  - Drop file content → keep path (can re-read)
  - Never lose information permanently
```

---

## 4. Manipulate Attention Through Recitation

When handling complex tasks, Manus creates a `todo.md` file and updates it step-by-step, checking off completed items. This is a **deliberate mechanism to manipulate attention**.

A typical Manus task requires around **50 tool calls** on average. That's a long loop — and the agent is vulnerable to drifting off-topic or forgetting earlier goals, especially in long contexts.

By constantly rewriting the todo list, Manus is **reciting its objectives into the end of the context**. This pushes the global plan into the model's recent attention span, avoiding "lost-in-the-middle" issues and reducing goal misalignment.

In effect, it's using natural language to bias its own focus toward the task objective — without needing special architectural changes.

**Diagram — Manipulate Attention Through Recitation:**

```
┌─ Context (50+ tool calls deep) ─────────────────────────────────┐
│                                                                  │
│  System Prompt                                                   │
│  ...                                                             │
│  Step 1: Action + Observation                                    │
│  Step 2: Action + Observation                                    │
│  ...                                          ◄── "lost in the   │
│  Step 20: Action + Observation                     middle" zone  │
│  ...                                                             │
│  Step 48: Action + Observation                                   │
│  Step 49: write_file("todo.md",              ◄── RECITATION:     │
│    "- [x] Research competitors                    goals pushed   │
│     - [x] Analyze pricing                         to END of      │
│     - [ ] Draft recommendations   ◄────────────── context where  │
│     - [ ] Create final report")                   attention is   │
│  Step 50: (model reads fresh goals here)          strongest      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Keep the Wrong Stuff In

Agents make mistakes — hallucinations, environment errors, external tool failures, unexpected edge cases. In multi-step tasks, failure is part of the loop.

A common impulse is to hide errors: clean up the trace, retry the action, or reset the model's state. But **erasing failure removes evidence. Without evidence, the model can't adapt.**

**Leave the wrong turns in the context.** When the model sees a failed action — and the resulting observation or stack trace — it implicitly updates its internal beliefs. This shifts its prior away from similar actions, reducing the chance of repeating the same mistake.

Error recovery is one of the clearest indicators of true agentic behavior. Yet it's still underrepresented in most academic work and public benchmarks.

**Diagram — Keep the Wrong Stuff In:**

```
  ❌ HIDE errors                         ✅ KEEP errors

┌──────────────────────┐              ┌──────────────────────┐
│  Action: query_db()  │              │  Action: query_db()  │
│  Obs: ✓ success      │              │  Obs: ✓ success      │
├──────────────────────┤              ├──────────────────────┤
│  Action: parse(data) │              │  Action: parse(data) │
│  Obs: ✓ success      │              │  Obs: ✗ TypeError:   │
├──────────────────────┤              │    Cannot read prop   │
│  (error was removed) │              │    'name' of null     │
│  (retried silently)  │              ├──────────────────────┤
├──────────────────────┤              │  Action: parse(data,  │
│  Action: parse(data) │              │    { nullable: true })│
│  Obs: ✓ success      │              │  Obs: ✓ success      │
└──────────────────────┘              └──────────────────────┘

Model has no idea why it                Model sees the error →
retried. May repeat the                 updates beliefs → avoids
same mistake later.                     same mistake in future.
```

---

## 6. Don't Get Few-Shotted

Few-shot prompting is common for improving LLM outputs. But in agent systems, it can backfire in subtle ways.

Language models are excellent mimics — they imitate the pattern of behavior in context. If your context is full of similar past action-observation pairs, the model will tend to follow that pattern, **even when it's no longer optimal**.

This is dangerous in tasks involving repetitive decisions. For example, when using Manus to review a batch of 20 resumes, the agent falls into a rhythm — repeating similar actions simply because that's what it sees in context. This leads to drift, overgeneralization, or hallucination.

### The fix: increase diversity

Manus introduces small amounts of **structured variation** in actions and observations — different serialization templates, alternate phrasing, minor noise in order or formatting. This controlled randomness helps break the pattern and tweaks the model's attention.

**Don't few-shot yourself into a rut. The more uniform your context, the more brittle your agent becomes.**

**Diagram — Don't Get Few-Shotted:**

```
  ❌ UNIFORM context (brittle)           ✅ DIVERSE context (robust)

┌──────────────────────┐              ┌──────────────────────┐
│  review_resume(A)    │              │  review_resume(A)    │
│  → "Strong candidate"│              │  → "Strong candidate"│
├──────────────────────┤              ├──────────────────────┤
│  review_resume(B)    │              │  summarize_resume(B) │  ◄ different
│  → "Strong candidate"│              │  → {skills: [...]}   │    action
├──────────────────────┤              ├──────────────────────┤
│  review_resume(C)    │              │  compare(B, reqs)    │  ◄ different
│  → "Strong candidate"│              │  → "Gaps in X, Y"   │    template
├──────────────────────┤              ├──────────────────────┤
│  review_resume(D)    │              │  review_resume(D)    │
│  → "Strong candidate"│  ◄ drift!   │  → "Weak on Z"      │  ◄ honest
└──────────────────────┘              └──────────────────────┘

Pattern mimicry: model copies              Structured variation breaks
the rhythm regardless of                   the pattern, forces genuine
actual resume quality.                     evaluation each time.
```

---

## Key Takeaways for Sunder

| Manus Principle | Sunder Relevance |
|----------------|-----------------|
| KV-cache hit rate is THE metric | System-reminder timestamp breaks cache every turn — fix this first |
| Append-only context | Don't modify previous messages/observations |
| Deterministic serialization | Ensure tool definitions have stable JSON key ordering |
| Mask, don't remove tools | Always include all tools; constrain via execution, not definition |
| File system as context | Memory system (SOUL.md, USER.md, MEMORY.md) already does this |
| Recitation via todo.md | Agent already creates task lists — good pattern to keep |
| Keep errors in context | Don't strip failed tool results from conversation history |
| Avoid self-few-shotting | Vary serialization in long repetitive agent loops |
