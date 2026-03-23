/**
 * Tests for Sprites SDK lifecycle helpers.
 * @module lib/sandbox/__tests__/sprites-client
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateSprite,
  mockExecFile,
  mockSprite,
  mockSpritesClient,
} = vi.hoisted(() => {
  const mockExecFile = vi.fn();
  const mockSprite = vi.fn();
  const mockCreateSprite = vi.fn();
  const mockSpritesClient = vi.fn();

  return { mockCreateSprite, mockExecFile, mockSprite, mockSpritesClient };
});

vi.mock("@fly/sprites", () => ({
  SpritesClient: mockSpritesClient,
}));

import { getOrCreateSprite, getSpritesClient, validateSpritesEnv } from "../sprites-client";

describe("sprites-client helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSprite.mockImplementation((name: string) => ({
      name,
      execFile: mockExecFile,
    }));
    mockCreateSprite.mockImplementation(async (name: string) => ({
      name,
      execFile: mockExecFile,
    }));
    mockSpritesClient.mockImplementation(function MockSpritesClient() {
      return {
      sprite: mockSprite,
      createSprite: mockCreateSprite,
      };
    });
  });

  it("throws when SPRITES_TOKEN is missing", () => {
    expect(() => validateSpritesEnv({})).toThrow("SPRITES_TOKEN");
  });

  it("reuses the same SpritesClient instance across calls", () => {
    const firstClient = getSpritesClient("sprite-token");
    const secondClient = getSpritesClient("sprite-token");

    expect(firstClient).toBe(secondClient);
    expect(mockSpritesClient).toHaveBeenCalledTimes(1);
    expect(mockSpritesClient).toHaveBeenCalledWith("sprite-token");
  });

  it("creates a new sprite when the thread has no prior sprite", async () => {
    const result = await getOrCreateSprite({
      token: "sprite-token",
      spriteName: "thread-abc12345",
    });

    expect(result.isNew).toBe(true);
    expect(result.spriteName).toBe("thread-abc12345");
    expect(mockCreateSprite).toHaveBeenCalledWith("thread-abc12345");
    expect(mockSprite).not.toHaveBeenCalled();
  });

  it("reuses an existing reachable sprite for follow-up work", async () => {
    mockExecFile.mockResolvedValue({ stdout: "ok\n", stderr: "", exitCode: 0 });

    const result = await getOrCreateSprite({
      token: "sprite-token",
      existingSpriteName: "thread-abc12345",
      spriteName: "thread-abc12345",
    });

    expect(result.isNew).toBe(false);
    expect(result.spriteName).toBe("thread-abc12345");
    expect(mockSprite).toHaveBeenCalledWith("thread-abc12345");
    expect(mockExecFile).toHaveBeenCalledWith("echo", ["ok"]);
    expect(mockCreateSprite).not.toHaveBeenCalled();
  });

  it("creates a fresh sprite when the existing one cannot be reached", async () => {
    mockExecFile.mockRejectedValueOnce(new Error("sprite not found"));

    const result = await getOrCreateSprite({
      token: "sprite-token",
      existingSpriteName: "thread-stale",
      spriteName: "thread-fresh",
    });

    expect(result.isNew).toBe(true);
    expect(result.spriteName).toBe("thread-fresh");
    expect(mockSprite).toHaveBeenCalledWith("thread-stale");
    expect(mockCreateSprite).toHaveBeenCalledWith("thread-fresh");
  });
});
