/**
 * Tests for the Composio client singleton.
 * @module lib/composio/__tests__/client
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockComposioConstructor, mockVercelProviderConstructor } = vi.hoisted(() => ({
  mockComposioConstructor: vi.fn(),
  mockVercelProviderConstructor: vi.fn(),
}));

vi.mock("@composio/core", () => ({
  Composio: mockComposioConstructor,
}));

vi.mock("@composio/vercel", () => ({
  VercelProvider: mockVercelProviderConstructor,
}));

describe("getComposio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.COMPOSIO_API_KEY;
    mockVercelProviderConstructor.mockImplementation(function MockVercelProvider() {
      return { provider: "vercel" };
    });
    mockComposioConstructor.mockImplementation(function MockComposio(config) {
      return {
        config,
        tools: { get: vi.fn() },
      };
    });
  });

  it("throws when COMPOSIO_API_KEY is missing", async () => {
    const { getComposio } = await import("../client");

    expect(() => getComposio()).toThrow("Missing COMPOSIO_API_KEY.");
  });

  it("creates one singleton with a VercelProvider and allowTracking disabled", async () => {
    process.env.COMPOSIO_API_KEY = " test-key ";

    const { getComposio } = await import("../client");
    const firstClient = getComposio();
    const secondClient = getComposio();

    expect(firstClient).toBe(secondClient);
    expect(mockVercelProviderConstructor).toHaveBeenCalledTimes(1);
    expect(mockComposioConstructor).toHaveBeenCalledTimes(1);
    expect(mockComposioConstructor).toHaveBeenCalledWith({
      apiKey: "test-key",
      provider: { provider: "vercel" },
      allowTracking: false,
    });
  });
});
