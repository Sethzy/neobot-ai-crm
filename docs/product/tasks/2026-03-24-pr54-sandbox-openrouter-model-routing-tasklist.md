# Sandbox Model Routing via OpenRouter Implementation Plan

**Goal:** Route Claude Code CLI inside Sprites through OpenRouter so any supported model can power sandbox tasks (spreadsheet analysis, artifact publishing) — from Claude Sonnet via OpenRouter (cheaper caching) to MiniMax/Gemini Flash (~10-50x cost reduction).

**Architecture:** Claude Code CLI reads `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_API_KEY` at startup. OpenRouter provides an Anthropic-compatible endpoint at `https://openrouter.ai/api`. Point the CLI at OpenRouter via env vars, set `ANTHROPIC_API_KEY=""` (must be explicitly empty), and route to any model via `ANTHROPIC_DEFAULT_SONNET_MODEL`. No code changes to the CLI itself — only env var configuration in `buildSandboxClaudeEnv()`.

**Tech Stack:** OpenRouter API, Claude Code CLI env vars, Sprites SDK (`@fly/sprites`), Vitest

**Depends on:** PR 52 (done), PR 53 (done)

**Validated on 2026-03-24:** All combinations tested live with OpenRouter API key. Results:
- `anthropic/claude-sonnet-4-6` via OpenRouter: works (text + tools)
- `minimax/minimax-m1` via env routing: works (text + tools + file I/O)
- `minimax/minimax-m1` via `--model` flag: works
- `google/gemini-2.5-flash` via env routing: works (text)
- OpenRouter warns non-Anthropic models "may not work correctly" — treat as opt-in, not default.

**Auth contract (from OpenRouter Claude Code docs):**
```
ANTHROPIC_BASE_URL=https://openrouter.ai/api          # /api, NOT /api/v1
ANTHROPIC_AUTH_TOKEN=$OPENROUTER_API_KEY               # real key goes here
ANTHROPIC_API_KEY=""                                   # MUST be explicitly empty
ANTHROPIC_DEFAULT_SONNET_MODEL=minimax/minimax-m1      # optional model override
```

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

### Modify
- `src/lib/sandbox/claude-env.ts` — primary change: support OpenRouter auth contract
- `src/lib/sandbox/env.ts` — update `isSandboxConfigured()` to accept OpenRouter-only config
- `.env.example` — add new env vars

### Tests to update
- `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts` — `buildClaudeEnv` tests
- `src/lib/sandbox/__tests__/artifact-runner.test.ts` — `buildClaudeEnv` tests
- `src/lib/sandbox/__tests__/env.test.ts` — `isSandboxConfigured` tests

### No changes needed
- `src/lib/sandbox/run-claude-in-sprite.ts` — already calls `buildClaudeEnv()` and passes to `sprite.execFile()`
- `src/lib/sandbox/artifact-runner.ts` — same pattern, both delegate to `buildSandboxClaudeEnv()`

---

## Task 1: Update `buildSandboxClaudeEnv()` for OpenRouter auth

**Files:**
- Modify: `src/lib/sandbox/claude-env.ts`
- Test: `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts` (existing `buildClaudeEnv` tests)
- Test: `src/lib/sandbox/__tests__/artifact-runner.test.ts` (existing `buildClaudeEnv` tests)

### Step 1: Write failing test for OpenRouter env config

Add to `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts` inside the existing `describe("buildClaudeEnv")`:

```typescript
it("returns OpenRouter env when OPENROUTER_API_KEY is set", () => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("PATH", "/usr/bin");

  expect(buildClaudeEnv()).toEqual({
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_AUTH_TOKEN: "sk-or-test-key",
    ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    PATH: "/usr/bin",
  });
});

it("includes ANTHROPIC_DEFAULT_SONNET_MODEL when SANDBOX_MODEL_ID is set", () => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  vi.stubEnv("SANDBOX_MODEL_ID", "minimax/minimax-m1");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("PATH", "/usr/bin");

  expect(buildClaudeEnv()).toEqual({
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_AUTH_TOKEN: "sk-or-test-key",
    ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "minimax/minimax-m1",
    PATH: "/usr/bin",
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts -t "OpenRouter"`
Expected: FAIL — `buildClaudeEnv()` throws because `ANTHROPIC_API_KEY` is empty.

### Step 3: Implement OpenRouter support in `buildSandboxClaudeEnv()`

Update `src/lib/sandbox/claude-env.ts`:

```typescript
/**
 * Shared Claude CLI environment builder for Sprite execution.
 *
 * Supports two auth modes:
 * - **Anthropic direct:** `ANTHROPIC_API_KEY` set → routes to api.anthropic.com (or custom base URL)
 * - **OpenRouter:** `OPENROUTER_API_KEY` set → routes to openrouter.ai/api with correct auth contract
 *
 * @module lib/sandbox/claude-env
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

/**
 * Builds the per-command environment map for Claude Code CLI execution.
 *
 * When `OPENROUTER_API_KEY` is present, uses the OpenRouter auth contract:
 * - `ANTHROPIC_BASE_URL` → `https://openrouter.ai/api`
 * - `ANTHROPIC_AUTH_TOKEN` → the OpenRouter key
 * - `ANTHROPIC_API_KEY` → `""` (must be explicitly empty per OpenRouter docs)
 * - `ANTHROPIC_DEFAULT_SONNET_MODEL` → optional model override via `SANDBOX_MODEL_ID`
 */
export function buildSandboxClaudeEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const openrouterApiKey = env.OPENROUTER_API_KEY?.trim();
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();

  if (openrouterApiKey) {
    const result: Record<string, string> = {
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_AUTH_TOKEN: openrouterApiKey,
      ANTHROPIC_BASE_URL: OPENROUTER_BASE_URL,
      PATH: env.PATH?.trim() ?? "",
    };

    const modelId = env.SANDBOX_MODEL_ID?.trim();
    if (modelId) {
      result.ANTHROPIC_DEFAULT_SONNET_MODEL = modelId;
    }

    return result;
  }

  if (!anthropicApiKey) {
    throw new Error(
      "Either ANTHROPIC_API_KEY or OPENROUTER_API_KEY is required for Sprite Claude CLI",
    );
  }

  return {
    ANTHROPIC_API_KEY: anthropicApiKey,
    PATH: env.PATH?.trim() ?? "",
    ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL?.trim() ?? "",
  };
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`
Expected: PASS — all existing tests still pass, plus the 2 new OpenRouter tests.

### Step 5: Update artifact-runner tests to match

The `buildClaudeEnv` tests in `artifact-runner.test.ts` delegate to the same `buildSandboxClaudeEnv()`. Update the "throws" test message to match:

In `src/lib/sandbox/__tests__/artifact-runner.test.ts`, change:
```typescript
expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY");
```
to:
```typescript
expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY or OPENROUTER_API_KEY");
```

Run: `npx vitest run src/lib/sandbox/__tests__/artifact-runner.test.ts`
Expected: PASS

### Step 6: Run the same fix for the run-claude-in-sprite test

In `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`, change:
```typescript
expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY");
```
to:
```typescript
expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY or OPENROUTER_API_KEY");
```

### Step 7: Commit

```bash
git add src/lib/sandbox/claude-env.ts \
  src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts \
  src/lib/sandbox/__tests__/artifact-runner.test.ts
git commit -m "feat(pr54): add OpenRouter model routing to sandbox claude-env"
```

---

## Task 2: Update `isSandboxConfigured()` for OpenRouter-only auth

**Files:**
- Modify: `src/lib/sandbox/env.ts`
- Test: `src/lib/sandbox/__tests__/env.test.ts`

### Step 1: Write failing test

Add to `src/lib/sandbox/__tests__/env.test.ts`:

```typescript
it("returns true when OpenRouter key is set but Anthropic key is empty", () => {
  vi.stubEnv("SPRITES_TOKEN", "sprite-token");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");

  expect(isSandboxConfigured()).toBe(true);
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/sandbox/__tests__/env.test.ts -t "OpenRouter"`
Expected: FAIL — `isSandboxConfigured()` returns `false` because `ANTHROPIC_API_KEY` is empty.

### Step 3: Update `isSandboxConfigured()`

```typescript
/**
 * Returns the configured OpenRouter API key, or null when not configured.
 */
export function getSandboxOpenRouterApiKey(): string | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  return apiKey && apiKey.length > 0 ? apiKey : null;
}

/**
 * Returns whether Sprite-backed sandbox tooling is configured for this runtime.
 * Requires SPRITES_TOKEN plus either ANTHROPIC_API_KEY or OPENROUTER_API_KEY.
 */
export function isSandboxConfigured(): boolean {
  return getSpritesToken() !== null && (getSandboxAnthropicApiKey() !== null || getSandboxOpenRouterApiKey() !== null);
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/lib/sandbox/__tests__/env.test.ts`
Expected: PASS — all 4 tests pass.

### Step 5: Commit

```bash
git add src/lib/sandbox/env.ts src/lib/sandbox/__tests__/env.test.ts
git commit -m "feat(pr54): accept OpenRouter as valid sandbox auth in isSandboxConfigured"
```

---

## Task 3: Add env vars to `.env.example`

**Files:**
- Modify: `.env.example`

### Step 1: Add the new env vars

Append to `.env.example`:

```bash
# Sandbox model routing via OpenRouter (PR 54)
# When set, sandbox Claude CLI routes through OpenRouter instead of Anthropic direct.
# See: https://openrouter.ai/docs/guides/coding-agents/claude-code-integration
OPENROUTER_API_KEY=

# Optional: override the model used in sandbox tasks.
# Examples: minimax/minimax-m1, google/gemini-2.5-flash, anthropic/claude-sonnet-4-6
# Only used when OPENROUTER_API_KEY is set.
SANDBOX_MODEL_ID=
```

### Step 2: Commit

```bash
git add .env.example
git commit -m "feat(pr54): add OpenRouter sandbox env vars to .env.example"
```

---

## Summary

| Task | What | Files |
|---|---|---|
| 1 | OpenRouter auth in `buildSandboxClaudeEnv()` | `claude-env.ts` + 2 test files |
| 2 | `isSandboxConfigured()` accepts OpenRouter | `env.ts` + test file |
| 3 | `.env.example` | `.env.example` |

**Total code changes:** ~30 lines production, ~25 lines tests, ~10 lines .env.example.

**What's NOT in scope:**
- No changes to `run-claude-in-sprite.ts` or `artifact-runner.ts` (they already delegate to `buildSandboxClaudeEnv`)
- No `--model` flag threading (env-based routing via `ANTHROPIC_DEFAULT_SONNET_MODEL` is cleaner and documented)
- No proxy/credential-proxy layer (Sprites pass env per-process via `execFile()`, no NanoClaw-style proxy needed)
- Research, E2E testing, and cost comparison tasks from the old tasklist are dropped (validated live on 2026-03-24)
