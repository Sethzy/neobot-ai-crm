/**
 * Tests for platform instructions constant.
 * @module lib/ai/__tests__/platform-instructions
 */
import { describe, expect, it } from "vitest";

import { PLATFORM_INSTRUCTIONS } from "../platform-instructions";

describe("PLATFORM_INSTRUCTIONS", () => {
  it("is a non-empty string", () => {
    expect(typeof PLATFORM_INSTRUCTIONS).toBe("string");
    expect(PLATFORM_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it("contains state directory convention", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("state");
  });

  it("contains SQL database guidance", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("sql");
  });

  it("contains tasks/todo guidance", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("todo");
  });

  it("contains guarded rename_chat instruction", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("rename_chat");
    expect(PLATFORM_INSTRUCTIONS).toContain("untitled");
  });

  it("does not duplicate memory-system section from SYSTEM_PROMPT", () => {
    expect(PLATFORM_INSTRUCTIONS).not.toContain("<memory-system>");
    expect(PLATFORM_INSTRUCTIONS).not.toContain("SOUL.md — your personality and identity");
  });

  it("does not duplicate tool-usage section from SYSTEM_PROMPT", () => {
    expect(PLATFORM_INSTRUCTIONS).not.toContain("<tool-usage>");
  });

  it("does not duplicate approval-required section from SYSTEM_PROMPT", () => {
    expect(PLATFORM_INSTRUCTIONS).not.toContain("<approval-required>");
  });
});
