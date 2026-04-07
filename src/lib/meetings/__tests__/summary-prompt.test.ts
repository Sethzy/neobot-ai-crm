import { describe, expect, it } from "vitest";

import { buildSummaryPrompt } from "../summary-prompt";

describe("buildSummaryPrompt", () => {
  it("includes the transcript in the prompt", () => {
    const result = buildSummaryPrompt("Hello world transcript", "");

    expect(result).toContain("Hello world transcript");
  });

  it("includes user notes when provided", () => {
    const result = buildSummaryPrompt("transcript text", "call back Thursday");

    expect(result).toContain("call back Thursday");
  });

  it("handles empty notes gracefully", () => {
    const result = buildSummaryPrompt("transcript text", "");

    expect(result).toContain("## User Notes");
    expect(result).toContain("(No notes taken)");
  });

  it("includes the system instruction header", () => {
    const result = buildSummaryPrompt("transcript", "notes");

    expect(result).toContain("busy sales professional");
    expect(result).toContain("bullet-point summary");
  });
});
