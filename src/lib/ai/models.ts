/**
 * @fileoverview Chat model catalog and helper utilities for user-selected chat models.
 */

/** Per-token pricing in USD per 1 million tokens. */
export interface ModelPricing {
  /** Cost per 1M non-cached input tokens. */
  inputPerM: number;
  /** Cost per 1M output tokens. */
  outputPerM: number;
  /** Cost per 1M cache-read input tokens. */
  cacheReadPerM: number;
}

export interface ChatModel {
  /** Vercel AI Gateway model ID. */
  id: string;
  /** Human-readable label shown in the picker. */
  name: string;
  /** Provider slug used for provider logos. */
  provider: string;
  /** Short helper copy shown in the selector list. */
  description: string;
  /** Relative cost tier displayed as repeated '$' signs (1 = $, 2 = $$, etc.). */
  cost: number;
  /** Per-token pricing for LLM cost tracking. */
  pricing: ModelPricing;
}

/**
 * Default user-facing chat model for Sunder's main chat surface.
 *
 * Post-Managed-Agents-migration note: this ID is only used for the UI
 * picker catalog, the `chat-model` cookie, and the `selectedChatModel`
 * validation gate in `/api/chat`. The actual runtime model is pinned
 * server-side by the `ANTHROPIC_AGENT_VERSION` (currently Sonnet 4.6,
 * see `scripts/managed-agents/create-agent.ts`). The picker is a label
 * today; it becomes a real switch only once Haiku is added via a second
 * managed-agent version + `selectedChatModel` plumbing through
 * `session-kickoff.ts` and `adapter.ts`.
 */
export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4-6";

/** Cookie name used to persist the user's last selected chat model across /chat loads. */
export const CHAT_MODEL_COOKIE_NAME = "chat-model";

/** One-year cookie lifetime for the persisted chat-model preference. */
export const CHAT_MODEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * User-selectable chat models. Single entry today — Haiku is planned as a
 * second entry once the Managed Agents plumbing supports per-session
 * model selection. Pricing mirrors the constants in
 * `src/lib/managed-agents/adapter-cost.ts`.
 */
export const chatModels: ChatModel[] = [
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Balanced model for everyday work and complex tasks",
    cost: 2,
    pricing: { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3 },
  },
];

/** Fast validation set derived from the catalog. */
export const allowedModelIds = new Set(chatModels.map((model) => model.id));

/** Pricing lookup by model ID. Returns `null` for unknown models. */
const pricingByModelId = new Map(chatModels.map((m) => [m.id, m.pricing]));
export function getModelPricing(modelId: string): ModelPricing | null {
  return pricingByModelId.get(modelId) ?? null;
}

/**
 * Resolves a possibly-invalid selected model to a safe runtime model ID.
 * The route performs explicit 400 validation; this helper is the defensive fallback.
 */
export function resolveModelId(modelId: string | undefined): string {
  if (modelId && allowedModelIds.has(modelId)) {
    return modelId;
  }

  return DEFAULT_CHAT_MODEL;
}
