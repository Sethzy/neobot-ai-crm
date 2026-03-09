/**
 * Tests for bundled system skill file resolution.
 * @module lib/runner/skills/__tests__/system-skills
 */
import { describe, expect, it } from "vitest";

import { getSystemSkillContent, isSystemSkillPath } from "../system-skills";

describe("isSystemSkillPath", () => {
  it("returns true for skills/system/ prefixed paths", () => {
    expect(isSystemSkillPath("skills/system/creating-connections/SKILL.md")).toBe(true);
  });

  it("returns true for nested system skill paths", () => {
    expect(
      isSystemSkillPath("skills/system/creating-connections/create-direct-api-connection.md"),
    ).toBe(true);
  });

  it("returns false for per-connection skill paths", () => {
    expect(isSystemSkillPath("skills/connections/conn-123/SKILL.md")).toBe(false);
  });

  it("returns false for non-skill paths", () => {
    expect(isSystemSkillPath("memory/MEMORY.md")).toBe(false);
  });

  it("returns false for the bare skills/ prefix without system/", () => {
    expect(isSystemSkillPath("skills/gmail/SKILL.md")).toBe(false);
  });
});

describe("getSystemSkillContent", () => {
  it("returns content for the creating-connections SKILL.md", async () => {
    const content = await getSystemSkillContent(
      "skills/system/creating-connections/SKILL.md",
    );

    expect(content).not.toBeNull();
    expect(content).toContain("# Creating New Connections");
    expect(content).toContain("create_new_connections");
  });

  it("returns content for the direct API connection guide", async () => {
    const content = await getSystemSkillContent(
      "skills/system/creating-connections/create-direct-api-connection.md",
    );

    expect(content).not.toBeNull();
    expect(content).toContain("Direct API");
    expect(content).toContain("authConfig");
  });

  it("returns null for unknown system skill paths", async () => {
    const content = await getSystemSkillContent(
      "skills/system/nonexistent/SKILL.md",
    );

    expect(content).toBeNull();
  });

  it("returns null for non-system-skill paths", async () => {
    const content = await getSystemSkillContent("memory/MEMORY.md");

    expect(content).toBeNull();
  });

  it("returns null for path traversal attempts", async () => {
    const content = await getSystemSkillContent(
      "skills/system/../../../etc/passwd",
    );

    expect(content).toBeNull();
  });
});
