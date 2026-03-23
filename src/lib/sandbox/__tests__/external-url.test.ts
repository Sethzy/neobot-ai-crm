/**
 * Tests for safe runner-side external URL fetching.
 * @module lib/sandbox/__tests__/external-url
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mockLookup,
}));

import { assertSafeExternalUrl, fetchSafeExternalResource } from "../external-url";

describe("assertSafeExternalUrl", () => {
  it("rejects IPv6-mapped loopback addresses", () => {
    expect(() => assertSafeExternalUrl("http://[::ffff:127.0.0.1]/x")).toThrow(
      'Blocked private or unsafe URL "http://[::ffff:127.0.0.1]/x".',
    );
  });
});

describe("fetchSafeExternalResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects hostnames that resolve to private IP space", async () => {
    const fetchSpy = vi.fn();

    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchSafeExternalResource("https://example.com/file.xlsx")).rejects.toThrow(
      'Blocked private or unsafe URL "https://example.com/file.xlsx".',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches public URLs with redirect blocking enabled", async () => {
    const response = { ok: true };
    const fetchSpy = vi.fn().mockResolvedValue(response);

    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchSafeExternalResource("https://example.com/file.xlsx")).resolves.toBe(
      response,
    );
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/file.xlsx", {
      redirect: "error",
    });
  });
});
