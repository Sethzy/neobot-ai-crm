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

  it("includes the anti-hallucination instruction", () => {
    const result = buildSummaryPrompt("transcript", "notes");

    expect(result).toContain("Only extract information explicitly stated");
  });

  it("includes extraction instructions for structured sections", () => {
    const result = buildSummaryPrompt("transcript", "notes");

    expect(result).toContain("Key Discussion Points");
    expect(result).toContain("Action Items");
    expect(result).toContain("Client Concerns");
    expect(result).toContain("Personal Details");
    expect(result).toContain("Next Steps");
  });

  it("instructs to return empty arrays when sections have no content", () => {
    const result = buildSummaryPrompt("transcript", "");

    expect(result).toContain("empty array");
  });
});
