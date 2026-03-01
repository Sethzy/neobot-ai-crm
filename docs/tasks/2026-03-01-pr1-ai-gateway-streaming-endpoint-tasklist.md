# PR 1: Vercel AI Gateway + Basic Streaming Endpoint

**Goal:** Install the AI Gateway SDK and create a streaming chat API endpoint that responds with Gemini Flash via Vercel AI Gateway.

**Architecture:** Single POST endpoint at `/api/chat` that receives messages, calls Vercel AI Gateway with a hardcoded real estate agent system prompt, and streams the response back using `streamText()`. No auth, no DB, no tools — just the thinnest possible AI streaming pipe.

**Tech Stack:** Vercel AI SDK v6 (`ai`), `@ai-sdk/gateway`, Next.js 15 App Router, Vitest

**Decisions:** LLM-01 (AI Gateway as sole gateway), LLM-02 (AI SDK v6 + @ai-sdk/gateway), LLM-05 (Gemini Flash Tier 1), EXEC-01 (interactive mode)

**Source:** `docs/product/plans/2026-03-01-implementation-phasing-plan.json` → Phase 1, PR 1

---

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

---

## Relevant Files

**Create:**
- `src/lib/ai/gateway.ts` — AI Gateway instance + model constant
- `src/lib/ai/system-prompt.ts` — Hardcoded real estate agent system prompt
- `app/api/chat/route.ts` — Streaming POST handler
- `src/lib/ai/__tests__/gateway.test.ts` — Gateway module tests
- `src/lib/ai/__tests__/system-prompt.test.ts` — System prompt tests
- `src/lib/ai/__tests__/chat-route.test.ts` — Route handler integration test

**Modify:**
- `package.json` — via `npm install @ai-sdk/gateway`
- `.env.example` — add `AI_GATEWAY_API_KEY`
- `vitest.config.ts` — add `app/` to test include paths

---

## Pre-flight

Before starting, confirm:

1. You have a Vercel AI Gateway API key. Go to Vercel Dashboard → AI Gateway → API Keys → Create key. Save it in `.env.local` as `AI_GATEWAY_API_KEY=<your-key>`.
2. Verify which Gemini Flash model ID is available in your gateway. Go to Vercel Dashboard → AI Gateway → Models. Look for a `google/gemini-*-flash*` model. The tasklist uses `google/gemini-2.0-flash` — update `TIER_1_MODEL` in Task 2 if your gateway shows a different ID.
3. Run `npm test:run` to confirm existing tests pass before starting.

---

### Task 1: Install @ai-sdk/gateway and update config

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env.example`
- Modify: `vitest.config.ts`

**Step 1: Install the gateway package**

```bash
npm install @ai-sdk/gateway
```

Note: `ai` (Vercel AI SDK v6) is already installed at ^6.0.39. Do NOT reinstall it.

**Step 2: Verify installation**

```bash
node -e "require('@ai-sdk/gateway')" && echo "OK"
```

Expected: `OK` (no errors)

**Step 3: Add AI_GATEWAY_API_KEY to .env.example**

Open `.env.example` and add after the existing AI provider keys section:

```bash
# Vercel AI Gateway (LLM-01: sole gateway for all AI model calls)
AI_GATEWAY_API_KEY=
```

**Step 4: Add app/ to vitest test includes**

The current vitest config only includes `src/`, `tests/`, and `api/` for test discovery. We need `app/` too, since future route tests will live near their routes.

In `vitest.config.ts`, update the `include` array:

```typescript
include: [
  "src/**/*.{test,spec}.{ts,tsx}",
  "tests/**/*.{test,spec}.{ts,tsx}",
  "api/**/*.{test,spec}.{ts,tsx}",
  "app/**/*.{test,spec}.{ts,tsx}",
],
```

**Step 5: Confirm existing tests still pass**

```bash
npm run test:run
```

Expected: All existing tests pass. No regressions.

**Step 6: Commit**

```bash
git add package.json package-lock.json .env.example vitest.config.ts
git commit -m "chore: install @ai-sdk/gateway, add AI_GATEWAY_API_KEY to env, add app/ to vitest includes"
```

---

### Task 2: AI Gateway module (TDD)

**Files:**
- Create: `src/lib/ai/__tests__/gateway.test.ts`
- Create: `src/lib/ai/gateway.ts`

This module exports the gateway instance and the Tier 1 model constant. All LLM calls in the app go through this gateway (LLM-01).

**Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/gateway.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("AI Gateway module", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("exports a gateway function", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { gateway } = await import("@/lib/ai/gateway");
    expect(typeof gateway).toBe("function");
  });

  it("exports TIER_1_MODEL as a non-empty string", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { TIER_1_MODEL } = await import("@/lib/ai/gateway");
    expect(typeof TIER_1_MODEL).toBe("string");
    expect(TIER_1_MODEL.length).toBeGreaterThan(0);
  });

  it("TIER_1_MODEL follows provider/model format", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { TIER_1_MODEL } = await import("@/lib/ai/gateway");
    expect(TIER_1_MODEL).toMatch(/^[a-z]+\/[a-z0-9.-]+$/i);
  });

  it("gateway function returns a model when called with a model ID", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { gateway } = await import("@/lib/ai/gateway");
    const model = gateway("google/gemini-2.0-flash");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("google/gemini-2.0-flash");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/ai/__tests__/gateway.test.ts
```

Expected: FAIL — module `@/lib/ai/gateway` does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/ai/gateway.ts`:

```typescript
/**
 * Vercel AI Gateway singleton.
 *
 * All LLM calls route through this gateway (LLM-01).
 * Uses AI_GATEWAY_API_KEY env var by default.
 *
 * @see https://vercel.com/docs/ai-gateway
 */
import { createGateway } from "@ai-sdk/gateway";

/**
 * Tier 1 model — used for simple chat, greetings, single lookups.
 * ~60-70% of interactive messages route here (LLM-05).
 *
 * Verify this model ID is available in your Vercel AI Gateway dashboard.
 */
export const TIER_1_MODEL = "google/gemini-2.0-flash";

/**
 * Gateway instance. Call as `gateway("provider/model")` to get a model
 * object compatible with AI SDK's `streamText()` / `generateText()`.
 */
export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/ai/__tests__/gateway.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/gateway.ts src/lib/ai/__tests__/gateway.test.ts
git commit -m "feat: add AI Gateway module with Tier 1 model constant"
```

---

### Task 3: System prompt module (TDD)

**Files:**
- Create: `src/lib/ai/__tests__/system-prompt.test.ts`
- Create: `src/lib/ai/system-prompt.ts`

Hardcoded placeholder prompt for the real estate agent persona. Will be replaced by full 7-layer context assembly in PR 15 (Phase 2).

**Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/system-prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

describe("System prompt", () => {
  it("exports a non-empty string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("identifies as a real estate assistant", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("real estate");
  });

  it("mentions Singapore context", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("singapore");
  });

  it("sets practical tone expectations", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("concise");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — module `@/lib/ai/system-prompt` does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/ai/system-prompt.ts`:

```typescript
/**
 * Hardcoded system prompt for the Sunder real estate agent.
 *
 * This is a placeholder — the full 7-layer context assembly
 * (RUNNER-03) replaces this in PR 15 (Phase 2).
 */
export const SYSTEM_PROMPT = `You are Sunder, an AI assistant for solo real estate agents in Singapore.

You help with:
- CRM management (contacts, deals, follow-ups)
- Daily briefings and activity summaries
- Drafting communications
- Research and information gathering
- Task tracking and reminders

Be concise, practical, and action-oriented. Give specific, useful answers.
When you don't know something, say so directly.

You are currently in early setup — more capabilities (CRM tools, memory, automations) will be added soon. For now, you can have helpful conversations about real estate work.`;
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat: add hardcoded system prompt for real estate agent persona"
```

---

### Task 4: Chat API route handler (TDD)

**Files:**
- Create: `src/lib/ai/__tests__/chat-route.test.ts`
- Create: `app/api/chat/route.ts`

This is the core deliverable — a POST endpoint that streams AI responses. Uses `streamText()` with the gateway and system prompt from Tasks 2-3.

**Context for the developer:** We mock `streamText` in tests because it calls an external API. This is a system boundary — mocking is appropriate here. Everything else (gateway module, system prompt, request parsing) uses real code.

**Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/chat-route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock streamText and convertToModelMessages — external AI SDK boundary
const mockToUIMessageStreamResponse = vi.fn(
  () => new Response("streamed", { headers: { "Content-Type": "text/event-stream" } })
);

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toUIMessageStreamResponse: mockToUIMessageStreamResponse,
  })),
  convertToModelMessages: vi.fn((msgs: unknown[]) => msgs),
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: vi.fn(() => "mock-model"),
  TIER_1_MODEL: "google/gemini-2.0-flash",
}));

import { POST } from "../../../../app/api/chat/route";
import { streamText, convertToModelMessages } from "ai";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

function chatRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToUIMessageStreamResponse.mockReturnValue(
      new Response("streamed", { headers: { "Content-Type": "text/event-stream" } })
    );
  });

  it("calls streamText with the system prompt and converted messages", async () => {
    const messages = [
      { role: "user", content: "Hello", id: "1" },
    ];

    await POST(chatRequest({ messages }));

    expect(convertToModelMessages).toHaveBeenCalledWith(messages);
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: SYSTEM_PROMPT,
        messages: expect.any(Array),
        model: "mock-model",
      })
    );
  });

  it("returns the stream response from streamText", async () => {
    const messages = [{ role: "user", content: "Hi", id: "1" }];
    const response = await POST(chatRequest({ messages }));

    expect(response).toBeInstanceOf(Response);
    expect(mockToUIMessageStreamResponse).toHaveBeenCalled();
  });

  it("passes the gateway model to streamText", async () => {
    const { gateway } = await import("@/lib/ai/gateway");
    const messages = [{ role: "user", content: "Test", id: "1" }];

    await POST(chatRequest({ messages }));

    expect(gateway).toHaveBeenCalled();
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
      })
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: FAIL — `app/api/chat/route.ts` does not exist (import fails).

**Step 3: Write minimal implementation**

Create `app/api/chat/route.ts`:

```typescript
/**
 * POST /api/chat — Streaming AI chat endpoint.
 *
 * Receives messages, calls Vercel AI Gateway with Gemini Flash,
 * streams the response back. No auth, no DB, no tools in PR 1.
 *
 * @see LLM-01 (AI Gateway), LLM-02 (AI SDK v6), LLM-05 (Gemini Flash)
 */
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

/** Allow streaming responses up to 30 seconds on Vercel. */
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: gateway(TIER_1_MODEL),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: All 3 tests PASS.

**Step 5: Run ALL tests to confirm no regressions**

```bash
npm run test:run
```

Expected: All tests pass (existing + new).

**Step 6: Commit**

```bash
git add app/api/chat/route.ts src/lib/ai/__tests__/chat-route.test.ts
git commit -m "feat: add streaming chat endpoint via Vercel AI Gateway (PR 1)"
```

---

### Task 5: Manual smoke test

**Files:** None (verification only)

This confirms the endpoint works end-to-end with a real API call.

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Smoke test with curl**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What are the top 3 things a real estate agent in Singapore should do each morning?","id":"test-1"}]}' \
  --no-buffer
```

Expected: You should see a streaming response (text arriving in chunks) with practical real estate advice. The response should reflect the system prompt's tone — concise, practical, action-oriented.

**Step 3: Test error case — empty messages**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[]}' \
  --no-buffer
```

Expected: Either an empty/minimal response or an error. Note the behavior — PR 4 (runner engine) will add proper input validation.

**Step 4: Verify existing routes still work**

```bash
curl http://localhost:3000/api/agents?limit=2
```

Expected: JSON response with agent data (existing property pipeline untouched).

**Step 5: Stop dev server and final commit**

```bash
git add -A
git status
```

If there are any uncommitted changes (e.g., lockfile updates), commit them:

```bash
git commit -m "chore: PR 1 complete — AI Gateway streaming endpoint"
```

---

## PR 1 Complete Checklist

- [ ] `@ai-sdk/gateway` installed
- [ ] `AI_GATEWAY_API_KEY` in `.env.example` and `.env.local`
- [ ] `vitest.config.ts` includes `app/` test paths
- [ ] `src/lib/ai/gateway.ts` — exports `gateway` + `TIER_1_MODEL`
- [ ] `src/lib/ai/system-prompt.ts` — exports `SYSTEM_PROMPT`
- [ ] `app/api/chat/route.ts` — POST handler with `streamText()`
- [ ] 11 new tests, all passing
- [ ] Existing tests still pass
- [ ] Smoke test: curl returns streaming AI response
- [ ] Existing `/api/agents` route still works
- [ ] 4 clean commits

## What PR 1 does NOT include (deferred)

- **Auth on the endpoint** — PR 3 adds this when wiring to DB
- **Message persistence** — PR 3 adds conversation_messages table
- **Thread management** — PR 3 adds conversation_threads
- **Tools** — PR 6-8 adds CRM, file, and web search tools
- **Runner engine** — PR 4 extracts `runAgent()` orchestration loop
- **Model routing** — PR 16 adds `routeQuestion()` classifier
- **Error handling/validation** — PR 4 adds proper input validation in the runner

## Next PR

PR 2: Chat UI with streaming — replaces the `/chat` placeholder page with a real chat interface using `useChat()` hook pointed at this endpoint.
