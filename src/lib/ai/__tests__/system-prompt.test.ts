/**
 * @fileoverview Tests for the placeholder system prompt used in PR1 chat streaming.
 */

import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

describe("SYSTEM_PROMPT", () => {
  it("exports a non-empty string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions real estate context", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("real estate");
  });

  it("mentions singapore context", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("singapore");
  });

  it("sets concise and practical response expectations", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("concise");
    expect(lower).toContain("practical");
  });
});
