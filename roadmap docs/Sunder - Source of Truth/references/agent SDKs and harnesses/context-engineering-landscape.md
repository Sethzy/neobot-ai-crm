# Context Engineering Landscape: How Every Major AI Lab Manages Agent Context

> Source: [@Hxlfed14 on X](https://x.com/Hxlfed14/status/2022984467380682856)

---

## Manus: KV-Cache Stability and Filesystem Offloading

> Source: [Manus — "Context Engineering for AI Agents: Lessons from Building Manus"](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)

**KV-Cache is sacred.** Cached tokens cost $0.30/MTok vs $3/MTok uncached (10x). Keep the prompt prefix stable, logs append-only. Even reordered JSON keys invalidate the cache.

```
  Design Around the KV-Cache

  ✗ REPLACE history (breaks cache)          ✓ APPEND-ONLY (preserves cache)

  CONTEXT @ step n    CONTEXT @ step n+1    CONTEXT @ step n    CONTEXT @ step n+1
  ┌──────────────┐    ┌──────────────┐      ┌──────────────┐    ┌──────────────┐
  │ Instruction  │    │ Instruction  │      │ Instruction  │    │ Instruction  │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │  Action 1    │    │  Action 2    │      │  Action 1    │    │  Action 1    │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │Observation 1 │    │Observation 2 │      │Observation 1 │    │Observation 1 │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │  Action 2    │    │  Action 3    │      │  Action 2    │    │  Action 2    │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │Observation 2 │    │Observation 3 │      │Observation 2 │    │Observation 2 │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │  Action 3    │    │  Action 4    │      │  Action 3    │    │  Action 3    │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │Observation 3 │    │Observation 4 │      │Observation 3 │    │Observation 3 │
  └──────────────┘    └──────────────┘      └──────────────┘    ├──────────────┤
                                                                │  Action 4    │ ← Cache
                                                                ├──────────────┤   Miss
        ✗ Cache Miss on ALL tokens                              │Observation 4 │
          (history replaced)                                    └──────────────┘
                                                        ✓ Cache Hit on prefix
                                                          (only new tokens computed)
```

**Logit masking over tool removal.** All tools stay loaded permanently. Availability per step is controlled by constraining output token probabilities during decoding. Context stays stable; only behavioral constraints change.

```
  Mask, Don't Remove

  REMOVE tools (✗ breaks KV-cache)         MASK tools (✓ stable KV-cache)

  CONTEXT @ step n    CONTEXT @ step n+1    CONTEXT @ step n    CONTEXT @ step n+1
  ┌──────────────┐    ┌──────────────┐      ┌──────────────┐    ┌──────────────┐
  │ Instruction  │    │ Instruction  │      │ Instruction  │    │ Instruction  │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │   Tool A     │    │   Tool B     │      │   Tool A     │    │ ░░Tool A░░░░ │ ← masked
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │   Tool B     │    │   Tool C     │      │   Tool B     │    │   Tool B     │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │  Action 1    │    │  Action 1    │      │ ░░Tool C░░░░ │    │   Tool C     │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │Observation 1 │    │Observation 1 │      │  Action 1    │    │  Action 1    │
  └──────────────┘    ├──────────────┤      ├──────────────┤    ├──────────────┤
                      │  Action 2    │      │Observation 1 │    │Observation 1 │
                      ├──────────────┤      └──────────────┘    ├──────────────┤
                      │Observation 2 │                          │  Action 2    │
                      └──────────────┘                          ├──────────────┤
                                                                │Observation 2 │
        ✗ KV-cache invalidated                                  └──────────────┘
          (tool defs changed)                           ✓ KV-cache preserved
                                                          (only logits masked)
```

**File system as extended memory.** Large observations go to files; only lightweight references stay in context. Compression is fine as long as it is reversible.

**Attention manipulation via recitation.** A living `todo.md` is updated and re-read every step, placing the current objective in the high-attention zone (end of context).

```
  Manipulate Attention Through Recitation

  ✗ Objectives drift out of attention      ✓ Objectives re-read every step

  CONTEXT @ step n    CONTEXT @ step n+1    CONTEXT @ step n    CONTEXT @ step n+1
  ┌──────────────┐    ┌──────────────┐      ┌──────────────┐    ┌──────────────┐
  │  Objectives  │    │  Objectives  │      │  Objectives  │    │  Objectives  │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │  Action 1    │    │  Action 1    │      │  Action 1    │    │  Action 1    │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │Observation 1 │    │Observation 1 │      │Observation 1 │    │Observation 1 │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │  Action 2    │    │  Action 2    │      │  Action 2    │    │  Action 2    │
  ├──────────────┤    ├──────────────┤      ├──────────────┤    ├──────────────┤
  │Observation 2 │    │Observation 2 │      │Observation 2 │    │Observation 2 │
  └──────────────┘    ├──────────────┤      └──────────────┘    ├──────────────┤
                      │  Action 3    │                          │ *Objectives* │ ← re-read
                      ├──────────────┤                          ├──────────────┤
                      │Observation 3 │                          │  Action 3    │
                      └──────────────┘                          ├──────────────┤
                                                                │Observation 3 │
        ✗ Objectives in "lost middle"                           └──────────────┘
          (low attention zone)                          ✓ Objectives in end
                                                          (high attention zone)
```

**Errors preserved, not cleaned.** Failed actions stay in context for implicit belief updating, reducing repeated mistakes.

**Structured variation against fixation.** Different serialization templates and phrasing across iterations prevent the model from falling into rigid, repetitive patterns.

---

## Cursor: Dynamic Context Discovery

Context: Their Jan 2026 research blog describes five techniques they developed after observing that as models improved, providing fewer details up front and letting the agent pull its own context produced better results. They back this with A/B test data.

> Source: [Cursor — "Dynamic Context Discovery"](https://cursor.com/blog/dynamic-context-discovery)

Five techniques, condensed:

1. **Files as tool output interface.** Large JSON responses get written to files. Agent reads incrementally via `tail`/`grep`. No unnecessary summarization.

2. **Chat history files for lossless compression.** Full history is saved to a file before summarization. Agent can restore any lost detail — lossy compression becomes lossless.

```
  Referencing past chats improves consistency over long-running conversations

  ┌─────────────────────────────────┐          ┌─────────────────────────────────────┐
  │ "The experiment is complete.    │          │ "Here's the summary of the chat so  │
  │  I'll save the results."       │          │  far: The user ran an experiment to  │
  │                                │          │  test the latest Composer-2          │
  │  $ aws s3 sync ...             │          │  checkpoint. It scored very well on  │
  │                                │          │  the benchmarks. The results were    │
  │ "I uploaded the results to S3  │          │  uploaded to S3. The full text of    │
  │  at s3://cursor/eval-results/  │   ───►   │  the chat can be found at           │
  │  composer-2/h4e1..."           │          │  transcript.txt."                   │
  └─────────────────────────────────┘          │                                     │
           │                                   │ > "Please update the experiment     │
           ○ Context limit exceeded.           │    metadata."                       │
             Summarizing conversation...       │                                     │
                                               │ "Hmm, I can't remember the location │
                                               │  in S3. Let me check our earlier    │
                                               │  conversation."                     │
                                               │                                     │
                                               │  Searched: agent transcript          │
                                               │                                     │
                                               │ "I found it! I'll update the        │
                                               │  metadata..."                       │
                                               └─────────────────────────────────────┘
```

3. **Skills as discoverable files.** Domain capabilities stored as files, discovered via search, not pre-loaded in the system prompt.

4. **Lazy MCP tool loading.** Only tool names loaded upfront. Full definitions fetched on-demand. **46.9% token reduction** in A/B tests.

```
  Dynamic context discovery of MCP tools reduced total tokens by 46.9%

  Legend: [Sys Instr] [Tools] [MCP File access]

  Before:  [==Sys Instr==][==========Tools==========][===============================]
           ├─────────────────────────────────────────────────────────────────────────┤

  After:   [=][||][=============MCP File access=================]
           ├──────────────────────────────────────────────────────┤
                 ↑
                 46.9% fewer total agent tokens
```

5. **Terminal sessions as files.** Shell history becomes a searchable file and agent greps for what it needs.

**Key assumption:** This works because models are now good enough to know what context they need.

---

## Anthropic: The Attention Budget Framework

Context: Anthropic published what many consider the foundational framing for context engineering (September 2025), followed by a deep dive on long-running agent harnesses (January 2026) and MCP-based code execution (November 2025). Their work is grounded in building Claude Code.

Core strategies, condensed:

**The Goldilocks Zone for system prompts.** Anthropic found two failure modes: over-engineered system prompts with 2K+ words of if-else logic that break on edge cases, and vague prompts like "be helpful" that give the model nothing to work with. Their fix: organize prompts into clear sections (XML tags or markdown headers), use canonical examples to show expected behavior, and let the model handle edge cases instead of hard-coding them.

```
  Calibrating the system prompt

  Too specific                    Just right                      Too vague
  ◄────────────○──────────────────────○──────────────────────────────○────────►

  ┌──────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────┐
  │ "You are a helpful   │   │ "You are a customer      │   │ "You are a bakery    │
  │  assistant for       │   │  support agent for       │   │  assistant, you      │
  │  Claude's Bakery.    │   │  Claude's Bakery. You    │   │  should attempt to   │
  │  You must respond    │   │  specialize in assisting │   │  solve customers     │
  │  to the name Claude. │   │  customers with orders   │   │  issues in a manner  │
  │  For every request   │   │  and basic questions     │   │  consistent with the │
  │  you MUST FOLLOW     │   │  about the bakery.       │   │  principles and      │
  │  THESE STEPS:        │   │                          │   │  essence of the      │
  │                      │   │  Response Framework:     │   │  company brand.      │
  │  1. Identify user    │   │  1. Identify core issue  │   │  Escalate to a human │
  │     intent as one    │   │  2. Gather context       │   │  if needed."         │
  │     of: [list...]    │   │  3. Provide resolution   │   │                      │
  │  2. If intent is     │   │  4. Confirm satisfaction │   │                      │
  │     "incident_       │   │                          │   │                      │
  │     resolution"...   │   │  Guidelines:             │   │                      │
  │  3. Here is an       │   │  - Choose simplest one   │   │                      │
  │     exhaustive list  │   │  - Check order status    │   │                      │
  │     of cases...      │   │  - When uncertain, call  │   │                      │
  │  [2K+ words of       │   │    human_assistance      │   │                      │
  │   if-else logic]     │   │                          │   │                      │
  └──────────────────────┘   └──────────────────────────┘   └──────────────────────┘
        Breaks on                   Handles edge                  No guidance
        edge cases                  cases naturally               for the model
```

> Source: [Anthropic — "Effective Context Engineering for AI Agents"](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**Just-in-time retrieval.** Agent retrieves context at runtime based on what it actually needs — shifting from pre-inference RAG to in-loop retrieval.

**Lean tools with no overlap.** If a human engineer cannot say which tool to use in a given situation, neither can the model. Tools should be self-contained and unambiguous.

**Compaction at 95%.** Claude Code auto-summarizes when the window hits 95% capacity. For long-running agents, an initializer agent writes a comprehensive requirements file (200+ features) that persists across windows.

**Code execution over direct tool calls.** For MCP with many servers, agents write code that calls tools rather than invoking them directly. Definitions stay in the filesystem.

```
  Code Execution with MCP

  ┌──────────┐       ┌─────────────────────────────────┐       ┌──────────────┐
  │          │       │         MCP client               │       │              │
  │          │       │  ┌───────────────────────────┐   │       │              │
  │          │       │  │    Context window          │   │       │              │
  │          │       │  │  ┌─────────────────────┐   │   │       │              │
  │          │       │  │  │   System prompt      │   │   │       │              │
  │          │       │  │  ├─────────────────────┤   │   │       │              │
  │          │       │  │  │   Tool 1 def        │───┼───┼──►    │              │
  │  Model   │◄─────►│  │  ├─────────────────────┤   │  tools/   │  MCP server  │
  │          │       │  │  │   Tool 2 def        │◄──┼───┼──     │              │
  │          │       │  │  ├─────────────────────┤   │  list     │              │
  │          │       │  │  │   User msg 1        │   │   │       │              │
  │          │       │  │  ├─────────────────────┤   │   │       │              │
  │          │       │  │  │   Assistant msg 1   │   │   │       │              │
  │          │       │  │  ├─────────────────────┤   │   │       │              │
  │          │       │  │  │   Call tool 1       │───┼───┼──►    │              │
  │          │       │  │  ├─────────────────────┤   │  tools/   │              │
  │          │       │  │  │   Call tool 1 result│◄──┼───┼──     │              │
  │          │       │  │  ├─────────────────────┤   │  call     │              │
  │          │       │  │  │   Assistant msg 2   │   │   │       │              │
  │          │       │  │  ├─────────────────────┤   │   │       │              │
  │          │       │  │  │   User msg 2        │   │   │       │              │
  │          │       │  │  └─────────────────────┘   │   │       │              │
  │          │       │  └───────────────────────────┘   │       │              │
  └──────────┘       └─────────────────────────────────┘       └──────────────┘
```

> Source: [Anthropic — "Code Execution with MCP"](https://www.anthropic.com/engineering/code-execution-with-mcp)

**Two failure patterns discovered:** Agents "one-shot" complex projects (run out of context mid-implementation), and compaction transfers information imperfectly across windows. Solution: structured planning files in the filesystem.

---

## OpenAI: Session Memory as Infrastructure

Context: OpenAI's approach is documented through their Agents SDK and two detailed cookbooks — one on short-term session memory (September 2025) and one on long-term context personalization (December 2025). Their contribution is framework-oriented: structured patterns developers can adopt directly.

Three patterns, condensed:

**Trimming.** Drop older turns, keep last N. Simple, deterministic, zero latency — but causes "amnesia" for earlier constraints.

```
  TrimmingSession                             TrimmingSession

  ┌──────────────────┐                        ┌──────────────────┐
  │     system       │                        │     system       │
  ├──────────────────┤                        ├──────────────────┤
  │   assistant      │                        │      user        │
  ├──────────────────┤                        ├──────────────────┤
  │      user        │                        │      tool        │
  ├──────────────────┤                        ├──────────────────┤
  │   assistant      │        Trimmed         │   assistant      │
  ├──────────────────┤        ──────►         ├──────────────────┤
  │      user        │                        │      user        │
  ├──────────────────┤                        ├──────────────────┤
  │      tool        │                        │   assistant      │
  ├──────────────────┤                        ├──────────────────┤
  │   assistant      │                        │      user        │
  ├──────────────────┤                        ├──────────────────┤
  │      user        │                        │   assistant      │
  ├──────────────────┤                        └──────────────────┘
  │   assistant      │
  ├──────────────────┤
  │      user        │
  ├──────────────────┤
  │   assistant      │
  └──────────────────┘
```

> Source: [OpenAI — "Context Engineering - Short-Term Memory Management with Sessions"](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory)

**Compression.** Summarize older history with a separate model call. Summaries act as "clean rooms" that can correct prior mistakes. Risk: summary drift.

```
  SummarizingSession                          SummarizingSession

  ┌──────────────────┐                        ┌──────────────────┐
  │     system       │                        │     system       │
  ├──────────────────┤                        ├──────────────────┤
  │   assistant      │                        │ user: "Summarize │
  ├──────────────────┤                        │  the conversation│
  │      user        │                        │  we had so far." │
  ├──────────────────┤                        ├──────────────────┤
  │   assistant      │                        │ Context Summary  │ ← LLM-generated
  ├──────────────────┤        ──────►         ├──────────────────┤
  │                  │       (via LLM)        │      user        │
  │   many turns...  │                        ├──────────────────┤
  │                  │                        │      tool        │
  ├──────────────────┤                        ├──────────────────┤
  │      user        │                        │   assistant      │
  ├──────────────────┤                        ├──────────────────┤
  │      tool        │                        │      user        │
  ├──────────────────┤                        ├──────────────────┤
  │   assistant      │                        │   assistant      │
  ├──────────────────┤                        ├──────────────────┤
  │      user        │                        │      user        │
  ├──────────────────┤                        ├──────────────────┤
  │   assistant      │                        │   assistant      │
  ├──────────────────┤                        └──────────────────┘
  │      user        │
  ├──────────────────┤
  │   assistant      │
  └──────────────────┘
```

**State-based long-term memory.** Structured state objects (profile + notes) persist across sessions. Each run: distill memories → consolidate notes → inject state with precedence (latest input → session → global defaults).

**Key distinction:** OpenAI contrasts retrieval-based memory (searching past interactions as documents) with state-based memory (structured fields with precedence). State-based supports belief updates over fact accumulation — more reliable, more deterministic.

---

## Google DeepMind: The Long Context Bet

Context: Google's approach is distinct from everyone else on this list. While other companies focus on fitting the right tokens into a limited window, Google bets on abundance — Gemini models offer up to 2M tokens of context, with research testing up to 10M. Their ReadAgent paper (2024) adds a complementary research angle on memory compression.

Approach, condensed:

**"Just put it all in."** Default to filling the context window. RAG and summarization are workarounds for limited context models. Gemini learned to translate Kalamang (<200 speakers) from in-context materials alone.

**Context caching.** Up to 75% cost reduction via caching APIs, analogous to Manus's KV-cache optimization.

**Progressive truncation.** Compress older context while maintaining the logical thread.

**ReadAgent — Gist Memory (research).** Compress interactions into episodic "gist memories," look up originals when needed. Increases effective context by 20x. Modeled on how humans read long documents.

**Many-shot in-context learning.** Unique leverage of massive windows — hundreds/thousands of examples in-context, matching fine-tuned model performance.

**The tension:** Long context doesn't eliminate context engineering but it changes what it looks like. Research still shows 15–47% performance drops as context length increases.

---

## LangChain: The Framework Taxonomy

Context: Their contribution is taxonomic — organizing what others are doing into a coherent framework, backed by their LangGraph implementation and "Deep Agents" analysis.

> Source: [LangChain — "Context Engineering for Agents"](https://blog.langchain.com/context-engineering-for-agents/)

```
  LangChain's Four Context Engineering Primitives

  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │  Write Context   │  │ Select Context   │  │Compress Context  │  │ Isolate Context  │
  │                  │  │                  │  │                  │  │                  │
  │ Long-term        │  │ Retrieve relevant│  │ Summarize context│  │ Partition context │
  │ memories (across │  │ tools            │  │ to retain        │  │ in state         │
  │ agent sessions)  │  │       ──►        │  │ relevant tokens  │  │       ──►        │
  │      ──►         │  │                  │  │      ──►         │  │                  │
  │                  │  │ Retrieve from    │  │                  │  │ Hold in          │
  │ Scratchpad       │  │ scratchpad       │  │ Trim context to  │  │ environment/     │
  │ (within agent    │  │       ──►        │  │ remove irrelevant│  │ sandbox          │
  │ session)         │  │                  │  │ tokens           │  │       ──►        │
  │      ──►         │  │ Retrieve         │  │      ──►         │  │                  │
  │                  │  │ long-term memory │  │                  │  │ Partition across  │
  │ State            │  │       ──►        │  │                  │  │ multi-agent      │
  │ (within agent    │  │                  │  │                  │  │       ──►        │
  │ session)         │  │ Retrieve relevant│  │                  │  │                  │
  │      ──►         │  │ knowledge        │  │                  │  │                  │
  │                  │  │       ──►        │  │                  │  │                  │
  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Write** — save context outside the window. Scratchpads, persistent state objects, filesystem storage. Example: Anthropic's multi-agent researcher saves plans to memory because context exceeding 200K tokens gets truncated.

**Select** — pull relevant context in. RAG, semantic search, filesystem traversal with grep/glob. The challenge is retrieving the right context at the right time, not just the most semantically similar.

**Compress** — retain only essential tokens. Conversation summarization, tool output compression. LangChain measured a reduction from 115K to 60K tokens through end-to-end summarization in their tests.

**Isolate** — split context across agents. Multi-agent architectures where sub-agents get their own context windows, preventing "context pollution" from irrelevant details accumulating in a shared window.

**No-op tools as context engineering.** Their "Deep Agents" analysis revealed that Claude Code's todo list tool does nothing functionally — it is purely a context strategy that forces the agent to articulate its plan, keeping it on track over long trajectories.

---

## The Technique Matrix

Quick-reference mapping techniques to companies based on public documentation.

**Legend:** `[C]` = Core differentiator | `[Y]` = Yes, uses/advocates | `[--]` = Not discussed publicly | `[alt]` = Different approach to same problem

### Context Window Management

| Technique | Manus | Cursor | Anthropic | OpenAI | Google | LangChain |
|---|---|---|---|---|---|---|
| KV-cache / prompt caching | [C] | [--] | [Y] | [--] | [Y] | [--] |
| Compaction / auto-summarization | [Y] | [Y] | [C] | [Y] | [alt] | [Y] |
| Context trimming | [--] | [--] | [--] | [C] | [alt] | [Y] |
| Massive context windows (1M+) | [--] | [--] | [--] | [--] | [C] | [--] |

### Information Retrieval

| Technique | Manus | Cursor | Anthropic | OpenAI | Google | LangChain |
|---|---|---|---|---|---|---|
| Just-in-time / dynamic retrieval | [Y] | [C] | [C] | [--] | [alt] | [Y] |
| File system as extended memory | [C] | [C] | [Y] | [--] | [--] | [Y] |
| Lazy tool loading | [alt] | [C] | [Y] | [--] | [--] | [--] |
| Semantic search / RAG | [--] | [Y] | [Y] | [--] | [alt] | [Y] |

### Planning & Coherence

| Technique | Manus | Cursor | Anthropic | OpenAI | Google | LangChain |
|---|---|---|---|---|---|---|
| Persistent plan files | [C] | [--] | [Y] | [--] | [--] | [Y] |
| Attention manipulation / recitation | [C] | [--] | [--] | [--] | [--] | [--] |
| No-op planning tools | [--] | [--] | [Y] | [--] | [--] | [Y] |
| Error preservation | [C] | [--] | [Y] | [--] | [--] | [--] |

### Multi-Agent & Isolation

| Technique | Manus | Cursor | Anthropic | OpenAI | Google | LangChain |
|---|---|---|---|---|---|---|
| Sub-agent context isolation | [C] | [--] | [Y] | [Y] | [--] | [Y] |
| Agent-as-tool pattern | [C] | [--] | [--] | [Y] | [--] | [Y] |

### Memory & Robustness

| Technique | Manus | Cursor | Anthropic | OpenAI | Google | LangChain |
|---|---|---|---|---|---|---|
| State-based long-term memory | [--] | [--] | [--] | [C] | [--] | [Y] |
| Gist / episodic memory | [--] | [--] | [--] | [--] | [C] | [--] |
| Chat history as recoverable file | [--] | [C] | [--] | [--] | [--] | [--] |
| Structured variation (anti-fixation) | [C] | [--] | [--] | [--] | [--] | [--] |
| Summary drift mitigation | [--] | [Y] | [--] | [Y] | [--] | [--] |

---

## Where The Industry Agrees (and Where It Doesn't)

**Near-consensus:** File system as extended memory. Dynamic over static retrieval. Persistent plan files for long-running tasks. Error traces kept, not cleaned.

**Active disagreement:** How to handle tool overload (Manus's logit masking vs Cursor's lazy loading — opposite strategies, both work). Long context vs lean context (Google vs everyone else). Whether to use frameworks or raw primitives.

**Unsolved:** Session memory — no two companies do it the same way. Context engineering evaluation — no standard benchmarks exist. Cursor's 46.9% token reduction is one of the few published numbers. When to isolate sub-agent context vs share it is still purely empirical.

**One pattern worth noting:** the teams shipping the best agents keep simplifying. Manus has been rewritten five times. Each rewrite removed things. If your agent harness is getting more complex while models get better, something is wrong.

---

## Open Questions

- Long context vs. smart compression — which wins at scale?
- Should sub-agents share context or communicate results?
- How do you evaluate context engineering quality?

Based entirely on publicly available blogs, documentation, and research papers from the companies referenced.

---

## References

1. Manus — "Context Engineering for AI Agents: Lessons from Building Manus" (Jul 2025) — manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
2. Cursor — "Dynamic Context Discovery" (Jan 2026) — cursor.com/blog/dynamic-context-discovery
3. Anthropic — "Effective Context Engineering for AI Agents" (Sep 2025) — anthropic.com/engineering/effective-context-engineering-for-ai-agents
4. Anthropic — "Effective Harnesses for Long-Running Agents" (Jan 2026) — anthropic.com/engineering/effective-harnesses-for-long-running-agents
5. Anthropic — "Code Execution with MCP" (Nov 2025) — anthropic.com/engineering/code-execution-with-mcp
6. OpenAI — "Context Engineering - Short-Term Memory Management with Sessions" (Sep 2025) — developers.openai.com/cookbook/examples/agents_sdk/session_memory
7. OpenAI — "Context Engineering for Personalization" (Dec 2025)
8. Google DeepMind — "A Human-Inspired Reading Agent with Gist Memory" (2024)
9. Google — Long Context Documentation (2025)
10. LangChain — "Context Engineering for Agents" (Jul 2025) — blog.langchain.com/context-engineering-for-agents
11. LangChain — "The Rise of Context Engineering" (Jun 2025)
12. LangChain — "How Agents Can Use Filesystems for Context Engineering" (Nov 2025)
13. LangChain — "Deep Agents" (Jul 2025) — blog.langchain.com/deep-agents
14. Phil Schmid — "Context Engineering for AI Agents: Part 2" (Dec 2025) — philschmid.de/context-engineering-part-2
15. Lance Martin — "Context Engineering in Manus" (Oct 2025)
