# Sprite: Cheap Model Routing via OpenRouter

**PR:** PR 54: Sprite cheap model routing
**Decisions:** LLM-01
**Goal:** Replace Claude Sonnet (~$0.05-0.50/run) inside Sprite with cheap models (MiniMax, Kimi 2.5, Gemini Flash) via OpenRouter (~$0.001-0.01/run). 10-50x cost reduction. Zero code changes to the Claude Code CLI — just env var swaps.

**Architecture:** Claude Code CLI reads `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` at startup. By default these point at `api.anthropic.com`. OpenRouter provides an Anthropic-compatible API endpoint at `https://openrouter.ai/api/v1`. Point the CLI at OpenRouter, set the model via HTTP header, and the CLI thinks it's talking to Anthropic but actually hitting MiniMax/Kimi/Flash. The NanoClaw credential proxy pattern validated this approach (see `roadmap docs/.../nanoclaw-dorabot/nanoclaw-overview.md`).

```
DEFAULT (expensive):
  Claude CLI → api.anthropic.com → Claude Sonnet → ~$0.05-0.50/run

WITH OPENROUTER (cheap):
  Claude CLI → openrouter.ai/api/v1 → MiniMax/Kimi/Flash → ~$0.001-0.01/run
```

**Tech Stack:** OpenRouter API, Claude Code CLI env vars, Sprites SDK (`@fly/sprites@0.0.1-rc37`), Vitest

**Requirements:** Node 24 (required by `@fly/sprites`)

**Depends on:** PR 52 (Sprites infra — `run-claude-in-sprite.ts` writes the API key config)

**Reference:**
- NanoClaw credential proxy: `roadmap docs/.../nanoclaw-dorabot/nanoclaw-overview.md`
- OpenRouter API docs: https://openrouter.ai/docs
- Zo Computer (free MiniMax + Kimi): see memory `reference_zo_computer.md`

---

## Relevant Files

### Modify
- `src/lib/sandbox/run-claude-in-sprite.ts` — switch to `execFile()` with env option for OpenRouter support
- `src/lib/sandbox/run-claude-for-artifact.ts` — same `execFile()` + env pattern
- `.env.example` — add `SANDBOX_MODEL_PROVIDER`, `SANDBOX_MODEL_ID`, `OPENROUTER_API_KEY`

### Reference (read, don't modify)
- `src/lib/sandbox/create-sprite.ts` — no changes (model config is runtime, not Sprite image)
- `roadmap docs/.../nanoclaw-dorabot/nanoclaw-overview.md` — credential proxy pattern

---

## Task 1: Research — Verify OpenRouter Anthropic-format compatibility

Before writing any code, verify that Claude Code CLI works with OpenRouter's Anthropic-compatible endpoint.

**Step 1: Check OpenRouter's Anthropic compatibility**

Read OpenRouter docs. Confirm:
- [ ] OpenRouter supports the Anthropic Messages API format (`/v1/messages` endpoint)
- [ ] OpenRouter supports `tool_use` content blocks (required for Claude CLI's built-in tools)
- [ ] OpenRouter supports streaming (Claude CLI uses streaming by default)
- [ ] OpenRouter supports the `anthropic-version` header

**Step 2: Manual test with curl**

```bash
# Test OpenRouter with Anthropic format
curl https://openrouter.ai/api/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "HTTP-Referer: https://sunder.ai" \
  -d '{
    "model": "minimax/minimax-m1",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

If OpenRouter doesn't support the Anthropic format directly, check if they have a compatibility layer or if we need a thin proxy (LiteLLM).

**Step 3: Test Claude CLI with OpenRouter locally**

```bash
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1 \
ANTHROPIC_API_KEY=sk-or-... \
claude --print -p "What is 2+2?" --model minimax/minimax-m1
```

Document: does it work? Any errors? Does tool_use work?

**Step 4: Document findings**

Write results to `docs/product/references/openrouter-sprite-compatibility.md`:
- Which models work
- Which models support tool_use
- Any format translation issues
- Recommended default model for Sprite tasks

---

## Task 2: Add environment variables

**Files:**
- Modify: `.env.example`

**Step 1: Add new env vars**

```bash
# Sprite model routing (PR 54)
# Options: "anthropic" (default, expensive) or "openrouter" (cheap)
SANDBOX_MODEL_PROVIDER=openrouter

# Model ID for Sprite tasks (OpenRouter model IDs)
# Cheap options: minimax/minimax-m1, moonshotai/kimi-k2, google/gemini-2.5-flash
SANDBOX_MODEL_ID=minimax/minimax-m1

# OpenRouter API key (only needed if SANDBOX_MODEL_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-...
```

---

## Task 3: Switch to execFile() + env for OpenRouter model routing

The core change. Use `sprite.execFile()` with `env` option to pass credentials and base URL to the Claude CLI. No filesystem writes or `sprite.exec()` shell strings.

**Files:**
- Modify: `src/lib/sandbox/run-claude-in-sprite.ts`
- Modify: `src/lib/sandbox/run-claude-for-artifact.ts`

**Step 1: Write failing test**

```typescript
// Add to src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts

describe("buildSpriteModelConfig", () => {
  it("returns Anthropic config when provider is anthropic", () => {
    const config = buildSpriteModelConfig("anthropic", undefined, "sk-ant-...");
    expect(config.baseUrl).toBeUndefined(); // default
    expect(config.apiKey).toBe("sk-ant-...");
    expect(config.modelFlag).toBeUndefined();
  });

  it("returns OpenRouter config when provider is openrouter", () => {
    const config = buildSpriteModelConfig("openrouter", "minimax/minimax-m1", "sk-or-...");
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.apiKey).toBe("sk-or-...");
    expect(config.modelFlag).toBe("minimax/minimax-m1");
  });

  it("defaults to anthropic when provider is unset", () => {
    const config = buildSpriteModelConfig(undefined, undefined, "sk-ant-...");
    expect(config.baseUrl).toBeUndefined();
  });
});
```

Run: should fail.

**Step 2: Implement model config builder**

```typescript
// In src/lib/sandbox/run-claude-in-sprite.ts

interface SpriteModelConfig {
  baseUrl?: string;
  apiKey: string;
  modelFlag?: string;
}

/** Builds the model config for the Claude CLI inside the Sprite. Exported for testing. */
export function buildSpriteModelConfig(
  provider: string | undefined,
  modelId: string | undefined,
  apiKey: string,
): SpriteModelConfig {
  if (provider === "openrouter") {
    return {
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey, // OpenRouter API key
      modelFlag: modelId ?? "minimax/minimax-m1",
    };
  }

  // Default: Anthropic
  return { apiKey };
}
```

**Step 3: Update runClaudeInSprite to use execFile() with env option**

Replace the current approach (writing config files + bashrc via `sprite.exec()`) with `execFile()` arg arrays. Pass `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` via the `env` option — no filesystem writes needed:

```typescript
async function runClaudeInSprite(sprite: Sprite, prompt: string, maxTurns: number): Promise<string> {
  const provider = process.env.SANDBOX_MODEL_PROVIDER;
  const modelId = process.env.SANDBOX_MODEL_ID;
  const apiKey = provider === "openrouter"
    ? process.env.OPENROUTER_API_KEY
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      provider === "openrouter"
        ? "OPENROUTER_API_KEY is required when SANDBOX_MODEL_PROVIDER=openrouter"
        : "ANTHROPIC_API_KEY is required for Sprite Claude CLI",
    );
  }

  const config = buildSpriteModelConfig(provider, modelId, apiKey);

  // Build CLI args
  const args = [
    "--dangerously-skip-permissions",
    "-p", prompt,
    "--max-turns", String(maxTurns),
  ];
  if (config.modelFlag) {
    args.push("--model", config.modelFlag);
  }

  // Build env — pass ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY via env option.
  // Always include PATH so the CLI can find system binaries.
  const env: Record<string, string> = {
    ANTHROPIC_API_KEY: config.apiKey,
    PATH: process.env.PATH!,
  };
  if (config.baseUrl) {
    env.ANTHROPIC_BASE_URL = config.baseUrl;
  }

  // Use execFile() with arg array — never exec() with string interpolation
  const result = await sprite.execFile("claude", args, { env });
  return result.stdout;
}
```

> **Important:** Use `sprite.execFile()` (arg array), never `sprite.exec()` (shell string). The `exec()` method is deprecated and vulnerable to injection. The `env` option on `execFile()` sets environment variables for the subprocess without writing to bashrc or the filesystem.

**Step 4: Thread extra args into buildClaudeCliArgs**

Update the CLI arg builder to accept and include model-specific args:

```typescript
export function buildClaudeCliArgs(prompt: string, maxTurns: number, extraArgs: string[] = []): string[] {
  return [
    "--dangerously-skip-permissions",
    ...extraArgs,  // includes --model if OpenRouter
    "--allowedTools", ALLOWED_TOOLS.join(","),
    "--max-turns", String(maxTurns),
    "-p", prompt,
  ];
}
```

**Step 5: Apply same execFile() + env pattern to run-claude-for-artifact.ts**

Extract the shared `buildSpriteModelConfig` into a shared module (e.g. `src/lib/sandbox/model-config.ts`) or just duplicate the pattern. Prefer extracting. Both call sites must use `sprite.execFile()` with `env` option — no `sprite.exec()` string interpolation anywhere.

Run all tests: `npx vitest run src/lib/sandbox/` — should pass.

---

## Task 4: Verify no Sprite image changes needed

Confirm: the model config is purely runtime (env vars + CLI args). The Sprite image doesn't need to be rebuilt.

- [ ] `sprite_excel` — no changes (Claude CLI is installed, which model it calls is determined at runtime)
- [ ] `sprite_artifact` — no changes (same reason)
- [ ] The `ANTHROPIC_BASE_URL` env var is passed via `execFile()` env option at runtime, not baked into the Sprite image

This is a no-op task — just verify the mental model is correct.

---

## Task 5: E2E test — spreadsheet analysis with cheap model

**Step 1: Set env vars**

```bash
# In .env.local
SANDBOX_MODEL_PROVIDER=openrouter
SANDBOX_MODEL_ID=minimax/minimax-m1
OPENROUTER_API_KEY=sk-or-...
```

**Step 2: Upload a simple spreadsheet and test**

1. Start dev server
2. Upload a property deals xlsx
3. "Build me a comparison model"
4. Verify:
   - [ ] Sprite boots and runs
   - [ ] Claude CLI calls OpenRouter (check Sprite logs for base URL)
   - [ ] Output .xlsx has live formulas
   - [ ] recalc.py passes (zero errors)
   - [ ] Quality is acceptable (formulas make sense, numbers are right)

**Step 3: If MiniMax fails, try alternatives**

| Model | OpenRouter ID | Cost | Notes |
|---|---|---|---|
| MiniMax M1 | `minimax/minimax-m1` | ~$0.002/run | Good at code, Chinese company |
| Kimi K2 | `moonshotai/kimi-k2` | ~$0.003/run | Strong reasoning |
| Gemini Flash | `google/gemini-2.5-flash-preview` | ~$0.001/run | Fast, cheap, Google |
| DeepSeek V3 | `deepseek/deepseek-chat-v3` | ~$0.002/run | Strong at code |
| Qwen 3 | `qwen/qwen3-235b` | ~$0.005/run | Large, capable |

Test 2-3 options. Pick the best cost/quality ratio.

---

## Task 6: Cost comparison

Run the same spreadsheet analysis task with each model and document:

| Model | Provider | Time | Cost | Output quality (1-5) | Formulas correct? | recalc passes? |
|---|---|---|---|---|---|---|
| Claude Sonnet | Anthropic | ? | ? | ? | ? | ? |
| MiniMax M1 | OpenRouter | ? | ? | ? | ? | ? |
| Kimi K2 | OpenRouter | ? | ? | ? | ? | ? |
| Gemini Flash | OpenRouter | ? | ? | ? | ? | ? |

Save results to `docs/product/references/sprite-model-cost-comparison.md`.

Pick the default model based on this data.

---

## Summary

| Task | What | Depends On |
|---|---|---|
| 1 | Research — verify OpenRouter Anthropic-format compatibility | — |
| 2 | Add env vars | — |
| 3 | Switch to execFile() + env for OpenRouter model routing | PR 52, Task 1 |
| 4 | Verify no Sprite image changes needed | 3 |
| 5 | E2E test with cheap model | 2, 3 |
| 6 | Cost comparison across models | 5 |

Task 1 is the critical gate. If OpenRouter doesn't support Anthropic-format tool_use, we need a fallback (LiteLLM proxy or custom translation layer). But NanoClaw's success with this pattern suggests it should work.

**Expected outcome:** Sprite invocations drop from ~$0.05-0.50/run to ~$0.001-0.01/run. 10-50x cost reduction with acceptable quality for code-writing tasks.
