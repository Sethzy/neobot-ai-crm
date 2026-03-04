/**
 * Tests for thread title generation from user messages.
 * @module lib/chat/__tests__/thread-title
 */
import { describe, expect, it } from "vitest";

import { generateThreadTitle } from "../thread-title";

describe("generateThreadTitle", () => {
  it("returns the first line of a short message as-is", () => {
    expect(generateThreadTitle("What are the latest deals?")).toBe(
      "What are the latest deals?",
    );
  });

  it("truncates messages longer than 50 characters with ellipsis", () => {
    const longMessage =
      "Can you help me find the latest transacted prices for Riveredge at 18 Tanjong Rhu Road?";
    const title = generateThreadTitle(longMessage);

    expect(title.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(title).toMatch(/\.\.\.$/);
  });

  it("uses only the first line of multiline messages", () => {
    const multiline = "First line here\nSecond line\nThird line";

    expect(generateThreadTitle(multiline)).toBe("First line here");
  });

  it("trims whitespace from the message", () => {
    expect(generateThreadTitle("  hello world  ")).toBe("hello world");
  });

  it("returns null for empty or whitespace-only messages", () => {
    expect(generateThreadTitle("")).toBeNull();
    expect(generateThreadTitle("   ")).toBeNull();
  });
});
