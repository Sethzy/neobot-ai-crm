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
 * Matches the existing Tier 1 runtime default.
 */
export const DEFAULT_CHAT_MODEL = "google/gemini-3-flash";

/** Cookie name used to persist the user's last selected chat model across /chat loads. */
export const CHAT_MODEL_COOKIE_NAME = "chat-model";

/** One-year cookie lifetime for the persisted chat-model preference. */
export const CHAT_MODEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Initial user-selectable chat models for the v1 selector. */
export const chatModels: ChatModel[] = [
  {
    id: "google/gemini-3-flash",
    name: "Gemini Flash 3",
    provider: "google",
    description: "Fast and cost-effective for everyday work",
    cost: 1,
    pricing: { inputPerM: 0.50, outputPerM: 3.00, cacheReadPerM: 0.125 },
  },
  {
    id: "minimax/minimax-m2.7",
    name: "MiniMax M2.7",
    provider: "minimax",
    description: "Better suited for deep analysis and code-heavy tasks",
    cost: 2,
    pricing: { inputPerM: 0.30, outputPerM: 1.20, cacheReadPerM: 0.06 },
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
