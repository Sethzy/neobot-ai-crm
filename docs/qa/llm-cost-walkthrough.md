# LLM Cost Walkthrough: Real Trace Examples

This document walks through real Langfuse traces showing exactly what happens when a user sends a message — every LLM request, its token breakdown, and cost. Data pulled from production on 2026-03-17.

## Model & Pricing

All generations use **google/gemini-3-flash** via Vercel AI Gateway.

| Token type           | Rate       |
| -------------------- | ---------- |
| Input (non-cached)   | $0.50 / 1M |
| Input (cached)       | $0.00 / 1M |
| Output (text + tool) | $3.00 / 1M |
| Output (reasoning)   | $3.00 / 1M |

> **Note:** Langfuse reports cached input tokens at $0.00. Verify against Google's published pricing — if cached tokens are billed at a reduced rate (e.g. $0.0125/1M), actual costs are slightly higher.

## Fleet Averages (n = 118 user messages, 360 LLM requests)

| Metric                          | Value       |
| ------------------------------- | ----------- |
| Avg LLM requests per message    | 3.05        |
| Avg non-cached input tokens     | 32,090      |
| Avg cached input tokens         | 17,660      |
| Avg output tokens               | 370         |
| Avg reasoning tokens            | 302 (82%)   |
| Cache hit rate                  | 35.5%       |
| **Avg cost per user message**   | **$0.0170** |
| Median cost per user message    | $0.0153     |
| P90 cost per user message       | $0.0264     |

---

## Table of Contents

1. [Example 1: Direct response](#example-1-direct-response-no-tools) — 1 request, $0.010
2. [Example 2: Calculate tool](#example-2-parallel-calculate-calls) — 2 requests, $0.013
3. [Example 3: Calculate + title gen](#example-3-calculate--title-generation) — 3 requests, $0.017
4. [Example 4: CRM workflow](#example-4-crm-search--create--link) — 5 requests, $0.028
5. [Example 5: Complex view building](#example-5-schema--sql--iterative-views) — 10 requests, $0.065

---

## Example 1: Direct Response (No Tools)

**User:** "make a donut chart"
**Flow:** Agent generates a view spec inline — no tool calls needed. Single LLM request.

### LLM Request #1 — Generate view spec

| Input          | Tokens |
| -------------- | ------ |
| System prompt + tools + conversation | 17,655 |
| **Total input** | **17,655** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 296    |
| View spec text | 98     |
| **Total output** | **394** |

| Token type | Count  | Rate     | Cost     |
| ---------- | ------ | -------- | -------- |
| Input      | 17,655 | $0.50/1M | $0.0088  |
| Output     | 394    | $3.00/1M | $0.0012  |
| **Total**  |        |          | **$0.0100** |

### Summary

| # | Event             | Input  | Output | Cost    |
| - | ----------------- | ------ | ------ | ------- |
| 1 | Generate response | 17,655 | 394    | $0.0100 |
| **Total** |           | **17,655** | **394** | **$0.0100** |

**Observations:**
- Even a single-request message costs ~$0.01 due to the large system prompt + tool definitions (~12-15K tokens baseline)
- Reasoning is 75% of output tokens — the visible response is only ~100 tokens

---

## Example 2: Parallel Calculate Calls

**User:** "I'm selling a condo for $2.5M. Commission is 2%. GST is 9% on commission. What's the net commission after GST?"
**Flow:** Agent calls `calculate` twice in parallel, then responds with the formatted answer.

### LLM Request #1 — Tool calls

| Input          | Tokens |
| -------------- | ------ |
| System prompt + tools + conversation | 11,960 |
| **Total input** | **11,960** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 369    |
| Tool calls: `calculate(2500000 * 0.02)` + `calculate((2500000 * 0.02) * 1.09)` | 107 |
| **Total output** | **476** |

→ Both calculate calls execute, results injected into context

### LLM Request #2 — Final response

| Input          | Tokens |
| -------------- | ------ |
| Previous context + tool results | 12,530 |
| **Total input** | **12,530** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 0      |
| Response text  | 64     |
| **Total output** | **64** |

### Cost Breakdown

| # | Event                    | Input  | Output | Cost    |
| - | ------------------------ | ------ | ------ | ------- |
| 1 | → 2× calculate (parallel) | 11,960 | 476    | $0.0063 |
| 2 | Format response          | 12,530 | 64     | $0.0065 |
| **Total** |                  | **24,490** | **540** | **$0.0128** |

**Observations:**
- Parallel tool calls are efficient — one request for both calculations
- Request #2 has 0 reasoning tokens — model just formats already-computed results
- Context grows ~500 tokens between requests (tool call + result overhead)

---

## Example 3: Calculate + Title Generation

**User:** "What is 1% commission on a $1.8M property sale with 60/40 co-broke split?"
**Flow:** Agent calls `calculate` twice, a background title generation fires, then the final response.

### LLM Request #1 — Tool calls

| Input          | Tokens |
| -------------- | ------ |
| System prompt + tools + conversation | 15,305 |
| **Total input** | **15,305** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 109    |
| Tool calls: `calculate(1800000 * 0.01 * 0.6)` + `calculate(1800000 * 0.01 * 0.4)` | 112 |
| **Total output** | **221** |

→ Calculate calls execute

### LLM Request #2 — Title generation (background)

| Input          | Tokens |
| -------------- | ------ |
| Short title-gen system prompt + user message | 64 |
| **Total input** | **64** |

| Output         | Tokens |
| -------------- | ------ |
| Title: "Commission Split Calculation" | 256 |
| **Total output** | **256** |

> This is a separate `ai.generateText` call that generates the chat thread title. Small input, runs in parallel with the main flow.

### LLM Request #3 — Final response

| Input          | Tokens |
| -------------- | ------ |
| Previous context + tool results | 15,621 |
| **Total input** | **15,621** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 62     |
| Response text  | 72     |
| **Total output** | **134** |

### Cost Breakdown

| # | Event                           | Input  | Output | Cost    |
| - | ------------------------------- | ------ | ------ | ------- |
| 1 | → 2× calculate (parallel)       | 15,305 | 221    | $0.0080 |
| 2 | Title generation (background)   | 64     | 256    | $0.0008 |
| 3 | Format response                 | 15,621 | 134    | $0.0080 |
| **Total** |                         | **30,990** | **611** | **$0.0168** |

**Observations:**
- Title generation adds ~$0.0008 per new conversation (negligible — 64 input tokens)
- Only fires on the first message in a thread
- Main flow context grows ~300 tokens between Request #1 and #3

---

## Example 4: CRM Search → Create → Link

**User:** "I just met Sarah Lim at 88 Tanjong Pagar. She's a buyer interested in the 2BR unit, price around $1.8M."
**Flow:** Agent searches CRM for duplicates, creates a contact, creates a deal link, logs an interaction, then responds. This is a typical real-estate CRM workflow.

### LLM Request #1 — Duplicate check

| Input          | Tokens |
| -------------- | ------ |
| System prompt + tools + conversation | 15,337 |
| **Total input** | **15,337** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 133    |
| Tool calls: `search_crm(contacts, "Sarah Lim")` + `search_crm(deals, "88 Tanjong Pagar")` | 50 |
| **Total output** | **183** |

→ Both searches return results (no duplicate contact, deal found)

### LLM Request #2 — Title generation (background)

| Input  | Tokens |
| ------ | ------ |
| Title-gen prompt | 72 |

| Output | Tokens |
| ------ | ------ |
| Title: "Sarah Lim Tanjong Pagar" | 346 |

### LLM Request #3 — Create contact

| Input          | Tokens |
| -------------- | ------ |
| Previous context + search results | 15,778 |
| **Total input** | **15,778** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 114    |
| Tool call: `create_record(contacts, [{first_name: "Sarah", last_name: "Lim", type: "buyer"}])` | 41 |
| **Total output** | **155** |

→ Contact created, ID returned

### LLM Request #4 — Link + log interaction

| Input          | Tokens |
| -------------- | ------ |
| Previous context + create result | 16,487 |
| **Total input** | **16,487** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 329    |
| Tool calls: `link_records(contact → deal)` + `create_interaction(meeting)` | 239 |
| **Total output** | **568** |

→ Contact linked to deal, meeting logged

### LLM Request #5 — Final response (cache hit)

| Input          | Tokens |
| -------------- | ------ |
| Non-cached     | 1,434  |
| Cached         | 16,191 |
| **Total input** | **17,625** |

| Output         | Tokens |
| -------------- | ------ |
| Reasoning      | 37     |
| Response text + mermaid diagram | 316 |
| **Total output** | **353** |

### Cost Breakdown

| # | Event                           | Input  | Cached | Output | Cost    |
| - | ------------------------------- | ------ | ------ | ------ | ------- |
| 1 | → 2× search_crm (parallel)     | 15,337 | 0      | 183    | $0.0078 |
| 2 | Title generation                | 72     | 0      | 346    | $0.0011 |
| 3 | → create_record (contact)       | 15,778 | 0      | 155    | $0.0080 |
| 4 | → link_records + create_interaction | 16,487 | 0  | 568    | $0.0090 |
| 5 | Final response (cache hit!)     | 1,434  | 16,191 | 353    | $0.0017 |
| **Total** |                         | **49,108** | **16,191** | **1,605** | **$0.0275** |

**Observations:**
- 4-step CRM workflow: search → create → link + log → respond
- Context grows ~1,100 tokens across 4 main-flow requests (tool results accumulate)
- **Request #5 gets a cache hit** — 16K cached tokens, only 1.4K new. This drops cost from ~$0.009 to $0.002
- Reasoning effort varies: 329 tokens for the complex link+log decision, only 37 for the final summary
- Parallel tool calls where possible (2× search in #1, link + interaction in #4)

---

## Example 5: Schema → SQL → Iterative Views

**User:** "cnz you use show view tool to show my pipeline."
**Flow:** Agent fetches DB schema, runs SQL for pipeline data, then iteratively builds and refines the view through multiple `show_view` calls. Highest-cost example at 10 requests.

### LLM Request #1 — Fetch schema

| Input  | Tokens |
| ------ | ------ |
| System prompt + tools + conversation | 11,624 |

| Output | Tokens |
| ------ | ------ |
| Reasoning: 127 | Tool call: `get_agent_db_schema()` | 14 |
| **Total output** | **141** |

### LLM Request #2 — Title generation (background)

| Input: 49 | Output: 262 | Cost: $0.0008 |

### LLM Request #3 — SQL query

| Input  | Tokens |
| ------ | ------ |
| Previous context + schema result | 14,087 |

| Output | Tokens |
| ------ | ------ |
| Reasoning: 80 | Tool call: `run_sql(SELECT stage, COUNT(*), SUM(price)...)` | 58 |
| **Total output** | **138** |

### LLM Request #4 — Search for deal details

| Input  | Tokens |
| ------ | ------ |
| Previous context + SQL result | 14,278 |

| Output | Tokens |
| ------ | ------ |
| Reasoning: 91 | Tool call: `search_crm(deals)` | 20 |
| **Total output** | **111** |

### LLM Requests #5–8 — Iterative view building

The agent tries multiple `show_view` specs, each attempt adding or revising the view layout:

| # | View attempt              | Input  | Output | Cost    |
| - | ------------------------- | ------ | ------ | ------- |
| 5 | Funnel chart panel        | 15,279 | 613    | $0.0095 |
| 6 | Grid layout with deals    | 16,031 | 653    | $0.0100 |
| 7 | Metric card (total deals) | 16,915 | 78     | $0.0087 |
| 8 | Funnel chart (revised)    | 17,393 | 152    | $0.0092 |

### LLM Request #9 — Final view (cache hit)

| Input  | Tokens |
| ------ | ------ |
| Non-cached | 1,867 |
| Cached     | 16,171 |

| Output | Tokens |
| ------ | ------ |
| Reasoning: 109 | Tool call: `show_view(...)` | 49 |

Cost: **$0.0011** (cache hit)

### LLM Request #10 — View summary

| Input: 11,141 | Output: 52 | Cost: $0.0057 |

### Cost Breakdown

| # | Event                        | Input  | Cached | Output | Cost    |
| - | ---------------------------- | ------ | ------ | ------ | ------- |
| 1 | → get_agent_db_schema        | 11,624 | 0      | 141    | $0.0059 |
| 2 | Title generation             | 49     | 0      | 262    | $0.0008 |
| 3 | → run_sql (pipeline stats)   | 14,087 | 0      | 138    | $0.0072 |
| 4 | → search_crm (deal details)  | 14,278 | 0      | 111    | $0.0072 |
| 5 | → show_view (funnel)         | 15,279 | 0      | 613    | $0.0095 |
| 6 | → show_view (grid)           | 16,031 | 0      | 653    | $0.0100 |
| 7 | → show_view (metric)         | 16,915 | 0      | 78     | $0.0087 |
| 8 | → show_view (funnel v2)      | 17,393 | 0      | 152    | $0.0092 |
| 9 | → show_view (cache hit)      | 1,867  | 16,171 | 49     | $0.0011 |
| 10 | → show_view (final)         | 11,141 | 0      | 52     | $0.0057 |
| **Total** |                      | **118,664** | **16,171** | **2,249** | **$0.0652** |

**Observations:**
- This is a **worst-case example** — 10 requests, 6.5× the average cost
- The agent iterates on `show_view` 5 times trying to get the view right (requests #5–9)
- Context grows ~1,300 tokens per step as each view spec + result accumulates
- Only 1 cache hit across 10 requests — most of the context is new each time
- **Input tokens dominate cost**: $0.059 input vs $0.007 output (89% input)
- Each additional step costs ~$0.007–0.010 due to the growing context window

---

## Key Takeaways

### Cost is dominated by input tokens (system prompt)

The system prompt + tool definitions account for ~12-17K tokens — this is the "floor" for every LLM request. Even a zero-tool response costs ~$0.006–0.009 in input alone.

| Component                    | ~Tokens | % of typical input |
| ---------------------------- | ------- | ------------------ |
| System prompt (instructions) | 4,000   | 25%                |
| Tool definitions (12 tools)  | 7,000   | 44%                |
| Conversation history         | 2,000   | 13%                |
| Tool results (accumulated)   | 3,000   | 19%                |

### Context caching saves ~34% when it hits

When Gemini's context cache activates (usually request #5+ in a multi-step flow), input cost drops from ~$0.008 to ~$0.001. But cache hits are inconsistent — only 35.5% of input tokens are cached across the fleet.

### Cost scales linearly with tool steps

Each additional tool step adds ~$0.007–0.010 to the message cost:

| Steps | Typical cost | Example                    |
| ----- | ------------ | -------------------------- |
| 1     | $0.010       | Direct response            |
| 2     | $0.013       | Single tool + response     |
| 3     | $0.017       | Tool + title gen + response |
| 4–5   | $0.025–0.030 | CRM workflow               |
| 8–10  | $0.050–0.065 | Complex iterative flows    |

### Reasoning tokens are cheap but add up

Reasoning is 82% of output tokens on average but only contributes ~$0.001 per request at $3/1M. The real cost lever is input tokens.
