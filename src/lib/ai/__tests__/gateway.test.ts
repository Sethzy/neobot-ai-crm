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

  it("uses the approved gemini-3-flash tier-1 model id", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const { TIER_1_MODEL } = await import("@/lib/ai/gateway");
    expect(TIER_1_MODEL).toBe("google/gemini-3-flash");
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
    const model = getLanguageModel("minimax/minimax-m2.7");

    expect(model).toBeDefined();
    expect(model.modelId).toBe("minimax/minimax-m2.7");
  });
});
