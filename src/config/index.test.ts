/**
 * @file Config index exports tests
 */
import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_THRESHOLD,
  getClientConfig,
  getAvailableConfigIds,
  buildSplitterPrompt,
  validateExtraction,
  defaultConfig,
} from "./index";

describe("config index exports", () => {
  it("exports CONFIDENCE_THRESHOLD", () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.85);
  });

  it("exports getClientConfig", () => {
    expect(typeof getClientConfig).toBe("function");
    expect(getClientConfig("default").id).toBe("default");
  });

  it("exports getAvailableConfigIds", () => {
    expect(typeof getAvailableConfigIds).toBe("function");
    expect(getAvailableConfigIds()).toContain("default");
  });

  it("exports buildSplitterPrompt", () => {
    expect(typeof buildSplitterPrompt).toBe("function");
  });

  it("exports validateExtraction", () => {
    expect(typeof validateExtraction).toBe("function");
  });

  it("exports defaultConfig", () => {
    expect(defaultConfig.id).toBe("default");
  });
});
