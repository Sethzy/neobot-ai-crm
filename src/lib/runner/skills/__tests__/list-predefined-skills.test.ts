/**
 * Tests for listPredefinedSkills.
 *
 * @module lib/runner/skills/__tests__/list-predefined-skills.test
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listPredefinedSkills } from "../list-predefined-skills";

describe("listPredefinedSkills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "predefined-skills-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns metadata for each slug in the registry", async () => {
    const bundleRoot = path.join(tmpDir, "skills");
    fs.mkdirSync(path.join(bundleRoot, "call-prep"), { recursive: true });
    fs.writeFileSync(
      path.join(bundleRoot, "call-prep", "SKILL.md"),
      ["---", "name: call-prep", "description: Preps calls.", "---", "body"].join("\n"),
    );

    const registryPath = path.join(tmpDir, "skill-registry.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "call-prep": {
          skillId: "skill_cp",
          displayTitle: "sunder-skill:call-prep",
          latestVersion: "v-999",
        },
      }),
    );

    const result = await listPredefinedSkills({ bundleRoot, registryPath });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      slug: "call-prep",
      name: "call-prep",
      description: "Preps calls.",
      latestVersion: "v-999",
      skillId: "skill_cp",
    });
  });
});
