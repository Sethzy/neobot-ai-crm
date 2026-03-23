/**
 * Tests for sandbox environment helpers.
 * @module lib/sandbox/__tests__/env
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSpritesToken, isSandboxConfigured } from "../env";

describe("sandbox env helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the trimmed sprites token when configured", () => {
    vi.stubEnv("SPRITES_TOKEN", "  sprite-token  ");
    vi.stubEnv("ANTHROPIC_API_KEY", "  sk-test-key  ");

    expect(getSpritesToken()).toBe("sprite-token");
    expect(isSandboxConfigured()).toBe(true);
  });

  it("returns null and false when sprites token is missing", () => {
    vi.stubEnv("SPRITES_TOKEN", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");

    expect(getSpritesToken()).toBeNull();
    expect(isSandboxConfigured()).toBe(false);
  });

  it("returns false when the Claude API key is missing", () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(isSandboxConfigured()).toBe(false);
  });
});
