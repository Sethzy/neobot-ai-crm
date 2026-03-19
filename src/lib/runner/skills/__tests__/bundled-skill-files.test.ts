/**
 * Tests for bundled skill asset URL resolution.
 * @module lib/runner/skills/__tests__/bundled-skill-files
 */
import { readFile } from "fs/promises";
import { describe, expect, it } from "vitest";

import {
  getBundledDefaultSkillPath,
  getBundledSystemSkillPath,
} from "../bundled-skill-files";

describe("bundled skill asset paths", () => {
  it("returns a readable path for a bundled default skill", async () => {
    const filePath = getBundledDefaultSkillPath("call-prep");
    const content = await readFile(filePath, "utf-8");

    expect(content).toContain("# Call Prep");
    expect(content).toContain("search_crm");
  });

  it("returns a readable path for a bundled system skill", async () => {
    const filePath = getBundledSystemSkillPath("creating-connections/SKILL.md");

    expect(filePath).not.toBeNull();
    const content = await readFile(filePath!, "utf-8");

    expect(content).toContain("# Creating New Connections");
    expect(content).toContain("create_new_connections");
  });

  it("returns null for an unknown bundled system skill path", () => {
    expect(getBundledSystemSkillPath("unknown/SKILL.md")).toBeNull();
  });
});
