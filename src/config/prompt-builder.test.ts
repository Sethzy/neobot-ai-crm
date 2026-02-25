/**
 * @file Prompt builder tests
 */
import { describe, expect, it } from "vitest";
import { buildSplitterPrompt } from "./prompt-builder";
import { defaultConfig } from "./clients/default";
import type { ClientConfig } from "./types";

describe("buildSplitterPrompt", () => {
  it("includes role section", () => {
    const prompt = buildSplitterPrompt(defaultConfig);

    expect(prompt).toContain("# Role");
    expect(prompt).toContain("intelligent document splitter");
  });

  it("includes all tag IDs in available types line", () => {
    const prompt = buildSplitterPrompt(defaultConfig);

    expect(prompt).toContain("invoices | reports | contracts | images | correspondence | other");
  });

  it("includes classification hints for each tag", () => {
    const prompt = buildSplitterPrompt(defaultConfig);

    expect(prompt).toContain("## CLASSIFICATION HINTS");
    expect(prompt).toContain("- **invoices**: Bills, invoices");
    expect(prompt).toContain("- **other**: Documents that don't fit");
  });
});

describe("buildSplitterPrompt with custom config", () => {
  it("uses custom tag IDs and hints", () => {
    const customConfig: ClientConfig = {
      id: "test-client",
      name: "Test Client",
      tags: [
        {
          id: "medical_bill",
          displayName: "Medical Bill",
          classificationHint: "Hospital bills with patient info and charges",
          extendProcessorId: "dp_001",
        },
        {
          id: "prescription",
          displayName: "Prescription",
          classificationHint: "Medication prescriptions from doctors",
          extendProcessorId: "dp_002",
        },
      ],
    };

    const prompt = buildSplitterPrompt(customConfig);

    expect(prompt).toContain("medical_bill | prescription");
    expect(prompt).toContain("- **medical_bill**: Hospital bills with patient info");
    expect(prompt).toContain("- **prescription**: Medication prescriptions");
    expect(prompt).not.toContain("invoices");
  });
});
