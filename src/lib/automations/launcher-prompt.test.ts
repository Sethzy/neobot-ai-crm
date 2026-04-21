/**
 * Tests for the Automations launcher prompt helper.
 * @module lib/automations/launcher-prompt.test
 */
import { describe, expect, it } from "vitest";

import { buildAutomationLauncherPrompt } from "./launcher-prompt";

describe("buildAutomationLauncherPrompt", () => {
  it("prefixes the trimmed request with automation framing", () => {
    expect(buildAutomationLauncherPrompt("  daily pipeline summary  ")).toBe(
      "Create an automation: daily pipeline summary",
    );
  });

  it("returns an empty string for blank requests", () => {
    expect(buildAutomationLauncherPrompt("   ")).toBe("");
  });
});
