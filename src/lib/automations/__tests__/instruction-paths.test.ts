import { describe, expect, it } from "vitest";

import {
  parseAutomationSkillReference,
  skillStoragePath,
  toAutomationInstructionDisplayPath,
  toAutomationInstructionRuntimePath,
  toAutomationInstructionStoragePath,
} from "../instruction-paths";

describe("instruction-paths", () => {
  it("recognizes skill slugs from legacy storage references", () => {
    expect(parseAutomationSkillReference("skills/daily-briefing")).toEqual({
      slug: "daily-briefing",
    });
  });

  it("recognizes canonical skill file paths", () => {
    expect(
      parseAutomationSkillReference("/agent/skills/daily-briefing/SKILL.md"),
    ).toEqual({
      slug: "daily-briefing",
    });
    expect(
      parseAutomationSkillReference("/workspace/skills/daily-briefing"),
    ).toEqual({
      slug: "daily-briefing",
    });
  });

  it("normalizes skill references into canonical storage paths", () => {
    expect(toAutomationInstructionStoragePath("skills/daily-briefing")).toBe(
      "skills/daily-briefing/SKILL.md",
    );
    expect(skillStoragePath("daily-briefing")).toBe("skills/daily-briefing/SKILL.md");
  });

  it("maps skill-backed automations to an editor path under /agent", () => {
    expect(toAutomationInstructionDisplayPath("skills/daily-briefing")).toBe(
      "/agent/skills/daily-briefing/SKILL.md",
    );
  });

  it("maps skill-backed automations to the managed-agent runtime mount", () => {
    expect(toAutomationInstructionRuntimePath("skills/daily-briefing")).toBe(
      "/workspace/skills/daily-briefing/SKILL.md",
    );
  });

  it("leaves regular storage-backed instructions under /agent", () => {
    expect(
      toAutomationInstructionDisplayPath("state/triggers/daily-briefing.md"),
    ).toBe("/agent/state/triggers/daily-briefing.md");
    expect(
      toAutomationInstructionRuntimePath("state/triggers/daily-briefing.md"),
    ).toBe("/agent/state/triggers/daily-briefing.md");
  });
});
