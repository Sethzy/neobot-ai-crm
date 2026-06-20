# Reference: Smart Model Router (knowledge-agent-template)

**Source repo:** `knowledge-agent-template` (cloned at `/Users/sethlim/Documents/knowledge-agent-template`)
**Feature:** Tool-based model routing — select the right model based on which tools are active in a run.
**Date documented:** 2026-03-30

---

## 1. What the Reference Repo Does

The reference implements a **Smart Complexity Router**: before each agent run, a cheap LLM (`gemini-2.5-flash-lite`) reads the user's question and returns a structured routing decision — which model to use and how many steps to allow.

```
Question → Router LLM (cheap, fast) → { complexity, model, maxSteps }
                                              ↓
                                      Main Agent (routed model, routed step budget)
```

### Complexity tiers

| Complexity | maxSteps | Model             | Trigger                                     |
|------------|----------|-------------------|---------------------------------------------|
| trivial    | 4        | gemini-3-flash    | Greetings, acknowledgments                  |
| simple     | 8        | gemini-3-flash    | Single concept lookup, one file expected    |
| moderate   | 15       | claude-sonnet-4.6 | Multi-concept, 2–5 file reads               |
| complex    | 25       | claude-opus-4.6   | Debugging, architecture, cross-file analysis |

### Key design decisions
- Routing itself is cheap (flash-lite, single structured-output call, no tool loop).
- Graceful degradation: if routing fails for any reason, fall back to `moderate` defaults.
- Admin config can **override** the router's model and **multiply** the router's maxSteps.
- Step budget enforcement is separate from routing — `shouldForceTextOnlyStep()` prevents tool loops regardless of which model runs.

---

## 2. Key Files to Read in the Reference Repo

These are the files you need to understand deeply before implementing in Sunder.

```
packages/agent/src/
├── router/
│   ├── schema.ts            ← Zod schema, model constants, fallback chains, helper fns
│   └── route-question.ts    ← Router execution: calls LLM, returns AgentConfig
├── prompts/
│   ├── router.ts            ← ROUTER_SYSTEM_PROMPT: classification guidelines
│   └── shared.ts            ← COMPLEXITY_HINTS + applyComplexity() step-budget injection
├── agents/
│   └── source.ts            ← createSourceAgent(): wires routing into ToolLoopAgent
└── core/
    └── policy.ts            ← shouldForceTextOnlyStep(): prevents tool loops
```

### `packages/agent/src/router/schema.ts` — copy this pattern exactly

```typescript
export const ROUTER_MODEL = 'google/gemini-2.5-flash-lite'
export const DEFAULT_MODEL = 'google/gemini-3-flash'

export const agentConfigSchema = z.object({
  complexity: z.enum(['trivial', 'simple', 'moderate', 'complex']),
  maxSteps: z.number().min(1).max(30),
  model: z.enum(['google/gemini-3-flash', 'anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4.6']),
  reasoning: z.string().max(200),
})

export function getDefaultConfig(): AgentConfig {
  return { complexity: 'moderate', maxSteps: 15, model: 'anthropic/claude-sonnet-4.6', reasoning: 'Default fallback' }
}

// Fallback chains: AI Gateway tries these in order if primary model is unavailable
const MODEL_FALLBACKS: Record<string, string[]> = {
  'google/gemini-3-flash': ['anthropic/claude-sonnet-4.6', 'openai/gpt-4o'],
  'anthropic/claude-sonnet-4.6': ['google/gemini-3-flash', 'openai/gpt-4o'],
  'anthropic/claude-opus-4.6': ['anthropic/claude-sonnet-4.6', 'google/gemini-3-flash'],
}

export function buildProviderOptions(model: string, metadata?): SharedV3ProviderOptions | undefined {
  const fallbacks = MODEL_FALLBACKS[model]
  const gateway: Record<string, unknown> = {}
  if (fallbacks?.length) gateway.models = fallbacks
  if (metadata?.userId) gateway.user = metadata.userId
  if (metadata?.tags?.length) gateway.tags = metadata.tags
  return Object.keys(gateway).length > 0 ? { gateway } : undefined
}
```

**Key pattern:** Model ID strings, fallback chains, and helper functions all live in one schema file. This is the single source of truth for "which models exist and what falls back to what."

### `packages/agent/src/router/route-question.ts` — copy graceful degradation pattern

```typescript
export async function routeQuestion(messages, requestId): Promise<AgentConfig> {
  const question = extractQuestionFromMessages(messages)
  if (!question) return getDefaultConfig()

  try {
    const { output } = await generateText({
      model: ROUTER_MODEL,
      output: Output.object({ schema: agentConfigSchema }),
      messages: [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: `Question: ${question}` },
      ],
    })
    if (!output) return getDefaultConfig()
    return output
  } catch {
    return getDefaultConfig()   // ← always fall back, never crash the run
  }
}
```

**Key pattern:** Router is a pure async function. Returns a default config on any failure. The main agent call always has a valid config — routing failures are invisible to users.

### `packages/agent/src/core/policy.ts` — copy step budget enforcement

```typescript
export function shouldForceTextOnlyStep({ stepNumber, maxSteps, steps }): boolean {
  // Always reserve last 2 steps for final output
  if (stepNumber >= maxSteps - 2) return true
  // Break tool loops: if 4+ consecutive tool calls past 60% of budget, force synthesis
  const toolStreak = countConsecutiveToolSteps(steps)
  const pastMidpoint = stepNumber >= Math.max(3, Math.floor(maxSteps * 0.6))
  if (pastMidpoint && toolStreak >= 4) return true
  return false
}
```

**Key pattern:** Step enforcement is decoupled from routing. It always applies, regardless of which model or complexity tier is active.

---

## 3. Sunder's Adaptation — Tool-Based Routing

Sunder's routing requirement is **simpler** than the reference: instead of LLM-based complexity classification, we route **deterministically based on tool availability**.

### The routing rule

| Condition              | Model                     | Rationale                                        |
|------------------------|---------------------------|--------------------------------------------------|
| `bash` tool active     | `minimax/minimax-2.7`*    | Scores higher on code execution benchmarks       |
| `bash` tool not active | `google/gemini-3-flash`   | Fast, cheap, good at tool-calling and reasoning  |

*Verify exact Vercel AI Gateway model ID for MiniMax 2.7 — see [Vercel AI Gateway model catalog](https://vercel.com/docs/ai-gateway).

### Why we drift from the reference

| Reference pattern              | Sunder's drift                                | Reason                                                                                     |
|--------------------------------|-----------------------------------------------|--------------------------------------------------------------------------------------------|
| LLM-based complexity router    | Deterministic tool-presence check             | No LLM call needed — the routing condition (bash available?) is already known at startup   |
| 4-tier complexity (trivial→complex) | Not used — single routing condition       | Overkill for v1. Tool availability is the only axis that matters for model selection today |
| `routeQuestion()` function     | Not needed — routing is synchronous           | No async call, no graceful degradation logic required                                      |
| `COMPLEXITY_HINTS` prompt injection | Not used                                 | Sunder's system prompt architecture is different (7-layer context assembly)                |
| Admin config `maxStepsMultiplier` | Not implementing in v1                      | Sunder doesn't have an admin config layer yet                                              |
| `ToolLoopAgent` from AI SDK    | Using `streamText()` with `stopWhen`          | Sunder was built before `ToolLoopAgent` API stabilized; migration is out of scope          |

### What we DO copy from the reference

| Pattern                        | Where in Sunder                        | Notes                                                     |
|--------------------------------|----------------------------------------|-----------------------------------------------------------|
| Model constants in one file    | `src/lib/ai/gateway.ts`               | Add `BASH_MODEL` alongside `TIER_1_MODEL`                 |
| Fallback chains via `providerOptions` | `src/lib/ai/gateway.ts`         | Already using `gatewayProviderOptions`; extend with per-model fallbacks |
| Step budget enforcement (`shouldForceTextOnlyStep`) | `src/lib/runner/run-agent.ts` `buildPrepareStep()` | Sunder's current `buildPrepareStep()` only disables tools on last step — reference's logic is richer |

---

## 4. Files to Touch for Implementation

### `src/lib/ai/gateway.ts`

Add the bash model constant and a `buildModelProviderOptions()` helper:

```typescript
/** Model used when the bash sandbox tool is active. Higher benchmark scores on code execution. */
export const BASH_MODEL = "minimax/minimax-2.7"; // Verify exact model ID

/**
 * Returns the correct model ID for a run based on whether the bash tool is active.
 * No-bash runs: fast and cheap (gemini-3-flash).
 * Bash runs: better at code interpretation (minimax-2.7).
 */
export function selectModel(hasBashTool: boolean): string {
  return hasBashTool ? BASH_MODEL : TIER_1_MODEL;
}
```

### `src/lib/runner/run-agent.ts`

Replace the hardcoded `const modelId = TIER_1_MODEL` with:

```typescript
// Routing decision: bash tool needs a model with stronger code execution.
// This mirrors the knowledge-agent-template's router pattern — deterministic
// instead of LLM-based since the condition is already known at startup.
const hasBashTool = !!snapshotId;
const modelId = selectModel(hasBashTool);
```

Note: `snapshotId` is already computed earlier in the function (`getServerEnv().SANDBOX_GOLDEN_SNAPSHOT_ID`), so the routing decision is free — no extra I/O.

### `buildPrepareStep()` in `src/lib/runner/run-agent.ts` (optional upgrade)

The current implementation only disables tools on step `maxSteps - 1`. The reference's `shouldForceTextOnlyStep()` adds anti-loop logic (break tool streaks past 60% of budget). This is an independent improvement worth copying:

```typescript
// From reference: packages/agent/src/core/policy.ts
function countConsecutiveToolSteps(steps): number {
  let count = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if ((steps[i].toolCalls?.length ?? 0) > 0) count++;
    else break;
  }
  return count;
}

function shouldForceTextOnlyStep({ stepNumber, maxSteps, steps }): boolean {
  if (stepNumber >= maxSteps - 2) return true;
  const toolStreak = countConsecutiveToolSteps(steps);
  const pastMidpoint = stepNumber >= Math.max(3, Math.floor(maxSteps * 0.6));
  if (pastMidpoint && toolStreak >= 4) return true;
  return false;
}
```

---

## 5. Testing Checklist

Before shipping:

- [ ] Confirm exact Vercel AI Gateway model ID for MiniMax 2.7 (check gateway model catalog or test with a `generateText` call)
- [ ] Verify `BASH_MODEL` is accessible via `AI_GATEWAY_API_KEY` (not all models are in every gateway tier)
- [ ] Run a chat thread without sandbox enabled — confirm `modelId === TIER_1_MODEL` in logs
- [ ] Run a chat thread with sandbox enabled — confirm `modelId === BASH_MODEL` in logs
- [ ] Trigger a cron/autopilot run (no sandbox) — confirm it still uses `TIER_1_MODEL`
- [ ] Check Langfuse traces — `model_id` property in `agent_run_completed` should reflect routing decision

---

## 6. What NOT to Implement (YAGNI)

- **LLM-based complexity classification:** The reference's `routeQuestion()` call is not needed for Sunder's routing rule. Don't add it unless we actually want to route on content complexity.
- **4-tier step budgets (4/8/15/25):** Sunder's `MAX_STEPS` per run type already captures the relevant constraints. Don't replace them with complexity-based budgets.
- **Admin config model overrides:** No admin layer in v1. Skip `maxStepsMultiplier` and `defaultModel` override logic.
- **`COMPLEXITY_HINTS` prompt injection:** Sunder's system prompt is already fully assembled; don't inject complexity hints without a deliberate prompt architecture decision.

---

## 7. Quick Reference: Where to Look

| What you need                              | Where                                                                 |
|--------------------------------------------|-----------------------------------------------------------------------|
| Exact router schema (Zod)                  | `knowledge-agent-template/packages/agent/src/router/schema.ts`        |
| Router execution (how `generateText` is called) | `knowledge-agent-template/packages/agent/src/router/route-question.ts` |
| Step budget enforcement policy             | `knowledge-agent-template/packages/agent/src/core/policy.ts`          |
| How routing wires into the agent loop      | `knowledge-agent-template/packages/agent/src/agents/source.ts`        |
| Classification guidelines prompt           | `knowledge-agent-template/packages/agent/src/prompts/router.ts`       |
| Sunder's current gateway constants         | `src/lib/ai/gateway.ts`                                               |
| Sunder's runner (where routing lands)      | `src/lib/runner/run-agent.ts` — `const modelId = TIER_1_MODEL` (line 124) |
