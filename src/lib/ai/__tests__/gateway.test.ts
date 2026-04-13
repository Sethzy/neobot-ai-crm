/**
 * @fileoverview Tests for the AI Gateway module used by the v1 chat endpoint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AI Gateway module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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

  it("pins TIER_1_MODEL to google/gemini-3-flash for higher-quality helper calls", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { TIER_1_MODEL } = await import("@/lib/ai/gateway");
    expect(TIER_1_MODEL).toBe("google/gemini-3-flash");
  });

  it("pins COMPACTION_MODEL to google/gemini-2.5-flash-lite for cheap helper calls", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { COMPACTION_MODEL } = await import("@/lib/ai/gateway");
    expect(COMPACTION_MODEL).toBe("google/gemini-2.5-flash-lite");
  });

  it("returns a model object when called with a provider/model id", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { gateway } = await import("@/lib/ai/gateway");
    const model = gateway("google/gemini-3-flash");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("google/gemini-3-flash");
  });

  it("always enables automatic gateway caching even without BYOK", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    delete process.env.GEMINI_API_KEY;

    const { gatewayProviderOptions } = await import("@/lib/ai/gateway");
    expect(gatewayProviderOptions).toEqual({
      gateway: {
        caching: "auto",
      },
    });
  });

  it("merges Google BYOK into the cached gateway options when configured", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "gemini-key";

    const { gatewayProviderOptions } = await import("@/lib/ai/gateway");
    expect(gatewayProviderOptions).toEqual({
      gateway: {
        caching: "auto",
        byok: {
          google: [{ apiKey: "gemini-key" }],
        },
      },
    });
  });

  it("exposes getLanguageModel for runtime model selection", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";

    const { getLanguageModel } = await import("@/lib/ai/gateway");
    const model = getLanguageModel("anthropic/claude-sonnet-4-6");

    expect(model).toBeDefined();
    expect(model.modelId).toBe("anthropic/claude-sonnet-4-6");
  });
});
