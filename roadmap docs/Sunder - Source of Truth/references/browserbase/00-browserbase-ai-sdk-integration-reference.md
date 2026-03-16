# Browserbase AI SDK Integration Reference

> **Purpose:** Zero-drift integration analysis for adding `@browserbasehq/ai-sdk` browser automation tools to the Sunder runner.
>
> **Decision:** SERVICE-12 (currently deferred to V3). This reference doc pre-positions the integration so it can be executed in a single PR when SERVICE-12 is un-deferred.
>
> **Canonical repos:**
> - `@browserbasehq/ai-sdk` v0.1.0 — [npm](https://www.npmjs.com/package/@browserbasehq/ai-sdk) / [github.com/browserbase/ai-sdk](https://github.com/browserbase/ai-sdk)
> - `browserbase/quickstart-nextjs` — [github.com/browserbase/quickstart-nextjs](https://github.com/browserbase/quickstart-nextjs)
> - AI SDK Tools Registry — [ai-sdk.dev/tools-registry/browserbase](https://ai-sdk.dev/tools-registry/browserbase)
> - Browserbase docs — [docs.browserbase.com/integrations/vercel](https://docs.browserbase.com/integrations/vercel/quickstart)

---

## Table of Contents

1. [Package Overview](#1-package-overview)
2. [Architecture & Patterns](#2-architecture--patterns)
3. [The 9 Tools — Complete Reference](#3-the-9-tools--complete-reference)
4. [Session Manager Internals](#4-session-manager-internals)
5. [Conversation Flow (ASCII)](#5-conversation-flow-ascii)
6. [Files to Copy & Reference](#6-files-to-copy--reference)
7. [Sunder Integration Plan — File-by-File](#7-sunder-integration-plan--file-by-file)
8. [Drift Analysis](#8-drift-analysis)
9. [Environment Variables](#9-environment-variables)
10. [Pricing & Unit Economics](#10-pricing--unit-economics)
11. [Reference Repos & Docs](#11-reference-repos--docs)

---

## 1. Package Overview

```
Package:  @browserbasehq/ai-sdk v0.1.0
Published: 2026-03-06 (1 week old)
License:  MIT
Size:     39 kB (unpacked)
Deps:     @browserbasehq/stagehand (>=3.1.0), zod (>=4.2.1)
Peer:     ai (^5.0.0 || ^6.0.0)
Build:    tsup → ESM + CJS + .d.ts
```

**What it does:** Wraps Browserbase's Stagehand browser automation into 9 AI SDK `tool()` objects that can be passed directly to `generateText()` / `streamText()`. The LLM decides when to browse, what to click, and what to extract — the tools handle all browser lifecycle.

**Why this package:** Before this existed, integrating Browserbase required manually wrapping Stagehand's `act`/`observe`/`extract` into AI SDK tool definitions (see BrowseGPT, Mastra, Agentkit examples). This package eliminates that custom work entirely.

---

## 2. Architecture & Patterns

### 2.1 Factory Pattern

```
createBrowserbaseTools(options?)
  │
  ├── resolveToolNames(options.names)        // merge defaults with overrides
  ├── new StagehandSessionManager(options)    // singleton session lifecycle
  └── create 9 tool factories, each receiving the manager
        ├── createSessionStartTool(manager)
        ├── createSessionCloseTool(manager)
        ├── createNavigateTool(manager)
        ├── createGetUrlTool(manager)
        ├── createScreenshotTool(manager)
        ├── createActTool(manager)
        ├── createExtractTool(manager)
        ├── createObserveTool(manager)
        └── createAgentExecuteTool(manager)
```

Returns:

```ts
interface BrowserbaseToolset {
  tools: Record<string, Tool>;                        // all 9 tools, keyed by name
  startSession(): Promise<{ sessionId?, debugUrl? }>; // manual start
  closeSession(): Promise<void>;                      // manual cleanup
  getSessionInfo(): SessionInfo | null;               // current session
}
```

### 2.2 Source File Structure (inferred from bundle)

```
src/
├── index.ts                          // re-exports
├── types.ts                          // DEFAULT_TOOL_NAMES, type defs
├── errors.ts                         // BrowserbaseToolError, wrapToolError
├── session/
│   └── session-manager.ts            // StagehandSessionManager class
├── tools/
│   ├── session-start.ts
│   ├── session-close.ts
│   ├── navigate.ts
│   ├── get-url.ts
│   ├── screenshot.ts
│   ├── act.ts
│   ├── extract.ts
│   ├── observe.ts
│   └── agent-execute.ts
└── create-browserbase-tools.ts       // main factory
```

### 2.3 Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Session management | Promise-chain lock, no mutex library | Zero deps, sufficient for single-process serialization |
| Default env | Always `"BROWSERBASE"` | Package is purpose-built for Browserbase cloud |
| Tool naming | Configurable via `names` option | Collision avoidance with other toolsets |
| Act input | 3 modes (natural language, alias, deterministic) | Supports NL + direct selector paths |
| Extract schema | JSON Schema → Zod via Stagehand's `jsonSchemaToZod` | LLMs emit JSON Schema, not Zod |
| Error handling | Wrap-and-rethrow with `cause` chain | Preserves original error + adds context |
| Cleanup | Process signal handlers (opt-out via `closeOnExit`) | Prevents orphaned cloud browsers |
| No retry loops | Intentional | Relies on Stagehand's built-in self-heal |

### 2.4 Two-LLM Architecture

```
YOUR RUNNER (LLM #1)                    STAGEHAND (LLM #2)
━━━━━━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━━
Decides WHAT to do                       Decides HOW to do it
"navigate to 99.co"                      (runs page.goto)
"search for condos"           ────►      sees page screenshot,
                                         finds search bar,
                                         types query, clicks
"extract listings"            ────►      reads DOM, returns
                                         structured JSON
```

LLM #1 (Sunder's Gemini Flash) never sees the webpage — it only sees tool results (text/JSON). LLM #2 (Stagehand's vision model, configurable) does the page interpretation.

---

## 3. The 9 Tools — Complete Reference

### 3.1 `browserbase_stagehand_session_start`

| Field | Value |
|---|---|
| **Description** | "Start or initialize a Browserbase Stagehand session." |
| **Input** | `z.object({})` — no params |
| **Returns** | `{ started: true, sessionId?: string, debugUrl?: string }` |
| **Behavior** | Shared: creates or returns existing. Per-call: creates throwaway, reads info, closes. |

### 3.2 `browserbase_stagehand_session_close`

| Field | Value |
|---|---|
| **Description** | "Close the active Browserbase Stagehand session." |
| **Input** | `z.object({})` — no params |
| **Returns** | `{ closed: true }` |
| **Behavior** | Nullifies sharedStagehand + lastSessionInfo, calls stagehand.close() |

### 3.3 `browserbase_stagehand_navigate`

| Field | Value |
|---|---|
| **Description** | "Navigate the active browser page to a URL." |
| **Input** | `{ url: z.url(), waitUntil?: "load"\|"domcontentloaded"\|"networkidle", timeoutMs?: number }` |
| **Returns** | `{ navigated: true, url, title?, status?, ok? }` |
| **Behavior** | `page.goto(url)` on active page, reads back actual URL/title/status |

### 3.4 `browserbase_stagehand_get_url`

| Field | Value |
|---|---|
| **Description** | "Get the current URL for the active browser page." |
| **Input** | `z.object({})` — no params |
| **Returns** | `{ url: string, title?: string }` |

### 3.5 `browserbase_screenshot`

| Field | Value |
|---|---|
| **Description** | "Capture a screenshot of the active browser page." |
| **Input** | `{ fullPage?: boolean, type?: "png"\|"jpeg", quality?: 1-100 }` |
| **Returns** | `{ mimeType: string, base64: string }` |

### 3.6 `browserbase_stagehand_act`

| Field | Value |
|---|---|
| **Description** | "Perform a single action on the active page." |
| **Input** | Exactly one of: `action` (NL string), `instruction` (alias), or `deterministicAction` (`{ selector, description, method, arguments? }`) + optional `timeoutMs`, `variables` |
| **Returns** | Stagehand's act() result |
| **Note** | `.refine()` enforces exactly-one-of constraint |

### 3.7 `browserbase_stagehand_extract`

| Field | Value |
|---|---|
| **Description** | "Extract data from the active page using a natural-language instruction." |
| **Input** | `{ instruction: string, schema?: JSONSchema, timeoutMs?: number, selector?: string }` |
| **Returns** | Structured data matching schema, or free-form |
| **Note** | JSON Schema converted to Zod via Stagehand's `jsonSchemaToZod()` |

### 3.8 `browserbase_stagehand_observe`

| Field | Value |
|---|---|
| **Description** | "Observe the active page and return suggested browser actions." |
| **Input** | `{ instruction?: string, timeoutMs?: number, selector?: string }` |
| **Returns** | Array of suggested actions (selectors/methods) — can feed into `act`'s `deterministicAction` |

### 3.9 `browserbase_stagehand_agent_execute`

| Field | Value |
|---|---|
| **Description** | "Execute a Stagehand agent run against the active session." |
| **Input** | `{ instruction: string, maxSteps?: number, highlightCursor?: boolean }` |
| **Returns** | Agent execution result |
| **Note** | Runs a full autonomous browsing agent within Stagehand — most powerful but least predictable |

---

## 4. Session Manager Internals

### 4.1 Strategies

| Strategy | Behavior | Use case |
|---|---|---|
| `shared` (default) | One Stagehand instance created lazily on first tool call, reused for all subsequent calls within the run. `closeSession()` destroys it. | Multi-step browsing within one agent run |
| `per-call` | Fresh Stagehand per tool invocation, immediately closed after. | Stateless, isolated operations |

**For Sunder:** `shared` is correct. Our runner executes one run per thread — the browser session should live for the duration of that run, then close.

### 4.2 Promise-Chain Lock

```ts
async withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = this.lock.then(task, task);   // chain after current lock
  this.lock = run.then(noop, noop);         // update lock, swallow errors
  return run;                               // return actual result
}
```

Serializes all session operations — no two tool calls can interact with the same Stagehand instance concurrently. The `task, task` double-arg ensures tasks run even if previous ones rejected (prevents deadlocks).

### 4.3 Process Cleanup

Registers `once` handlers on `beforeExit`, `SIGINT`, `SIGTERM` to auto-close shared sessions. Prevents orphaned cloud browsers (which would continue billing).

### 4.4 Safe Close

`safeClose(stagehand)` wraps `stagehand.close()` in try-catch that silently swallows errors — defensive for already-closed or crashed sessions.

---

## 5. Conversation Flow (ASCII)

```
┌──────────────────────────────────────────────────────────────────┐
│  SUNDER RUNNER (run-agent.ts → streamText with maxSteps)        │
└──────────┬───────────────────────────────────────────────────────┘
           │
           │  Step 1: User says "check 99.co for 3-bed condos"
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  LLM #1: Gemini Flash (Sunder orchestrator)                     │
│  Sees 9 browser tools + CRM tools + memory tools                │
│  Decides: "I need to browse 99.co"                              │
│  Tool call: browserbase_stagehand_navigate({ url: "99.co" })    │
└──────────┬───────────────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  SESSION MANAGER (shared — one browser for the run)             │
│  First call? → new Stagehand({ env: "BROWSERBASE" })            │
│             → stagehand.init() → cloud browser spins up         │
│  Subsequent? → reuses same instance (promise-chain locked)      │
└──────────┬───────────────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  BROWSERBASE CLOUD                                              │
│  ┌────────────────────────────────────┐                         │
│  │  Headless Chrome                   │                         │
│  │  (stealth + CAPTCHA + anti-bot)    │                         │
│  │  page.goto("https://99.co")        │                         │
│  │  → { url, title, status }          │                         │
│  └────────────────────────────────────┘                         │
└──────────┬───────────────────────────────────────────────────────┘
           │  Tool result: { navigated: true, url, title, status: 200 }
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  LLM #1 (step 2): sees navigate result                          │
│  Tool call: browserbase_stagehand_act({                         │
│    action: "Search for 3-bedroom condos in Tanjong Pagar"       │
│  })                                                              │
└──────────┬───────────────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  STAGEHAND (inside Browserbase cloud)                           │
│  ┌────────────────────────────────────────┐                     │
│  │  LLM #2: vision model (Gemini/GPT-4o) │                     │
│  │  Sees screenshot of 99.co              │                     │
│  │  Resolves: click search bar → type     │                     │
│  │  "3-bed condo Tanjong Pagar" → click   │                     │
│  │  Translates to Playwright selectors    │                     │
│  └────────────────────────────────────────┘                     │
│  Executes Playwright actions on cloud browser                   │
│  Returns: { success: true, action: "searched..." }              │
└──────────┬───────────────────────────────────────────────────────┘
           │  Tool result back to LLM #1
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  LLM #1 (step 3): sees act result                               │
│  Tool call: browserbase_stagehand_extract({                     │
│    instruction: "Extract listing names, prices, sizes",         │
│    schema: { type: "object", properties: { listings: ... } }   │
│  })                                                              │
└──────────┬───────────────────────────────────────────────────────┘
           │  Stagehand LLM #2 reads DOM → returns structured JSON
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  LLM #1 (step 4): has extracted data                            │
│  Can use CRM tools (crm_create_deal) or respond to user.       │
│  Final text: "Found 12 listings on 99.co..."                    │
└──────────────────────────────────────────────────────────────────┘
           │
           │  browserbase.closeSession() — cloud browser destroyed
           ▼
         [done]
```

---

## 6. Files to Copy & Reference

### 6.1 From `@browserbasehq/ai-sdk` (the npm package — copy nothing, consume as dependency)

**We do NOT copy this code.** We `pnpm add @browserbasehq/ai-sdk` and import `createBrowserbaseTools`. The package is 39 kB, MIT licensed, and maintained by Browserbase. Zero reason to vendor it.

**Files to understand (from the published bundle at `/tmp/bb-sdk-inspect/package/dist/`):**

| File | What to study |
|---|---|
| `dist/index.js` (483 lines) | Full implementation — all 9 tools + session manager + factory |
| `dist/index.d.ts` (43 lines) | TypeScript API surface |
| `README.md` (112 lines) | Configuration options, session strategies, tool names |

### 6.2 From `browserbase/quickstart-nextjs` (reference only — do not copy)

This is a **basic proof-of-concept** using Playwright CDP directly + Readability. It does NOT use the `@browserbasehq/ai-sdk` package. It's useful only as background context for how Browserbase sessions work at the raw level.

| File | Learning |
|---|---|
| `app/api/chat/route.ts` | Session creation via REST API, CDP WebSocket connection pattern |

**Why not copy:** It uses AI SDK v3, Next.js 14, React 18, no tool-calling, no streaming. Our stack is AI SDK v6, Next.js 15, React 19. The `@browserbasehq/ai-sdk` package is the correct integration path.

### 6.3 From Browserbase Docs — BrowseGPT (reference pattern)

BrowseGPT (`docs.browserbase.com/integrations/vercel/browsegpt`) shows a **chat-based browsing agent** with AI SDK tool-calling. Key patterns:

| Pattern | Detail |
|---|---|
| `maxDuration = 300` | Vercel function timeout for long browser sessions |
| `maxSteps: 5` | Agent loop step limit |
| Dual-model strategy | Tool-calling model (GPT-4 Turbo) + content evaluation model (Claude) |
| `keepAlive: true` | Session persistence across multiple tool calls |
| Vercel Fluid Compute | Recommended for browser automation (eliminates cold starts) |

**Key learning:** Vercel function timeout is a real constraint. Browser sessions can easily exceed the default 15s. Need `maxDuration` on the route or Fluid Compute.

### 6.4 From Browserbase Docs — Puppeteer (reference only)

Shows `puppeteer-core` + `@browserbasehq/sdk` pattern. Not relevant to our integration (we use the AI SDK tool wrapper, not raw Puppeteer).

---

## 7. Sunder Integration Plan — File-by-File

### 7.0 Install

```bash
pnpm add @browserbasehq/ai-sdk
```

This pulls in `@browserbasehq/stagehand` (>=3.1.0) and `zod` (>=4.2.1, already in our deps).

### 7.1 `src/lib/runner/tools/browser/index.ts` — NEW

Create a new tool category following the existing barrel pattern (`web/index.ts`, `crm/index.ts`).

```ts
/**
 * Browser automation tool factory for the runner.
 * Wraps @browserbasehq/ai-sdk for zero-drift integration.
 * @module lib/runner/tools/browser
 */
import { createBrowserbaseTools } from "@browserbasehq/ai-sdk";
import type { BrowserbaseToolset } from "@browserbasehq/ai-sdk";

/**
 * Creates browser automation tools powered by Browserbase + Stagehand.
 * Returns the toolset so the caller can manage session lifecycle.
 *
 * @returns The full BrowserbaseToolset (tools + session management)
 */
export function createBrowserTools(): BrowserbaseToolset {
  return createBrowserbaseTools({
    stagehand: {
      model: "google/gemini-3-flash-preview",
    },
    session: {
      strategy: "shared",
      closeOnExit: true,
    },
  });
}
```

**Pattern match:** Identical to `createWebTools()` — factory function returning a tools object. The only difference is we also return session lifecycle methods for cleanup.

### 7.2 `src/lib/runner/tools/index.ts` — EDIT

Add `createBrowserTools` to barrel exports.

```ts
// Add to existing exports:
export { createBrowserTools } from "./browser";
```

### 7.3 `src/lib/runner/tool-registry.ts` — EDIT

Add browser tools to the registry. Conditional on env var being present (graceful degradation).

```ts
import { createBrowserTools } from "@/lib/runner/tools";

// Inside createRunnerTools():
const browserToolset = process.env.BROWSERBASE_API_KEY
  ? createBrowserTools()
  : null;

const browserTools = browserToolset?.tools ?? {};

return {
  ...crmTools,
  ...storageTools,
  ...webTools,
  ...utilityTools,
  ...triggerTools,
  ...connectionTools,
  ...browserTools,       // ← 9 browser tools added when configured
};
```

**Note:** `browserToolset` needs to be returned or stored for `closeSession()` cleanup. See 7.4.

### 7.4 `src/lib/runner/run-agent.ts` — EDIT

Need to call `browserToolset.closeSession()` after the run completes (in the `finally` block). This prevents orphaned cloud browser sessions.

```ts
// After streamText completes (in finally block):
if (browserToolset) {
  await browserToolset.closeSession();
}
```

**Alternative:** The package registers process exit handlers by default (`closeOnExit: true`), so sessions will be cleaned up on process exit. But explicit cleanup is better for serverless (Vercel Functions may reuse the process).

### 7.5 `src/lib/runner/tools/connections/create-connection.ts` — EDIT

Update the `computer_use` stub to reference the new browser tools instead of returning "not yet available":

```ts
if (connection.type === "computer_use") {
  return {
    success: true,
    entity: {
      message: "Browser automation is available via the browserbase tools. Use browserbase_stagehand_navigate, browserbase_stagehand_act, browserbase_stagehand_extract, and browserbase_stagehand_observe to interact with websites.",
    },
  };
}
```

### 7.6 `.env.example` — EDIT

Add the new environment variables:

```bash
# Browserbase (browser automation — SERVICE-12)
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
```

### 7.7 `src/lib/ai/system-prompt.ts` — EDIT

Add browser tool instructions to the system prompt so the agent knows when/how to use them. Follow the existing tool instruction pattern.

```
## Browser Automation

You have access to browser automation tools for interacting with websites:

- **browserbase_stagehand_navigate**: Open a URL in the browser
- **browserbase_stagehand_act**: Perform actions (click, type, scroll) using natural language
- **browserbase_stagehand_extract**: Extract structured data from a page
- **browserbase_stagehand_observe**: Inspect the page before acting
- **browserbase_stagehand_agent_execute**: Run a multi-step browsing task autonomously

**When to use:** Property portal lookups, MLS searches, filling web forms, extracting listing data from sites that require interaction.

**Session lifecycle:** Start with navigate, then act/extract/observe as needed. The browser session persists across tool calls within this conversation turn.
```

### 7.8 Tests

| File | What to test |
|---|---|
| `src/lib/runner/tools/browser/__tests__/index.test.ts` | Factory returns toolset with `.tools` and `.closeSession()`. Env var guard works (returns empty when no API key). |
| `src/lib/runner/__tests__/tool-registry.test.ts` | Existing test — verify browser tools are included/excluded based on env var. |

---

## 8. Drift Analysis

### 8.0 Drift Summary

| Area | Drift? | Reason |
|---|---|---|
| Package consumption | **NONE** | `pnpm add @browserbasehq/ai-sdk`, import `createBrowserbaseTools` |
| Tool schemas | **NONE** | All 9 tools used exactly as shipped |
| Session strategy | **NONE** | `shared` (default) matches our one-run-per-thread model |
| Tool names | **NONE** | Default names are fine, no conflicts with existing tools |
| Error handling | **NONE** | Package wraps errors with `BrowserbaseToolError` + cause chain |
| Stagehand model | **MINIMAL** | We configure `google/gemini-3-flash-preview` to match our Tier 1 model |

### 8.1 Zero-Drift Areas (copy exactly)

1. **All 9 tool definitions** — used as-is from the package. No wrapping, no modification.
2. **Session manager** — `shared` strategy with `closeOnExit: true` is exactly what we need.
3. **Tool naming** — default names (`browserbase_stagehand_*`) don't conflict with any existing Sunder tools.
4. **Error handling** — the package's `BrowserbaseToolError` with cause chain is production-quality.

### 8.2 Minimal Drift (documented reasons)

#### 8.2.1 Stagehand Model Configuration

**Reference:** Package defaults to whatever model Stagehand defaults to (requires `OPENAI_API_KEY` for GPT-4o).

**Our drift:** We pass `model: "google/gemini-3-flash-preview"` to use Gemini (consistent with our Tier 1 model choice, `LLM-01`). This avoids requiring an OpenAI API key.

**Justification:** Architecture decision `LLM-01` — single gateway, Gemini Flash as Tier 1. Stagehand supports Gemini models natively.

#### 8.2.2 Session Cleanup in Serverless

**Reference:** Package relies on process exit handlers (`beforeExit`, `SIGINT`, `SIGTERM`) for cleanup.

**Our drift:** We add explicit `closeSession()` in the runner's `finally` block.

**Justification:** Vercel Functions may reuse processes across invocations. Process exit handlers don't fire between invocations in the same process. Explicit cleanup prevents session leaks and billing surprises.

#### 8.2.3 Conditional Loading (env var guard)

**Reference:** Package assumes `BROWSERBASE_API_KEY` is always present.

**Our drift:** We gate tool registration on `process.env.BROWSERBASE_API_KEY` being truthy.

**Justification:** Not all Sunder deployments will have Browserbase configured. The runner should work without it (graceful degradation). This follows our existing pattern for optional services (e.g., Composio tools loaded only when connections exist).

#### 8.2.4 maxSteps Impact

**Reference:** BrowseGPT example uses `maxSteps: 5` for the chat, with `maxDuration: 300` on the route.

**Our current:** `MAX_STEPS_TIER_1 = 9` in `run-agent.ts`.

**Consideration:** Browser automation typically needs 3-5 steps (navigate → act → extract). With 9 max steps and other tools competing for steps, this should be sufficient. No change needed initially. If browser tasks consistently hit the step limit, increase `MAX_STEPS_TIER_1` to 12-15 when SERVICE-12 ships.

#### 8.2.5 Vercel Function Timeout

**Reference:** BrowseGPT uses `export const maxDuration = 300` (5 minutes) and recommends Vercel Fluid Compute.

**Our consideration:** Browser automation is slow (5-30s per step). Our chat route may need `maxDuration` increased. This is a deployment config change, not a code drift.

### 8.3 No-Drift Checklist

Before shipping, verify these match the reference exactly:

- [ ] `createBrowserbaseTools()` called with no custom `names` override
- [ ] `session.strategy` is `"shared"` (default)
- [ ] `session.closeOnExit` is `true` (default)
- [ ] All 9 tools are passed to `streamText()` without modification
- [ ] No custom retry/timeout wrappers around tool execution
- [ ] No re-implementation of any tool logic from the package

---

## 9. Environment Variables

| Variable | Required | Description | Where to get |
|---|---|---|---|
| `BROWSERBASE_API_KEY` | Yes | Authenticates with Browserbase REST API + CDP | [browserbase.com/settings](https://www.browserbase.com/settings) |
| `BROWSERBASE_PROJECT_ID` | Yes | Identifies the Browserbase project | [browserbase.com/settings](https://www.browserbase.com/settings) |
| `GEMINI_API_KEY` | Already exists | Used by Stagehand for act/extract/observe vision model | Already configured |

**Note:** Because we configure Stagehand to use `google/gemini-3-flash-preview`, the existing `GEMINI_API_KEY` env var is reused. No OpenAI key needed.

---

## 10. Pricing & Unit Economics

From `roadmap docs/Sunder - Source of Truth/services/02-Unit Economics Model ($20 Target vs Actual).md`:

| Item | Value |
|---|---|
| **Plan** | Browserbase Developer — $20/month fixed |
| **Included** | 100 browser hours/month + 1 GB proxy data |
| **Overage** | $0.12/hour browser time; $12/GB proxy data |
| **Usage estimate** | 2-15 browser hours per active user/month |
| **Cost at 50 users** | ~$74/month (10.9% of total cost) |

**Real estate agent use cases:**
- MLS portal automation (login-gated listing sites)
- Property portal searches (99.co, PropertyGuru, etc.)
- Multi-step form navigation (government portals, agent portals)

---

## 11. Reference Repos & Docs

### Primary (use these)

| Resource | URL | Why |
|---|---|---|
| `@browserbasehq/ai-sdk` npm | [npmjs.com/package/@browserbasehq/ai-sdk](https://www.npmjs.com/package/@browserbasehq/ai-sdk) | The package we install |
| AI SDK Tools Registry entry | [ai-sdk.dev/tools-registry/browserbase](https://ai-sdk.dev/tools-registry/browserbase) | Official integration page |
| Browserbase docs (Vercel) | [docs.browserbase.com/integrations/vercel/quickstart](https://docs.browserbase.com/integrations/vercel/quickstart) | Setup guide |
| BrowseGPT demo | [docs.browserbase.com/integrations/vercel/browsegpt](https://docs.browserbase.com/integrations/vercel/browsegpt) | Chat-based agent pattern |
| Stagehand docs | [docs.stagehand.dev](https://docs.stagehand.dev) | Underlying automation framework |

### Secondary (background context)

| Resource | URL | Why |
|---|---|---|
| `browserbase/quickstart-nextjs` | [github.com/browserbase/quickstart-nextjs](https://github.com/browserbase/quickstart-nextjs) | Raw Playwright+CDP pattern (we don't use this) |
| BrowseGPT repo | [github.com/browserbase/BrowseGPT](https://github.com/browserbase/BrowseGPT) | Full chat agent example |
| Puppeteer guide | [docs.browserbase.com/integrations/vercel/puppeteer](https://docs.browserbase.com/integrations/vercel/puppeteer) | Alternative connection method (we don't use this) |
| Stagehand repo | [github.com/browserbase/stagehand](https://github.com/browserbase/stagehand) | AI browser automation framework |

### Architecture Decisions

| ID | Decision | Status |
|---|---|---|
| `SERVICE-12` | Interactive browser: Stagehand + Browserbase | Approved, deferred to V3 |
| `LLM-01` | Single gateway for all models (Vercel AI Gateway) | Active |
| `LLM-02` | All LLM calls via Vercel AI SDK | Active |
| `FOUND-02` | Vercel Functions + Vercel Sandbox | Active |
