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
    expect(SYSTEM_PROMPT).toContain("Shall I go ahead?");
  });

  it("mentions all three tool categories", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("crm");
    expect(lower).toContain("file storage");
    expect(lower).toContain("web");
  });

  it("instructs agent to skip preambles before tool calls", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("skip preambles");
  });

  it("instructs agent not to expose tool names to user", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain(
      "do not mention tool names",
    );
  });

  it("instructs agent to search before creating", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("search before creating");
  });

  it("instructs agent to ask one follow-up question at a time", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain(
      "one follow-up question at a time",
    );
  });

  it("covers approval for all write action categories", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("creating or updating contacts");
    expect(lower).toContain("creating or updating deals");
    expect(lower).toContain("logging interactions");
    expect(lower).toContain("creating or updating tasks");
    expect(lower).toContain("linking or unlinking contacts");
    expect(lower).toContain("batch-creating");
  });
});
