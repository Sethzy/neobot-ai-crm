/**
 * Tests for loadManagedAgentSkills, the registry reader used by
 * create-agent.ts.
 *
 * @module scripts/managed-agents/__tests__/load-managed-agent-skills.test
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadManagedAgentSkills } from "../load-managed-agent-skills";

describe("loadManagedAgentSkills", () => {
  let tmpDir: string;
  let registryPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-agent-skills-"));
    registryPath = path.join(tmpDir, "skill-registry.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("merges the 4 anthropic built-ins with custom skills from the registry", () => {
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "call-prep": {
          skillId: "skill_cp",
          displayTitle: "sunder-skill:call-prep",
          latestVersion: "v-1",
        },
        onboarding: {
          skillId: "skill_ob",
          displayTitle: "sunder-skill:onboarding",
          latestVersion: "v-1",
        },
      }),
    );

    const skills = loadManagedAgentSkills(registryPath);

    expect(skills).toContainEqual({ type: "anthropic", skill_id: "xlsx" });
    expect(skills).toContainEqual({ type: "anthropic", skill_id: "docx" });
    expect(skills).toContainEqual({ type: "anthropic", skill_id: "pptx" });
    expect(skills).toContainEqual({ type: "anthropic", skill_id: "pdf" });
    expect(skills).toContainEqual({ type: "custom", skill_id: "skill_cp", version: "latest" });
    expect(skills).toContainEqual({ type: "custom", skill_id: "skill_ob", version: "latest" });
    expect(skills).toHaveLength(6);
  });

  it("throws if the combined list would exceed 20 skills", () => {
    const registry: Record<
      string,
      { skillId: string; displayTitle: string; latestVersion: string }
    > = {};

    for (let index = 0; index < 25; index += 1) {
      registry[`skill-${index}`] = {
        skillId: `skill_${index}`,
        displayTitle: `sunder-skill:skill-${index}`,
        latestVersion: "v-1",
      };
    }

    fs.writeFileSync(registryPath, JSON.stringify(registry));

    expect(() => loadManagedAgentSkills(registryPath)).toThrow(/20/);
  });

  it("throws if the registry file is missing", () => {
    expect(() => loadManagedAgentSkills(path.join(tmpDir, "missing.json"))).toThrow(
      /skill-registry\.json/i,
    );
  });
});
