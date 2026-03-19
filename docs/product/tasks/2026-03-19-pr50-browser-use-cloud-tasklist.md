# Browser-Use Cloud — Public Browsing Implementation Plan

**PR:** PR 50: Browser automation — public browsing via Browser-Use Cloud
**Decisions:** SERVICE-12
**Goal:** Give the agent a `browse_website` tool that hands a natural language goal to Browser-Use Cloud, which does all browsing on their infra and returns structured results. Public sites only — no auth/profiles in this PR.

**Architecture:** Browser-Use Cloud "hand over a prompt" model — the agent makes one tool call, Browser-Use spins up a browser, navigates/clicks/extracts on their servers, and returns structured data. Our Vercel Function just waits for an HTTP response. Chat-only — excluded from autopilot and subagent contexts (they can't resolve interactive browsing prompts). Design doc: `roadmap docs/Sunder - Source of Truth/references/browser-use/00-browser-use-cloud-design-doc.md`.

**Tech Stack:** `browser-use-sdk` (TypeScript SDK), Browser-Use Cloud API v2, Vitest

**Review fixes applied:** Scrubbed leaked API key. Chat-only registry scope. Strict error handling (throw on API errors). Clarify only when ambiguous (not mandatory preflight). No auth/profiles/embedded browser — deferred to PR 50b.

---

## Relevant Files

**Create:**
- `src/lib/browser-use/client.ts` — shared BrowserUseClient singleton
- `src/lib/runner/tools/browser/browse-website.ts` — browse_website tool
- `src/lib/runner/tools/browser/index.ts` — browser tools barrel
- `src/lib/runner/tools/browser/__tests__/browse-website.test.ts` — tool tests

**Modify:**
- `src/lib/runner/tools/index.ts:11` — add browser tools export
- `src/lib/runner/tool-registry.ts:14,49,72` — register browser tools (env var gated, chat-only)
- `src/lib/ai/system-prompt.ts:92` — add browser tool guidance after `</tool-usage>`
- `app/api/chat/route.ts:31` — bump maxDuration 60 → 120
- `.env.example:46` — add BROWSER_USE_API_KEY

**Reference:**
- `roadmap docs/Sunder - Source of Truth/references/browser-use/00-browser-use-cloud-design-doc.md`
- `src/lib/runner/tools/web/scrape.ts` — tool pattern to follow
- `src/lib/runner/tools/web/__tests__/scrape.test.ts` — test pattern to follow

---

## Task 1: Install SDK + Environment Variables

**Files:**
- Modify: `.env.example`
- Modify: `package.json`

**Step 1: Install browser-use-sdk**

```bash
pnpm add browser-use-sdk
```

**Step 2: Add env var to .env.example**

Add at the bottom of `.env.example`:

```bash
# Browser-Use Cloud (browser automation — SERVICE-12)
BROWSER_USE_API_KEY=
```

**Step 3: Add BROWSER_USE_API_KEY to Vercel project env vars**

```bash
vercel env add BROWSER_USE_API_KEY
```

Paste your API key (get from https://cloud.browser-use.com → Settings → API Key).

**Step 4: Verify installation**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore(pr50): install browser-use-sdk and add env var"
```

---

## Task 2: Browser-Use Client Singleton

**Files:**
- Create: `src/lib/browser-use/client.ts`

**Step 1: Create the client module**

```typescript
// src/lib/browser-use/client.ts
/**
 * Shared Browser-Use Cloud client singleton.
 * @module lib/browser-use/client
 */
import { BrowserUseClient } from "browser-use-sdk";

let _client: BrowserUseClient | null = null;

/**
 * Returns the shared BrowserUseClient instance.
 * Throws if BROWSER_USE_API_KEY is not configured.
 */
export function getBrowserUseClient(): BrowserUseClient {
  if (_client) return _client;

  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) {
    throw new Error("BROWSER_USE_API_KEY is not configured.");
  }

  _client = new BrowserUseClient({ apiKey });
  return _client;
}

/**
 * Returns true if Browser-Use is configured (env var present).
 */
export function isBrowserUseConfigured(): boolean {
  return Boolean(process.env.BROWSER_USE_API_KEY);
}
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/browser-use/client.ts
git commit -m "feat(pr50): add Browser-Use client singleton"
```

---

## Task 3: browse_website Tool — Tests First

**Files:**
- Create: `src/lib/runner/tools/browser/__tests__/browse-website.test.ts`

Reference: `src/lib/runner/tools/web/__tests__/scrape.test.ts` for mock patterns.

**Step 1: Write the failing tests**

```typescript
// src/lib/runner/tools/browser/__tests__/browse-website.test.ts
/**
 * Tests for browse_website tool behavior.
 * @module lib/runner/tools/browser/__tests__/browse-website
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock browser-use-sdk before importing the tool
const mockComplete = vi.fn();
const mockCreateTask = vi.fn().mockReturnValue({ complete: mockComplete });
const mockCreateSession = vi.fn();
const mockStopSession = vi.fn();

vi.mock("browser-use-sdk", () => ({
  BrowserUseClient: vi.fn().mockImplementation(() => ({
    sessions: {
      createSession: mockCreateSession,
      stopSession: mockStopSession,
    },
    tasks: {
      createTask: mockCreateTask,
    },
  })),
}));

import { createBrowseWebsiteTool } from "../browse-website";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createBrowseWebsiteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BROWSER_USE_API_KEY", "bu_test-key");

    mockCreateSession.mockResolvedValue({ id: "session-1" });
    mockStopSession.mockResolvedValue(undefined);
    mockComplete.mockResolvedValue({
      isSuccess: true,
      output: "Found 5 listings",
      cost: "0.042",
    });
  });

  it("returns browsing results for a public site", async () => {
    const tools = createBrowseWebsiteTool();
    const result = await tools.browse_website.execute(
      {
        goal: "Go to example.com and return the page title",
        startUrl: "https://example.com",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      output: "Found 5 listings",
      cost: "0.042",
    });
  });

  it("creates session and stops it after completion", async () => {
    const tools = createBrowseWebsiteTool();
    await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(mockCreateSession).toHaveBeenCalledWith({});
    expect(mockStopSession).toHaveBeenCalledWith("session-1");
  });

  it("creates task with maxSteps 25 and browser-use-2.0 model", async () => {
    const tools = createBrowseWebsiteTool();
    await tools.browse_website.execute(
      { goal: "Search example.com", startUrl: "https://example.com" },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "Search example.com",
        llm: "browser-use-2.0",
        maxSteps: 25,
        startUrl: "https://example.com",
        sessionId: "session-1",
      }),
    );
  });

  it("appends outputDescription to the task instruction", async () => {
    const tools = createBrowseWebsiteTool();
    await tools.browse_website.execute(
      {
        goal: "Search for condos",
        outputDescription: "array of { name, price, url }",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "Search for condos\n\nReturn the results in this format: array of { name, price, url }",
      }),
    );
  });

  it("passes allowedDomains when provided", async () => {
    const tools = createBrowseWebsiteTool();
    await tools.browse_website.execute(
      {
        goal: "Search 99.co",
        allowedDomains: ["99.co"],
      },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedDomains: ["99.co"],
      }),
    );
  });

  it("returns failure when Browser-Use task is not successful", async () => {
    mockComplete.mockResolvedValueOnce({
      isSuccess: false,
      output: "Page not found",
      cost: "0.01",
    });

    const tools = createBrowseWebsiteTool();
    const result = await tools.browse_website.execute(
      { goal: "Search missing page" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      output: "Page not found",
      cost: "0.01",
    });
  });

  it("stops the session even when the task throws", async () => {
    mockComplete.mockRejectedValueOnce(new Error("Network error"));

    const tools = createBrowseWebsiteTool();
    const result = await tools.browse_website.execute(
      { goal: "Search for condos" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Network error",
    });
    expect(mockStopSession).toHaveBeenCalledWith("session-1");
  });

  it("swallows session cleanup errors", async () => {
    mockStopSession.mockRejectedValueOnce(new Error("already stopped"));

    const tools = createBrowseWebsiteTool();
    const result = await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    // Should still return the result, not throw
    expect(result.success).toBe(true);
  });

  it("returns error when BROWSER_USE_API_KEY is missing", async () => {
    vi.stubEnv("BROWSER_USE_API_KEY", "");

    const tools = createBrowseWebsiteTool();
    const result = await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("BROWSER_USE_API_KEY"),
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/runner/tools/browser/__tests__/browse-website.test.ts
```

Expected: FAIL — `createBrowseWebsiteTool` not found.

---

## Task 4: browse_website Tool — Implementation

**Files:**
- Create: `src/lib/runner/tools/browser/browse-website.ts`

**Step 1: Write the implementation**

```typescript
// src/lib/runner/tools/browser/browse-website.ts
/**
 * Browser automation tool powered by Browser-Use Cloud.
 * Agent hands over a natural language goal; Browser-Use does all browsing
 * on their infra and returns structured results.
 * @module lib/runner/tools/browser/browse-website
 */
import { tool } from "ai";
import { z } from "zod";

import { getBrowserUseClient } from "@/lib/browser-use/client";

/** Browser-Use model — best price/accuracy balance at $0.006/step. */
const BROWSER_USE_MODEL = "browser-use-2.0";

/** Max steps per task — cost cap of ~$0.16 worst case. */
const MAX_STEPS = 25;

/**
 * Creates the browse_website tool for public site browsing.
 * No auth/profile support — that ships in PR 50b.
 */
export function createBrowseWebsiteTool() {
  const browse_website = tool({
    description:
      "Browse a website to find information, interact with pages, fill forms, or extract data. " +
      "Provide a specific, detailed goal describing exactly what to do, what data to extract, " +
      "and what format to return it in. Each call takes 30-60 seconds and is capped at 25 steps.",
    inputSchema: z.object({
      goal: z
        .string()
        .describe(
          "Specific instruction for the browser agent: what site to visit, what actions to take, " +
          "what data to extract, and what format to return. Be maximally descriptive.",
        ),
      startUrl: z
        .string()
        .url()
        .optional()
        .describe("URL to navigate to before starting the task."),
      outputDescription: z
        .string()
        .optional()
        .describe("Description of the expected output shape, e.g. 'array of listings with name, price, sqft, url'."),
      allowedDomains: z
        .array(z.string())
        .optional()
        .describe("Restrict browsing to these domains only."),
    }),
    execute: async ({ goal, startUrl, outputDescription, allowedDomains }) => {
      let client;
      try {
        client = getBrowserUseClient();
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "BROWSER_USE_API_KEY is not configured.",
        };
      }

      const session = await client.sessions.createSession({});

      try {
        const taskParts = [goal];
        if (outputDescription) {
          taskParts.push(`Return the results in this format: ${outputDescription}`);
        }

        const browserTask = await client.tasks.createTask({
          sessionId: session.id,
          task: taskParts.join("\n\n"),
          llm: BROWSER_USE_MODEL,
          startUrl,
          maxSteps: MAX_STEPS,
          ...(allowedDomains ? { allowedDomains } : {}),
        });

        const result = await browserTask.complete();

        return {
          success: (result.isSuccess ?? false) as boolean,
          output: result.output,
          cost: result.cost,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown browser error";
        return {
          success: false as const,
          error: message,
        };
      } finally {
        try {
          await client.sessions.stopSession(session.id);
        } catch {
          // Swallow cleanup errors — session may have already stopped.
        }
      }
    },
  });

  return { browse_website };
}
```

**Step 2: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/runner/tools/browser/__tests__/browse-website.test.ts
```

Expected: ALL PASS.

**Step 3: Commit**

```bash
git add src/lib/runner/tools/browser/browse-website.ts src/lib/runner/tools/browser/__tests__/browse-website.test.ts
git commit -m "feat(pr50): add browse_website tool with tests"
```

---

## Task 5: Barrel Exports + Registry Integration

**Files:**
- Create: `src/lib/runner/tools/browser/index.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/tool-registry.ts`

**Step 1: Create the barrel export**

```typescript
// src/lib/runner/tools/browser/index.ts
/**
 * Browser automation tool factory barrel for runner registration.
 * @module lib/runner/tools/browser
 */
import { createBrowseWebsiteTool } from "./browse-website";

/**
 * Creates browser automation tools for the runner.
 */
export function createBrowserTools() {
  return {
    ...createBrowseWebsiteTool(),
  };
}
```

**Step 2: Add to main barrel**

In `src/lib/runner/tools/index.ts`, add after the `createWebTools` export:

```typescript
export { createBrowserTools } from "./browser";
```

**Step 3: Register in tool-registry.ts — chat-only**

In `src/lib/runner/tool-registry.ts`:

1. Add imports at the top:

```typescript
import {
  createBrowserTools,
  createConnectionTools,
  createCrmTools,
  createStorageTools,
  createTriggerTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
import { isBrowserUseConfigured } from "@/lib/browser-use/client";
```

2. In the `createRunnerTools()` function, add browser tools ONLY in the non-subagent branch (after `const triggerTools`), NOT in the subagent branch:

```typescript
  // Existing subagent branch — NO browser tools here
  if (isSubagent) {
    return {
      ...crmTools,
      ...storageTools,
      ...webTools,
      ...utilityTools,
      ...connectionTools,
    };
  }

  const triggerTools = createTriggerTools(supabase, clientId, threadId, {
    allowMutations: options?.allowTriggerMutations ?? true,
  });

  // Browser tools: chat-only, env var gated
  const browserTools = isBrowserUseConfigured()
    ? createBrowserTools()
    : {};

  return {
    ...crmTools,
    ...storageTools,
    ...webTools,
    ...utilityTools,
    ...triggerTools,
    ...connectionTools,
    ...browserTools,
  };
```

**Step 4: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/lib/runner/tools/browser/index.ts src/lib/runner/tools/index.ts src/lib/runner/tool-registry.ts
git commit -m "feat(pr50): register browser tools in runner (chat-only, env var gated)"
```

---

## Task 6: System Prompt — Browser Tool Guidance

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Add browser guidance**

Add this block after the `</tool-usage>` closing tag (after line 92) in `src/lib/ai/system-prompt.ts`:

```
<browser-automation>
You have access to browse_website, which opens a real browser to interact with websites on your behalf. Each call takes 30-60 seconds and costs money.

When to clarify first:
- If the user's request is vague about which site, what to search, what filters to apply, or what data to extract, use ask_user_question to clarify before browsing.
- If the request already specifies site, action, filters, and desired output clearly, proceed directly.

Writing a good goal:
- Be maximally descriptive. Instead of "search for condos," write "Navigate to 99.co, search for condos for sale in District 15, filter by 2-3 bedrooms, max price $2,000,000, extract for each listing: project name, price, size in sqft, PSF, bedroom count, and listing URL."
- Specify the exact data fields you want extracted.
- Specify any filters, limits, or boundaries (e.g. "first page only," "top 10 results").

When to use browse_website vs web_scrape:
- Use web_scrape when you have a specific URL and just need its text content.
- Use browse_website when you need to interact with a site — search, filter, click, fill forms, navigate.

After browsing:
- If results are unexpected, empty, or wrong, tell the user what happened and ask how to refine. Do not retry automatically — each attempt costs money.
- Each call is capped at 25 steps. If a task needs more, break it into multiple targeted calls.
</browser-automation>
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr50): add browser tool guidance to system prompt"
```

---

## Task 7: Bump maxDuration on Chat Route

**Files:**
- Modify: `app/api/chat/route.ts:31`

**Step 1: Update maxDuration**

Change line 31 in `app/api/chat/route.ts`:

```typescript
// Before:
export const maxDuration = 60;

// After:
/** Allows longer streaming runs on Vercel functions (browser tasks take 30-60s). */
export const maxDuration = 120;
```

**Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(pr50): bump chat route maxDuration to 120s for browser tasks"
```

---

## Task 8: End-to-End Verification

**Step 1: Run all tests**

```bash
pnpm vitest run
```

Expected: All tests pass, including the new browse_website tests.

**Step 2: Test in dev — public site browsing**

Start the dev server and open the chat. Type:

```
Search 99.co for 3-bedroom condos for sale in District 15, under $2M. Extract the project name, price, size, and listing URL for each result.
```

Expected:
1. Agent recognizes the request is specific enough and calls browse_website directly (no clarification needed)
2. Agent sends the goal to Browser-Use
3. Results come back with listing data
4. Agent presents the data

**Step 3: Test env var guard**

Remove `BROWSER_USE_API_KEY` from `.env.local` and restart the dev server. Ask the agent to browse a website.

Expected: Agent does NOT have browse_website available. Uses web_scrape or tells user browsing is not configured.

**Step 4: Test ambiguous request clarification**

With the key restored, type:

```
What's available in D15?
```

Expected: Agent asks clarifying questions (which portal, property type, filters) before browsing.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(pr50): browser-use cloud public browsing integration complete"
```

---

## Notes

- **PR 50b (next):** Adds authenticated browsing — profiles, embedded browser auth flow, platform parameter on browse_website. See v2 plan for full scope.
- **PR 50c (deferred):** Skills API for deterministic repeated portal searches.
- **Cost monitoring:** Each browse_website call returns a `cost` field. Consider logging to PostHog for per-client cost tracking.
- **maxDuration:** Bumped to 120s. If browser tasks consistently need more, consider a dedicated route with `maxDuration = 300`.
- **Rotate API key:** The Browser-Use API key was previously exposed in docs. It has been scrubbed. Rotate the key in the Browser-Use dashboard.
