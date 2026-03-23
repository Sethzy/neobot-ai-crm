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

    expect(getSpritesToken()).toBe("sprite-token");
    expect(isSandboxConfigured()).toBe(true);
  });

  it("returns null and false when sprites token is missing", () => {
    vi.stubEnv("SPRITES_TOKEN", "");

    expect(getSpritesToken()).toBeNull();
    expect(isSandboxConfigured()).toBe(false);
  });
});
