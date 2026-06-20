# Browser-Use Cloud — Design Doc for Sunder Integration

> **Purpose:** Evaluate Browser-Use Cloud as the primary browser automation service for Sunder (SERVICE-12), replacing the previously planned Browserbase + Stagehand integration.
>
> **Why revisit:** The original SERVICE-12 decision was made before Browser-Use Cloud matured. Browser-Use Cloud offers a fundamentally simpler integration model: hand over a prompt, get structured results back. No session lifecycle, no two-LLM architecture, no tool-by-tool orchestration.
>
> **Decision status:** Under evaluation. Supersedes the Browserbase reference doc if adopted.

---

## Table of Contents

1. [Architecture Comparison](#1-architecture-comparison)
2. [Pricing Deep Dive](#2-pricing-deep-dive)
3. [Models, Settings & Configuration](#3-models-settings--configuration)
4. [Skills API](#4-skills-api)
5. [Firecrawl Browser Comparison](#5-firecrawl-browser-comparison)
6. [Integration Architecture for Sunder](#6-integration-architecture-for-sunder)
7. [Risks & Tradeoffs](#7-risks--tradeoffs)
8. [Recommendation](#8-recommendation)

---

## 1. Architecture Comparison

### 1.1 The Two Models

**Browserbase + Stagehand (old plan):** Your agent drives a remote browser step by step. Navigate here, click that, extract this. Each step is a tool call that burns one of your runner's 9 maxSteps. Stagehand runs a second LLM (vision model) to interpret pages. You manage session lifecycle (start, close, cleanup).

**Browser-Use Cloud (new option):** Your agent hands over a natural language prompt. Browser-Use runs the entire browsing task on their infra — their browser, their LLM, their step budget. Your agent gets back structured results. One tool call, one step burned.

```
BROWSERBASE MODEL                          BROWSER-USE MODEL
━━━━━━━━━━━━━━━━                          ━━━━━━━━━━━━━━━━━
Your Agent (LLM #1)                        Your Agent
  │ step 1: navigate                         │ step 1: browse_website({
  │ step 2: act                              │   task: "go to 99.co...",
  │ step 3: extract                          │   schema: ListingsSchema
  │ step 4: act again                        │ })
  │ step 5: extract again                    │
  │ (5 of 9 steps burned)                    │ (1 of 9 steps burned)
  │                                          │
  ▼                                          ▼
Stagehand (LLM #2)                         Browser-Use Cloud
  interprets pages                           does everything
  on your compute                            on their compute
  you pay for both LLMs                      you pay per step (their LLM included)
```

### 1.2 What Runs Where

| Component | Browserbase | Browser-Use Cloud |
|---|---|---|
| Orchestration LLM | Your Vercel Function (Gemini Flash via Gateway) | Browser-Use servers |
| Vision/page interpretation | Stagehand on your Vercel Function | Browser-Use servers |
| Browser | Browserbase cloud | Browser-Use cloud |
| Session management | You (create, close, cleanup) | Them (auto-managed) |
| Your Vercel Function does... | Runs Stagehand agent code + waits for browser | Makes one HTTP call + waits for response |

### 1.3 Why This Matters for Serverless

With Browserbase, your Vercel Function runs Stagehand code that orchestrates multi-step browsing. Each step involves LLM inference (vision model) + browser commands + waiting. The function must stay alive for the entire duration.

With Browser-Use, your Vercel Function makes a single API call and waits for the response. It's the same as calling any other REST API. The heavy compute happens elsewhere.

Both still require `maxDuration` increases (browser tasks take 15-60s), but Browser-Use puts less load on your function.

---

## 2. Pricing Deep Dive

### 2.1 Browser-Use Cloud Pricing Structure

**Two cost components per task:**

1. **Initialization fee:** $0.01 per task started (flat, regardless of model)
2. **Per-step fee:** Varies by model (see table below)

**Plus infrastructure costs:**

| Item | Pay As You Go | Business ($500/mo) | Scaleup ($2,500/mo) |
|---|---|---|---|
| Browser session | $0.06/hr | $0.03/hr (50% off) | $0.03/hr (50% off) |
| Proxy data | $10/GB | $5/GB (50% off) | $4/GB (60% off) |
| Concurrent sessions | Limited | 250 | 500 |
| Profiles | 2 | Unlimited | Unlimited |
| Active skills | Limited | 100 | 1,000 |
| Session timeout | 4 hours max | 4 hours max | 4 hours max |
| Signup credits | $1-$10 | $500 included | $2,500 included |

### 2.2 Per-Step LLM Pricing

| Model | Cost/Step | 10-Step Task Total | Notes |
|---|---|---|---|
| `browser-use-llm` | $0.002 | $0.03 | Cheapest. Their fine-tuned model. |
| `browser-use-2.0` | $0.006 | $0.07 | Better accuracy than v1. Default recommendation. |
| `gemini-flash-latest` | $0.005 | $0.06 | Google Gemini Flash |
| `gemini-flash-lite-latest` | $0.003 | $0.04 | Lighter/faster Gemini |
| `gemini-2.5-flash` | $0.005 | $0.06 | |
| `gemini-2.5-pro` | $0.02 | $0.21 | |
| `gemini-3-flash-preview` | $0.005 | $0.06 | |
| `gemini-3-pro-preview` | $0.03 | $0.31 | |
| `gpt-4.1` | $0.01 | $0.11 | |
| `gpt-4.1-mini` | $0.005 | $0.06 | |
| `gpt-4o` | $0.01 | $0.11 | |
| `gpt-4o-mini` | $0.003 | $0.04 | |
| `o3` | $0.03 | $0.31 | Reasoning model |
| `o4-mini` | $0.01 | $0.11 | |
| `claude-sonnet-4-20250514` | $0.02 | $0.21 | |
| `claude-sonnet-4-5-20250929` | $0.05 | $0.51 | Most expensive |
| `claude-opus-4-5-20251101` | — | — | Listed, pricing TBD |
| `llama-4-maverick-17b-128e-instruct` | $0.003 | $0.04 | Open-source, fast |

### 2.3 Cost Modeling for Sunder

**Assumptions:**
- Average task: 10 steps (navigate, interact, extract)
- Model: `browser-use-2.0` ($0.006/step)
- Average 3 browser tasks per active user per day
- ~20 active days/month
- Browser session time: ~2 min per task

**Per-user monthly cost:**

| Item | Calculation | Cost |
|---|---|---|
| Task init | 60 tasks x $0.01 | $0.60 |
| Steps | 60 tasks x 10 steps x $0.006 | $3.60 |
| Browser time | 60 tasks x 2 min = 2 hrs x $0.06 | $0.12 |
| **Total per user** | | **$4.32/mo** |

**At 50 users:** ~$216/month (Pay As You Go, no subscription needed)

**Comparison with Browserbase:**

| | Browser-Use Cloud | Browserbase |
|---|---|---|
| Per-user estimate | ~$4.32/mo | ~$1.48/mo (browser time only) |
| But also pay for... | Nothing else (LLM included) | Your own LLM costs (Gemini Flash for Stagehand) |
| Base fee | $0 (Pay As You Go) | $20/mo |
| At 50 users | ~$216/mo | ~$74/mo + LLM costs |

**Key insight:** Browser-Use is more expensive per task because you're paying for their LLM. But you're NOT paying for your own LLM to run Stagehand. The net difference depends on how much your Stagehand LLM calls would cost. For simple tasks, Browser-Use is slightly more expensive. For complex multi-step tasks where Stagehand's vision model runs many times, the gap narrows.

**Cost optimization with Skills:** If you use Browser-Use Skills (see Section 4) for repeated tasks like "search 99.co for listings," the skill executes as a deterministic script — no LLM steps, no per-step cost, just the execution fee. This could dramatically reduce costs for common workflows.

### 2.4 Cheaper Model Options

If cost is a concern, use `browser-use-llm` ($0.002/step) instead of `browser-use-2.0` ($0.006/step). Same 10-step task drops from $0.07 to $0.03. Trade-off is accuracy on complex pages.

---

## 3. Models, Settings & Configuration

### 3.1 Available Models

Browser-Use Cloud supports 18+ models. The key ones for Sunder:

| Model | Best For | Speed | Accuracy | Cost/Step |
|---|---|---|---|---|
| `browser-use-llm` | Simple tasks, cost optimization | Fast | Good | $0.002 |
| `browser-use-2.0` | General-purpose (recommended default) | Medium | Better | $0.006 |
| `gemini-3-flash-preview` | Matches our Tier 1 model | Fast | Good | $0.005 |
| `gpt-4.1-mini` | Balance of speed/accuracy | Fast | Good | $0.005 |

**`browser-use-llm`** is their own fine-tuned model — cheapest and optimized for their platform. Good starting point.

**`browser-use-2.0`** is their v2 model — better accuracy, still cheap. This is the recommended default.

### 3.2 Task Configuration Options

Every task accepts these settings:

```typescript
const task = await client.tasks.createTask({
  // Required
  task: "Your instruction (1-50,000 chars)",

  // Model selection
  llm: "browser-use-2.0",              // default: gemini-3-flash-preview

  // Navigation
  startUrl: "https://99.co",           // pre-navigate before task starts
  allowedDomains: ["99.co"],           // restrict to specific domains

  // Performance modes
  flashMode: false,                     // skip LLM thinking (faster, less accurate)
  thinking: false,                      // enable extended reasoning (slower, more accurate)
  vision: true,                         // true | false | "auto"

  // Output
  structuredOutput: '{"listings": [...]}',  // JSON schema for structured response
  // OR use Zod schema via SDK (preferred)

  // Execution limits
  maxSteps: 100,                        // default 100, max 10,000

  // Session
  sessionId: "existing-session-id",     // reuse session for multi-task workflows

  // Agent customization
  systemPromptExtension: "Focus on...", // max 2,000 chars
  highlightElements: false,             // visual debugging

  // Skills
  skillIds: ["skill_abc"],              // enable specific skills

  // Security
  secrets: { password: "..." },         // injected securely, not in logs
  opVaultId: "vault-id",               // 1Password integration

  // Evaluation
  judge: false,                         // AI judge for task success
  judgeGroundTruth: "expected...",      // ground truth for judge
});
```

### 3.3 Recommended Settings for Sunder

```typescript
{
  llm: "browser-use-2.0",       // best price/accuracy balance
  vision: true,                  // needed for page interpretation
  flashMode: false,              // keep reasoning for complex real estate sites
  thinking: false,               // not needed for standard browsing tasks
  maxSteps: 50,                  // real estate tasks rarely need > 30 steps
  allowedDomains: undefined,     // let the agent go where it needs to
}
```

For property searches specifically, consider `flashMode: true` to speed up repetitive lookups once you've validated accuracy.

### 3.4 v2 vs v3 API

The Cloud API is versioned at `/api/v2/`. All endpoints documented above use v2. The SDK (`browser-use-sdk`) wraps v2.

The **open-source Browser-Use library** (Python) has a separate versioning:
- v1 (`browser-use-llm`): Original fine-tuned model
- v2 (`browser-use-2.0`): Improved accuracy, better structured output handling

These are model versions, not API versions. The Cloud API version (v2) and the model versions (v1/v2) are independent.

There is no "v3 API" yet. The v2 API is current and stable.

### 3.5 Streaming & Real-Time Updates

Two methods for monitoring task progress:

**`task.stream()`** — yields step-by-step updates as they happen:
```typescript
for await (const step of task.stream()) {
  console.log(`Step ${step.number}: ${step.url} (${step.next_goal})`);
}
```

**`task.watch()`** — yields full task state on every update:
```typescript
for await (const update of task.watch()) {
  if (update.data.status === "finished") {
    // use update.data.parsed for typed results
  }
}
```

Both are useful for showing "Browsing..." progress in the Sunder chat UI.

---

## 4. Skills API

This is the most interesting feature for Sunder's use case.

### 4.1 What Skills Are

A Skill is a **deterministic, reusable script** generated from a one-time demonstration. You show Browser-Use how to do something once (via an agent prompt or a recording), and it builds a production-ready API endpoint you can call repeatedly.

**The key insight:** Skills execute as deterministic scripts, not as LLM agent runs. No browser or session needed at runtime. Executes in milliseconds. No per-step LLM cost.

### 4.2 How Skill Creation Works

1. You provide a **goal** (what the endpoint does, input/output schema) and a **demonstration** (agent prompt showing how to do it)
2. Browser-Use runs the agent once to learn the workflow
3. It generates a deterministic script from the recording
4. The script becomes an API endpoint with typed input/output

```typescript
// Create a skill for searching 99.co
const skill = await client.skills.createSkill({
  agentPrompt: "Go to https://99.co, use the search bar to search for condos, " +
    "filter by 3 bedrooms, filter by district (Tanjong Pagar), " +
    "scroll to load results, extract all visible listings.",
  goal: "Search 99.co for condos matching criteria. " +
    "Input: { bedrooms: number, district: string }. " +
    "Output: array of { name, price, bedrooms, sqft, url } for each listing.",
});

// skill.id → "skill_abc123"
// skill.status → "processing" (one-time generation)
```

Once created, you can call it with parameters:

```typescript
const result = await client.skills.executeSkill({
  skill_id: "skill_abc123",
  parameters: { bedrooms: 3, district: "Tanjong Pagar" },
});
// result → typed listing data, returned in milliseconds
```

### 4.3 Why Skills Matter for Sunder

Real estate agents do the **same browsing tasks repeatedly**:
- Search property portals (99.co, PropertyGuru, SRX) for listings
- Check URA caveats for a specific property
- Look up HDB resale prices
- Check transaction history on specific portals

These are perfect candidates for Skills:
- Create the skill once via agent prompt
- Call it with parameters (district, bedrooms, property type) thereafter
- Deterministic execution — same steps every time, no LLM flakiness
- Fast — milliseconds, not 30-60 seconds
- Cheap — no per-step LLM cost

### 4.4 Skills vs Tasks

| | Task (ad-hoc) | Skill (reusable) |
|---|---|---|
| **How it works** | LLM agent browses autonomously | Deterministic script runs |
| **Speed** | 15-60 seconds | Milliseconds |
| **Cost** | $0.01 init + $0.002-0.05/step | Execution fee only (no LLM steps) |
| **Reliability** | LLM-dependent (may vary) | Deterministic (same result every time) |
| **Best for** | One-off, novel browsing tasks | Repeated, structured workflows |
| **Maintenance** | None | Skills may break if site UI changes |

### 4.5 Skill Lifecycle

```
Create skill (one-time)
  │  Browser-Use runs agent to learn workflow
  │  Generates deterministic script
  │  Extracts input/output schema
  ▼
Skill ready
  │  Call with parameters → instant results
  │  No browser needed at runtime
  ▼
Site changes?
  │  Skill may break
  │  Re-create skill to re-learn the workflow
  ▼
```

### 4.6 Using Skills Inside Tasks

You can also make Skills available to the agent during a Task. The agent can decide to use a Skill when appropriate:

```typescript
const task = await client.tasks.createTask({
  task: "Find 3-bed condos in Tanjong Pagar and compare prices",
  skillIds: ["skill_99co_search", "skill_propertyguru_search"],
  // Agent can invoke these skills during its browsing
});
```

Or enable all skills: `skillIds: ["*"]`

### 4.7 Architecture with Skills

The optimal Sunder integration would use **both Tasks and Skills**:

```
User: "Find me condos in Tanjong Pagar"
  │
  ▼
Sunder Agent
  │  Has a browse_website tool (uses Tasks for ad-hoc browsing)
  │  Has a search_property_portal tool (uses Skills for known portals)
  │
  │  Decides: "This is a 99.co search — I have a skill for that"
  │  Calls: search_property_portal({ portal: "99co", bedrooms: 3, district: "..." })
  │
  ▼
Browser-Use Skill → instant structured results
  │  No browser, no LLM, milliseconds
  ▼
Sunder Agent
  │  Formats results, saves to CRM, replies to user
```

For novel/unexpected browsing needs, fall back to a Task (ad-hoc agent browsing).

---

## 5. Firecrawl Browser Comparison

Firecrawl recently launched a Browser Sandbox product that also targets the "give your AI agent a browser" use case. Worth evaluating since we already use Firecrawl's scraping in our reference architecture.

### 5.1 What Firecrawl Browser Is

Firecrawl Browser Sandbox is a cloud-hosted Chromium environment with Playwright pre-installed. It's closer to Browserbase than Browser-Use — you get a remote browser and drive it yourself. Two modes:

**Agent Browser (bash mode):** A CLI pre-installed in every session. Your agent sends bash commands:
```
open https://99.co
snapshot                    → get accessibility tree with reference IDs
click @ref                  → click element by ref ID
fill @ref '3 bedrooms'      → fill form field
scrape                      → extract page as markdown
```

**Playwright mode:** Full CDP WebSocket access. Your agent sends Playwright code that runs remotely.

Both modes require your agent to drive step-by-step — there is no "hand over a prompt" mode. The agent needs to decide what to click, what to extract, etc.

### 5.2 Firecrawl AI SDK Integration

```typescript
import { FirecrawlTools } from "firecrawl-aisdk";

const { text } = await generateText({
  model: gateway("gemini-3-flash-preview"),
  prompt: "Search for condos on 99.co",
  tools: FirecrawlTools(),       // scrape + search + map + crawl + agent + extract + browser
  stopWhen: stepCountIs(5),
});
```

`FirecrawlTools()` bundles 8 tools including browser. It's plug-and-play from an install standpoint. But the browser tool still follows the step-by-step model — your agent makes individual tool calls to navigate, interact, and extract.

### 5.3 Firecrawl Pricing

| Plan | Monthly | Credits | Per-Credit |
|---|---|---|---|
| Free | $0 | 500 (one-time) | — |
| Hobby | $16/mo | 3,000/mo | ~$0.0053 |
| Standard | $83/mo | 100,000/mo | ~$0.0008 |
| Growth | $333/mo | 500,000/mo | ~$0.0007 |
| Scale | $599/mo | 1,000,000/mo | ~$0.0006 |

**Credit costs by feature:**

| Feature | Credit Cost |
|---|---|
| Scrape | 1 credit/page |
| Crawl | 1 credit/page |
| Search | 2 credits/10 results |
| **Browser** | **2 credits/minute** |
| Agent (preview) | 5 free runs/day, dynamic pricing after |

**BYOK:** Firecrawl Browser is bring-your-own-key for LLM. The browser is just infra — your agent (on your LLM) decides what to do. You pay for the browser time, plus your own LLM costs separately.

### 5.4 Cost Comparison: A Typical 10-Step Task

**Scenario:** "Go to 99.co, search for 3-bed condos in Tanjong Pagar, extract listings." Assume ~2 minutes of browser time, 10 agent steps.

#### Browser-Use Cloud

| Item | Cost |
|---|---|
| Task init | $0.01 |
| 10 steps x $0.006 (`browser-use-2.0`) | $0.06 |
| Browser session (~2 min x $0.06/hr) | $0.002 |
| Your LLM (for the 1 tool call) | ~$0.001 |
| **Total** | **~$0.073** |

LLM for browsing is included. You only pay your own LLM for the single tool call from your agent.

#### Firecrawl Browser (Standard plan)

| Item | Cost |
|---|---|
| Browser time: 2 min x 2 credits = 4 credits | $0.003 |
| Your LLM: 10 tool calls x Gemini Flash | ~$0.01-0.03 |
| **Total** | **~$0.013-0.033** |

Firecrawl's browser itself is cheap. But you're paying for your LLM to make 10 separate tool calls (navigate, snapshot, click, fill, scrape, etc.), and each burns one of your runner's 9 maxSteps.

#### Browserbase + Stagehand

| Item | Cost |
|---|---|
| Browser time: 2 min x $0.12/hr | $0.004 |
| Stagehand LLM (vision): ~10 calls x Gemini Flash | ~$0.01-0.03 |
| Your orchestration LLM: 5 tool calls x Gemini Flash | ~$0.005-0.015 |
| **Total** | **~$0.019-0.049** |

### 5.5 Monthly Cost at 50 Users (60 tasks/user/month)

| Service | Per Task | Monthly (3,000 tasks) | Notes |
|---|---|---|---|
| **Browser-Use Cloud** | ~$0.073 | **~$219** | LLM included. Predictable. |
| **Firecrawl Browser** | ~$0.023 | **~$69** + plan fee ($83) = **~$152** | BYOK. Cheaper per task, but + plan + your LLM. |
| **Browserbase** | ~$0.034 | **~$102** + plan fee ($20) = **~$122** | BYOK. Two-LLM cost. |

### 5.6 The Real Difference: Architecture, Not Price

Price differences are modest. The architectural difference is what matters:

| | Browser-Use Cloud | Firecrawl Browser | Browserbase |
|---|---|---|---|
| **Model** | Hand over a prompt | Drive step-by-step | Drive step-by-step |
| **Your maxSteps consumed** | 1 | 5-10 | 3-5 |
| **Session management** | Automatic | Manual (create/close) | Manual (create/close) |
| **Your LLM involved in browsing?** | No | Yes (decides every action) | Yes (orchestrates Stagehand) |
| **Structured output** | Built-in (Zod) | You parse it | You parse it |
| **Skills/deterministic replay** | Yes | No | No |
| **AI SDK integration** | Custom SDK (not AI SDK native) | `firecrawl-aisdk` (native) | `@browserbasehq/ai-sdk` (native) |
| **Vercel Function load** | Light (one HTTP call) | Heavy (runs tool calls) | Heavy (runs Stagehand) |

**Firecrawl Browser is Browserbase-lite.** Same step-by-step model, simpler setup, cheaper browser time, but no Stagehand vision layer (your LLM does all the page interpretation). Good if you want low-level control. Bad if you want KISS.

**Browser-Use Cloud is the only "hand over a prompt" option.** Your agent stays simple, your maxSteps stay free, your Vercel Function stays light. You trade control for simplicity.

### 5.7 When Firecrawl Browser Would Be Better

- You need fine-grained control over each browsing step (e.g., complex multi-page flows with conditional logic)
- You're already on a Firecrawl plan for scraping and want to consolidate vendors
- You want to use your own LLM for browsing decisions (maybe you've fine-tuned something)
- Cost sensitivity at high volume — BYOK is cheaper when you control the model

### 5.8 When Browser-Use Cloud Would Be Better

- You want the simplest integration (one tool, one API call)
- You don't want browsing to eat your runner's maxSteps
- You want deterministic Skills for repeated workflows
- You don't want to manage session lifecycle
- You want LLM cost included and predictable per task

### 5.9 Skyvern — The RPA-Focused Alternative

Skyvern is another "hand over a prompt" service, but focused on workflow RPA — form filling, authenticated processes, multi-step business automation.

**How it works:** Same model as Browser-Use — send a prompt + URL + data extraction schema, get structured results back. But adds a workflow layer: composable multi-block automations (TaskBlock, ExtractionBlock, ForLoopBlock, CodeBlock) defined in YAML or SDK, reusable across runs.

```python
# Skyvern task (same "hand over a prompt" model)
task = await skyvern.run_task(
    prompt="Find 3-bed condos in Tanjong Pagar on 99.co",
    url="https://99.co",
    engine="skyvern-2.0",
    data_extraction_schema={
        "type": "object",
        "properties": {
            "listings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "price": {"type": "string"},
                    }
                }
            }
        }
    }
)
```

**Skyvern vs Browser-Use:**

| | Browser-Use Cloud | Skyvern |
|---|---|---|
| **Architecture** | Hand-over-prompt agent | Hand-over-prompt agent |
| **Reusable workflows** | Skills (deterministic, fast) | Workflows (composable blocks, YAML) |
| **TypeScript SDK** | `browser-use-sdk` (first-class) | Python-first. TS SDK planned. |
| **AI SDK integration** | No (custom SDK) | No (custom SDK) |
| **LLM models** | 18+ (BYOM or their models) | Their models only (`skyvern-1.0`, `skyvern-2.0`) |
| **CAPTCHA solving** | Via proxies | Built-in |
| **2FA / TOTP** | Not built-in | Built-in (`totp_identifier`, `totp_url`) |
| **Pricing** | Transparent per-step | Credit-based (rates undisclosed) |
| **Free tier** | $1-10 signup credits | 1,000 credits |
| **Entry price** | $0 (Pay As You Go) | $29/mo (Hobby) |
| **Compliance** | Standard | SOC2 Type II, HIPAA (enterprise) |
| **Run recordings** | Live URL (stream/watch) | Recording URL for every run |
| **Best for** | General browsing, data extraction, portal searches | Complex authenticated workflows, form filling, government portals |

**Pricing comparison (same 10-step task):**

| Service | Cost Breakdown | Total |
|---|---|---|
| Browser-Use | $0.01 init + 10 x $0.006 + browser | ~$0.073 |
| Skyvern | Credit-based, ~5-15 credits per task | ~$0.08-0.15 (estimated from plan allocations) |

Skyvern is more expensive and less transparent on pricing. But it has genuine advantages for complex RPA:

- **CAPTCHA + 2FA built-in** — if Singapore government portals (URA, HDB) or agent portals require TOTP, Skyvern handles it natively. Browser-Use doesn't.
- **Workflow composability** — ForLoopBlock + CodeBlock + TaskBlock lets you build multi-page data pipelines (e.g., "for each district in this list, search 99.co and extract listings"). Browser-Use Skills are simpler but less composable.
- **Session persistence** — `persist_browser_session: true` keeps auth across workflow runs. Useful for agent portals that require login.
- **Run recordings** — every task gets a recording URL. Better for debugging than Browser-Use's stream/watch.

**Verdict for Sunder:** Use Browser-Use as the primary (simpler, cheaper, Skills API). Keep Skyvern on the radar for v2 if we need authenticated government portal automation (URA caveats, HDB resale queries) where 2FA and CAPTCHA are blockers.

### 5.10 Updated BYOK Cost Reality

The original Feb 2026 cost comparison in the built-in services doc understated BYOK costs (Firecrawl, Browserbase) by ignoring LLM inference for page interpretation. Each browser step needs a vision-capable LLM call to interpret the page and decide what to do next.

**Real BYOK cost per step (Gemini Flash vision):** ~$0.003-0.01 per step (screenshot + reasoning). At 10 steps per action, that's ~$0.03-0.10 in LLM costs alone — on top of browser time.

**Updated cost per action (10-step task):**

| Service | Browser Cost | LLM Cost | Total |
|---|---|---|---|
| Browser-Use Cloud | $0.002 | $0.06 (included) | **$0.073** |
| Firecrawl Browser | $0.004 | ~$0.05 (your Gemini) | **~$0.054** |
| Browserbase + Stagehand | $0.004 | ~$0.05 (your Gemini x2) | **~$0.072** |
| Skyvern | credit-based | included | **~$0.08-0.15** |

The cost gap between BYOK and all-inclusive services is much smaller than it appears. Browser-Use and Firecrawl end up comparable in total cost, but Browser-Use has dramatically simpler integration and doesn't consume your runner's maxSteps.

---

## 6. Integration Architecture for Sunder

### 6.1 Overview

Three tools in the runner + one UI flow, backed by one SDK:

| Tool / Feature | Backend | Use Case |
|---|---|---|
| `browse_website` | Browser-Use Task API | Ad-hoc browsing — agent decides what to browse |
| `browse_website` + profileId | Browser-Use Task API + Profiles | Authenticated browsing on user's platforms |
| `search_property_portal` (v3) | Browser-Use Skills API | Known portal searches — deterministic, fast, cheap |
| Platform auth flow | Browser-Use Sessions + Profiles | User logs into their platforms via embedded browser |

### 6.2 Authenticated Browsing — The Core Use Case

The primary value of browser automation for real estate agents is accessing **login-gated internal platforms** that have no APIs:
- PropNex ProMap (property search, project data)
- ERA APAC internal tools
- OrangeTee agent portals
- URA / HDB government portals (caveats, resale data)
- PropertyGuru agent dashboard

These platforms require the user's own credentials. Sunder must browse them on the user's behalf.

### 6.3 Profile-Based Auth Architecture

Browser-Use **Profiles** persist browser state (cookies, localStorage, login sessions) across sessions. Each profile is isolated. State auto-saves after every session.

```
Per-client data model:

clients table
  └── browser_profiles (new table or JSONB column)
        ├── { platform: "propnex", profile_id: "profile_abc", label: "PropNex ProMap" }
        ├── { platform: "propertyguru", profile_id: "profile_def", label: "PropertyGuru" }
        └── { platform: "ura", profile_id: "profile_ghi", label: "URA Caveats" }
```

When the agent calls `browse_website` for a known platform, it passes the user's saved `profileId`. Browser-Use loads the session with saved cookies — already logged in.

### 6.4 Platform Auth Flow — Embedded Browser in Chat

#### The Ideal Flow

When the agent needs to access a login-gated platform for the first time:

```
User: "Search PropNex ProMap for 2-3 bed condos in D15"

Agent: I need access to PropNex. Let me open a browser for you to log in.

       ┌─────────────────────────────────────────┐
       │                                         │
       │   [Live Browser - PropNex Login]         │
       │   Embedded via publicShareUrl            │
       │   User logs in with their credentials    │
       │                                         │
       └─────────────────────────────────────────┘

       [Done - I've logged in]     ← button in chat

Agent: Got it, saved your PropNex session. Now searching ProMap...
       Found 4 projects, 118 listings...
```

#### Implementation: How the Embedded Browser Works

```typescript
// 1. Create a profile for this client + platform (one-time)
const profileId = `sunder_${clientId}_propnex`;

// 2. Create a session with the profile
const session = await client.sessions.createSession({
  profileId,
  startUrl: "https://promap.propnex.com/login",
});

// 3. Create a public share URL (embeddable, no auth required)
const share = await client.sessions.createPublicShare(session.id);
// share.shareUrl → "https://share.browser-use.com/xyz789"

// 4. Return the shareUrl to the chat UI as a special part type
// Chat UI renders it as an iframe

// 5. User logs in, clicks "Done" button in chat

// 6. Verify login worked
const verifyTask = await client.tasks.createTask({
  sessionId: session.id,
  llm: "browser-use-llm",
  task: "Confirm you are logged into PropNex and can see the dashboard. Return { loggedIn: true/false }",
  maxSteps: 5,
});
const verifyResult = await verifyTask.complete();

// 7. Clean up: delete public share, stop session (cookies auto-saved to profile)
await client.sessions.deletePublicShare(session.id);
await client.sessions.stopSession(session.id);

// 8. Save profile mapping to DB
// INSERT INTO browser_profiles (client_id, platform, profile_id, label)
```

#### Verification Status: Embedded Browser Interactivity

**Tested 2026-03-17. Results below.**

Browser-Use provides two URL types for sessions:

| URL Type | Iframe Embeddable? | Interactive? | Auth Required? |
|---|---|---|---|
| `liveUrl` (`live.browser-use.com?wss=...`) | YES (no X-Frame-Options, CORS `*`) | LIKELY YES (WebSocket CDP connection = bidirectional) | Possibly self-authenticating via session-specific CDP URL in query string |
| `publicShareUrl` (`cloud.browser-use.com/share/...`) | NO (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) | NO (dashboard replay page) | No (public token) |

**Conclusion: Use `liveUrl` for the embedded browser, not `publicShareUrl`.**

The `liveUrl` connects to the browser via WebSocket (CDP protocol) using a session-specific endpoint baked into the URL query string (`wss=https://{sessionId}.cdp5.browser-use.com`). This is the same pattern used by noVNC and other interactive browser streaming tools — the WebSocket connection is inherently bidirectional, supporting both viewing and input.

**Remaining manual verification needed:**
1. Open a `liveUrl` in your browser
2. Confirm you can click, type, and navigate (not just watch)
3. Confirm it works without being logged into Browser-Use (the CDP URL in the query string may self-authenticate)

See Appendix A for step-by-step manual test instructions.

**If `liveUrl` is NOT interactive (view-only):** Fall back to opening `liveUrl` in a new tab instead of an iframe. The user logs in there, comes back to Sunder, clicks "Done." Less integrated but still works.

**If `liveUrl` requires Browser-Use auth:** Fall back to agent-driven login. User provides credentials via Sunder settings, stored as Browser-Use `secrets`. Agent logs in on their behalf. Works for username/password. Fails for OTP/2FA — would need the cookie sync script as last resort.

#### Chat UI Part Type

New assistant message part type for the embedded browser:

```typescript
// Part type in the chat message
{
  type: "browser-auth",
  state: "waiting-for-login",  // → "login-confirmed" | "login-failed"
  platform: "propnex",
  shareUrl: "https://share.browser-use.com/xyz789",
  sessionId: "sess_abc123",
  profileId: "profile_abc",
}
```

The frontend renders this as an iframe with a "Done" button. When the user clicks Done, the frontend sends a message that triggers verification.

### 6.5 Cookie Expiry & Re-Authentication

Cookies expire. Login sessions time out. When a browsing task fails because the profile's auth has expired:

```
Agent calls browse_website with profileId
  → Browser-Use opens session with saved cookies
  → Site redirects to login page (cookies expired)
  → Task returns: { isSuccess: false, output: "Login required" }

Agent detects auth failure:
  "Your PropNex session has expired. Let me open a browser for you to log in again."

  [Embedded browser auth flow — same as initial setup]

  "Reconnected. Now searching ProMap..."
```

The tool's error handling should detect common auth failure patterns (redirect to login, "session expired" messages) and trigger the re-auth flow automatically.

### 6.6 Day-to-Day Authenticated Browsing Flow

```
User: "Search PropNex ProMap for 2-3 bed condos in D15"

Agent: (checks DB → user has profile_abc for propnex)
  Calls: browse_website({
    task: "Search ProMap for condos: D15, sale, 2-3 bedrooms, near MRT",
    startUrl: "https://promap.propnex.com",
    profileId: "profile_abc"    // ← user's saved PropNex profile
  })

Browser-Use:
  1. Creates session with profile_abc → cookies loaded → already logged in
  2. Navigates to ProMap search
  3. Fills filters: D15, condo, 2-3 bed, near MRT
  4. Extracts results
  5. Returns structured data

Agent: "Found 4 projects with 118 new listings:
  - Unit Mix: 2-3 bed
  - Size: 667-1,464 sqft
  - Price: $1.89M-$4.26M (Avg $3.10M)
  - PSF: $2,291-$3,260 (Avg $2,922)

  Want me to save any of these to your CRM?"
```

### 6.7 Files to Create/Edit

**New files:**

| File | Purpose |
|---|---|
| `src/lib/runner/tools/browser/browse-website.ts` | Main browsing tool (~60 lines) |
| `src/lib/runner/tools/browser/index.ts` | Barrel export |
| `src/lib/browser-use/client.ts` | Shared Browser-Use client singleton |
| `src/lib/browser-use/profiles.ts` | Profile CRUD (create, get, list for client) |

**Edit files:**

| File | Change |
|---|---|
| `src/lib/runner/tools/index.ts` | Add `createBrowserTools` export |
| `src/lib/runner/tool-registry.ts` | Add browser tools, gated on `BROWSER_USE_API_KEY` |
| `src/lib/ai/system-prompt.ts` | Browser tool instructions + when to use profiles |
| `app/api/chat/route.ts` | `maxDuration` 60 → 120 |
| `.env.example` | Add `BROWSER_USE_API_KEY` |

**New API routes (for auth flow):**

| Route | Purpose |
|---|---|
| `app/api/browser/session/route.ts` | Create session + public share for auth flow |
| `app/api/browser/verify/route.ts` | Verify login, save profile, cleanup share |

**Database:**

| Change | Purpose |
|---|---|
| New table or JSONB: `browser_profiles` | Map client → platform → Browser-Use profile ID |

### 6.8 Conceptual Tool Implementation

```typescript
import { tool } from "ai";
import { z } from "zod";
import { getBrowserUseClient } from "@/lib/browser-use/client";
import { getProfileForPlatform } from "@/lib/browser-use/profiles";

/**
 * Creates the browse_website tool with client context.
 */
export function createBrowseWebsiteTool(
  supabase: SupabaseClient,
  clientId: string,
) {
  const client = getBrowserUseClient();

  return {
    browse_website: tool({
      description:
        "Browse a website to find information, interact with pages, fill forms, or extract data. " +
        "Describe what you need in natural language. " +
        "For login-gated platforms (PropNex, PropertyGuru, ERA, URA, HDB), " +
        "the user's saved session will be used automatically.",
      parameters: z.object({
        task: z.string().describe("What to do on the website"),
        startUrl: z.string().url().optional().describe("URL to start from"),
        platform: z.string().optional().describe(
          "Platform identifier if this is a known login-gated site (e.g. 'propnex', 'propertyguru')"
        ),
      }),
      execute: async ({ task, startUrl, platform }) => {
        // Look up saved profile for this platform
        let profileId: string | undefined;
        if (platform) {
          const profile = await getProfileForPlatform(supabase, clientId, platform);
          if (!profile) {
            return {
              success: false,
              error: `No saved login for ${platform}. Ask the user to connect their ${platform} account first.`,
              needsAuth: true,
              platform,
            };
          }
          profileId = profile.browserUseProfileId;
        }

        // Create session (with profile if authenticated)
        const sessionOpts = profileId ? { profileId } : {};
        const session = await client.sessions.createSession(sessionOpts);

        try {
          const browserTask = await client.tasks.createTask({
            sessionId: session.id,
            task,
            llm: "browser-use-2.0",
            startUrl,
            maxSteps: 50,
          });

          const result = await browserTask.complete();

          return {
            success: result.isSuccess ?? true,
            output: result.output,
          };
        } finally {
          await client.sessions.stopSession(session.id);
        }
      },
    }),
  };
}
```

### 6.9 What This Means for the Runner

- **maxSteps:** Not a concern. Browsing burns 1 step of your 9. Browser-Use's internal steps are separate.
- **maxDuration:** Needs a bump. `task.complete()` blocks until the browser agent finishes (15-60s). Recommend `maxDuration = 120` on the chat route (up from 60).
- **Session cleanup:** Explicit `stopSession()` in the finally block. Unlike Browserbase, this is just one API call, not process exit handler wiring.
- **Error handling:** Check `result.isSuccess`. If false and it's an auth issue (`needsAuth: true`), the agent triggers the embedded browser auth flow.
- **Streaming:** Optionally use `task.stream()` to push "Browsing..." progress to the chat UI.

### 6.10 Approval System Integration

Browser actions are external-facing. Under Sunder's safety model:

- **Read-only browsing (search, extract):** Auto-approved. Internal data gathering.
- **Form submission, login, external interaction:** Requires approval. Treat like any other external-facing tool.

The tool's `description` and the system prompt should guide the agent to request approval when submitting forms or performing write actions on external sites.

### 6.11 Phasing

**Phase 1 (ship first):** `browse_website` tool + profile auth flow. Public sites work immediately. Authenticated sites work after user connects via embedded browser.

**Phase 2 (fast follow):** Skills for top 3-5 SG property portals. Creates deterministic, instant, cheap endpoints for repeated searches. Backend-managed — user never sees the Skills layer.

**Phase 3 (later):** Re-auth detection (auto-detect expired cookies and trigger re-login), multi-step workflows (search portal A, compare with portal B), form submission with approval gates.

---

## 7. Risks & Tradeoffs

### 7.1 What You Gain (vs Browserbase)

- Dramatically simpler integration (~50 lines vs ~200 lines + 8 files)
- No session lifecycle management
- No two-LLM architecture complexity
- No Stagehand dependency
- Skills API for deterministic, fast, cheap repeated tasks
- LLM cost included in per-step pricing (no separate Gateway cost for browsing)
- Structured output with Zod built into the SDK

### 7.2 What You Lose (vs Browserbase)

- **Control:** Black box. You hand over a prompt and trust the agent. No mid-task course correction.
- **Observability:** Limited visibility into what the agent does (mitigated by `stream()`/`watch()`).
- **Anti-bot capability:** Browser-Use has proxies and profiles, but Browserbase has more advanced stealth (fingerprinting, CAPTCHA solving). If Singapore property portals have aggressive bot detection, this could matter.
- **Cost at scale:** Browser-Use is ~3x more expensive per task at current pricing. At high volume, Browserbase's "bring your own LLM" model is cheaper.
- **Vendor maturity:** Browser-Use Cloud is newer than Browserbase. Less track record in production.

### 7.3 Mitigation

| Risk | Mitigation |
|---|---|
| Black box browsing | Use `task.stream()` for step visibility. Log all task IDs for debugging. |
| Anti-bot blocks | Test against actual SG property portals early. Switch to Browserbase if blocked. |
| Cost at scale | Use Skills for repeated workflows (eliminates per-step LLM cost). Use `browser-use-llm` model for cost optimization. |
| Vendor risk | Integration is thin (~50 lines). Swapping to Browserbase later is straightforward. |
| Skill breakage | Skills may break when target sites change their UI. Monitor and re-create as needed. |

---

## 8. Recommendation

**Use Browser-Use Cloud for SERVICE-12.**

**Rationale:**
1. KISS — one tool, one API call, structured results. Minimal integration surface.
2. Skills API is uniquely valuable for Sunder's real estate use case (repeated portal searches).
3. No infra management — no session lifecycle, no Stagehand, no two-LLM wiring.
4. Cost is reasonable (~$4.32/user/month) and reducible via Skills.
5. Profile-based auth solves the login-gated portal problem cleanly.
6. Thin integration makes switching easy if we hit limitations.

**Phase the rollout:**

| Phase | What | Why |
|---|---|---|
| **Phase 1** | `browse_website` tool + profile auth flow (embedded browser in chat) | Core capability: public + authenticated browsing |
| **Phase 2** | Skills for top 3-5 SG property portals | Cost reduction: repeated searches become instant + free |
| **Phase 3** | Re-auth detection, multi-step workflows, form submission with approval | Polish: handle cookie expiry gracefully, complex use cases |

**Before building Phase 1, verify (see Appendix A):**
- [ ] `liveUrl` is interactive (user can click/type), not view-only
- [ ] `liveUrl` works without being logged into Browser-Use (self-authenticating via CDP URL)
- [ ] If either fails: fall back to new-tab flow or agent-driven login with `secrets`

**Model choice:** Start with `browser-use-2.0`. Drop to `browser-use-llm` if cost needs optimization and accuracy is sufficient.

**Plan choice:** Pay As You Go (no subscription). Free tier gives 2 profiles — enough for initial testing. Upgrade to Business ($500/mo) when we need unlimited profiles for multi-platform users.

---

## Appendix A: API Test Results (2026-03-17)

### A.1 Account Status

```json
{
  "name": "Default Project",
  "totalCreditsBalanceUsd": 0.0,
  "planInfo": { "planName": "Unknown Plan Name" },
  "projectId": "fd019cba-66ca-4b96-a9a5-7224956bf61c",
  "rateLimit": 25
}
```

Free tier. $0 balance but tasks still run (small initial allowance). Need to add credits before production use.

### A.2 Task Execution Test

**Task:** "Go to example.com, return the page title and first paragraph"
**Model:** `browser-use-llm`
**Result:** Completed in 4 seconds. 1 step. Cost: $0.002.

```json
{
  "status": "finished",
  "isSuccess": true,
  "cost": "0.002",
  "output": "The page title is 'Example Domain' and the first paragraph text is '...'",
  "steps": [{
    "number": 1,
    "screenshotUrl": "https://cdn.browser-use.com/screenshots/.../1.png",
    "actions": ["{\"done\": {\"text\": \"...\", \"success\": true}}"]
  }]
}
```

**Observations:**
- Very fast (4s including session creation)
- Each step has a `screenshotUrl` — useful for UI and debugging
- Response includes `cost` field — useful for tracking spend
- `isSuccess` is a clean boolean for error handling

### A.3 Session & URL Tests

**Session creation:** Returns `id`, `status`, `liveUrl`, `persistMemory`, `keepAlive`.

**liveUrl format:** `https://live.browser-use.com?wss=https://{sessionId}.cdp5.browser-use.com`
- HTTP headers: `access-control-allow-origin: *`, NO `X-Frame-Options`, NO CSP restrictions
- Embeddable in iframe: YES
- Page title: "Live Preview | Browser Use"
- Architecture: Next.js app connecting via WebSocket to CDP endpoint
- Interactivity: LIKELY YES (bidirectional WebSocket) — **needs manual confirmation**

**publicShareUrl format:** `https://cloud.browser-use.com/share/{shareToken}`
- HTTP headers: `x-frame-options: DENY`, `content-security-policy: frame-ancestors 'none'`
- Embeddable in iframe: NO
- Architecture: Browser-Use Cloud dashboard page (full app shell)
- Purpose: Replay/viewing, NOT interactive live browsing

### A.4 Key Findings

1. **Use `liveUrl` for embedded browser auth flow, NOT `publicShareUrl`.** The liveUrl has no iframe restrictions and connects directly to the browser via WebSocket. The publicShareUrl is a dashboard page that blocks iframes.

2. **The `liveUrl` may self-authenticate via the session-specific CDP URL in the query string.** The WebSocket endpoint (`{sessionId}.cdp5.browser-use.com`) is unique per session — anyone with the URL can likely connect. This means end users don't need Browser-Use credentials.

3. **Task API is fast and clean.** 4-second round trip for a simple task. Structured output, screenshots, cost tracking all built in.

4. **Free tier works but has $0 balance.** Tasks ran despite showing $0 credits. Likely a small initial allowance. Need to add credits or upgrade before real testing.

---

## Appendix B: Manual Verification Steps

**You need to do this before we build the embedded browser UI.**

### Step 1: Create a session

Run this in your terminal:

```bash
curl -s -X POST "https://api.browser-use.com/api/v2/sessions" \
  -H "X-Browser-Use-API-Key: bu_your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"startUrl": "https://www.google.com"}' | python3 -m json.tool
```

Copy the `liveUrl` from the response.

### Step 2: Test interactivity

1. Open the `liveUrl` in Chrome
2. You should see a live browser showing Google
3. Try these actions:
   - **Click** the Google search bar
   - **Type** "hello world"
   - **Press Enter**
   - **Click** a search result
4. If all of these work, the liveUrl is interactive. Record: PASS or FAIL.

### Step 3: Test without Browser-Use auth

1. Open a **private/incognito** browser window (no Browser-Use cookies)
2. Paste the same `liveUrl`
3. Can you still see and interact with the browser?
4. If yes, the URL is self-authenticating (the CDP endpoint in the query string IS the auth). Record: PASS or FAIL.

### Step 4: Test iframe embedding

1. Open your browser console on any page (e.g., `about:blank`)
2. Run:
   ```javascript
   document.body.innerHTML = '<iframe src="YOUR_LIVE_URL_HERE" style="width:100%;height:600px;border:1px solid #ccc;"></iframe>';
   ```
3. Does the browser appear in the iframe? Can you interact with it? Record: PASS or FAIL.

### Step 5: Clean up

```bash
curl -s -X DELETE "https://api.browser-use.com/api/v2/sessions/SESSION_ID_HERE" \
  -H "X-Browser-Use-API-Key: bu_your-api-key-here"
```

### Results Matrix

| Test | Expected | Actual | Notes |
|---|---|---|---|
| liveUrl shows live browser | YES | ? | |
| Can click/type in liveUrl | YES (WebSocket is bidirectional) | ? | |
| Works in incognito (no BU auth) | LIKELY YES (self-auth via CDP URL) | ? | |
| Works in iframe | YES (no X-Frame-Options) | ? | |
| Can interact inside iframe | LIKELY YES | ? | |

**If all pass:** Build the embedded-browser-in-chat auth flow as designed.
**If interactivity fails:** Use new-tab flow instead of iframe. User logs in in a new tab, comes back to Sunder, clicks "Done."
**If auth fails (requires BU login):** Use agent-driven login with `secrets` parameter for simple username/password. For OTP/2FA, use cookie sync script.
