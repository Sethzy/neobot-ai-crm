/**
 * Tests for system prompt content and safety instructions.
 * @module lib/ai/__tests__/system-prompt
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

  it("includes CRM mutation approval instructions", () => {
    expect(SYSTEM_PROMPT).toContain("ask the user for confirmation");
  });

  it("includes example approval interaction", () => {
    expect(SYSTEM_PROMPT).toContain("Should I go ahead?");
  });

  it("lists the write tool names that require approval", () => {
    const writeTools = [
      "create_contact",
      "update_contact",
      "create_deal",
      "update_deal",
      "create_interaction",
      "create_task",
      "update_task",
    ];

    for (const tool of writeTools) {
      expect(SYSTEM_PROMPT).toContain(tool);
    }
  });
});
