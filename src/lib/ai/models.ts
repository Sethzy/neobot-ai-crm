/**
 * @fileoverview Chat model catalog and helper utilities for user-selected chat models.
 */
import { getModelTokenPricing } from "@/lib/managed-agents/adapter-cost";

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
  /** User-friendly tier label (e.g. "Basic", "Advanced", "Expert"). */
  tier: string;
  /** Short model name for the badge (e.g. "Haiku 4.5"). */
  shortName: string;
  /** Provider slug used for provider logos. */
  provider: string;
  /** Short helper copy shown in the selector list. */
  description: string;
  /** Relative cost tier displayed as repeated '$' signs (1 = $, 2 = $$, etc.). */
  cost: number;
  /** Per-token pricing for LLM cost tracking. */
  pricing: ModelPricing;
}

/** Default user-facing chat model for NeoBot's main chat surface. */
export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4-6";

/** Cookie name used to persist the user's last selected chat model across /chat loads. */
export const CHAT_MODEL_COOKIE_NAME = "chat-model";

/** One-year cookie lifetime for the persisted chat-model preference. */
export const CHAT_MODEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Strips `cacheCreationPerM` (internal cost bucket) from the full pricing for UI display. */
function uiPricing(anthropicModelId: string): ModelPricing {
  const { inputPerM, outputPerM, cacheReadPerM } = getModelTokenPricing(anthropicModelId);
  return { inputPerM, outputPerM, cacheReadPerM };
}

/**
 * User-selectable chat models. Each entry maps to a separate Anthropic
 * Managed Agent (same tools, same system prompt, different `model` field).
 */
export const chatModels: ChatModel[] = [
  {
    id: "anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    tier: "Basic",
    shortName: "Haiku 4.5",
    provider: "anthropic",
    description: "Fast and cost-effective for frequent tasks",
    cost: 1,
    pricing: uiPricing("claude-haiku-4-5"),
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    tier: "Advanced",
    shortName: "Sonnet 4.6",
    provider: "anthropic",
    description: "Balanced thinking for most tasks",
    cost: 2,
    pricing: uiPricing("claude-sonnet-4-6"),
  },
  {
    id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    tier: "Expert",
    shortName: "Opus 4.6",
    provider: "anthropic",
    description: "Smartest model for complex tasks",
    cost: 3,
    pricing: uiPricing("claude-opus-4-6"),
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
