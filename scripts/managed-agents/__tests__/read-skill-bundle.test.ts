/**
 * Tests for readSkillBundle, the pure disk-reading helper used by the
 * upload script and dashboard loaders for predefined skill bundles.
 *
 * Uses a temp directory so tests don't depend on the real
 * managed-agents/skills authoring state.
 *
 * @module scripts/managed-agents/__tests__/read-skill-bundle.test
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readSkillBundle } from "../read-skill-bundle";

describe("readSkillBundle", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skill-bundle-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("reads SKILL.md and extracts frontmatter name and description", async () => {
    const slugDir = path.join(tmpRoot, "call-prep");
    fs.mkdirSync(slugDir);
    fs.writeFileSync(
      path.join(slugDir, "SKILL.md"),
      [
        "---",
        "name: call-prep",
        "description: Prepares the user for an upcoming client call. Use when the user asks to prep for a call.",
        "---",
        "",
        "# Call Prep",
        "",
        "Body content here.",
      ].join("\n"),
    );

    const bundle = await readSkillBundle(slugDir);

    expect(bundle.slug).toBe("call-prep");
    expect(bundle.frontmatter.name).toBe("call-prep");
    expect(bundle.frontmatter.description).toMatch(/^Prepares the user/);
    expect(bundle.files).toHaveLength(1);
    expect(bundle.files[0]?.relativePath).toBe("call-prep/SKILL.md");
  });

  it("includes reference files under the bundle directory", async () => {
    const slugDir = path.join(tmpRoot, "pipeline-review");
    fs.mkdirSync(path.join(slugDir, "reference"), { recursive: true });
    fs.writeFileSync(
      path.join(slugDir, "SKILL.md"),
      [
        "---",
        "name: pipeline-review",
        "description: Reviews pipeline health.",
        "---",
        "# body",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(slugDir, "reference", "criteria.md"), "# Criteria\n");

    const bundle = await readSkillBundle(slugDir);

    const paths = bundle.files.map((file) => file.relativePath).sort();
    expect(paths).toEqual([
      "pipeline-review/SKILL.md",
      "pipeline-review/reference/criteria.md",
    ]);
  });

  it("throws if SKILL.md is missing", async () => {
    const slugDir = path.join(tmpRoot, "broken");
    fs.mkdirSync(slugDir);

    await expect(readSkillBundle(slugDir)).rejects.toThrow(/SKILL\.md/);
  });

  it("throws if frontmatter name does not match the directory name", async () => {
    const slugDir = path.join(tmpRoot, "call-prep");
    fs.mkdirSync(slugDir);
    fs.writeFileSync(
      path.join(slugDir, "SKILL.md"),
      ["---", "name: wrong-name", "description: stuff.", "---", "# body"].join("\n"),
    );

    await expect(readSkillBundle(slugDir)).rejects.toThrow(/name.*call-prep/i);
  });

  const repoSkillSlugs = [
    "onboarding",
    "call-prep",
    "daily-briefing",
    "draft-outreach",
    "pipeline-review",
    "opportunity-analysis",
    "call-summary",
    "market-briefing",
    "deal-comparison",
    "property-showcase",
    "market-report",
  ] as const;

  for (const slug of repoSkillSlugs) {
    it(`reads the real ${slug} bundle from the repo`, async () => {
      const bundle = await readSkillBundle(
        path.join(process.cwd(), "managed-agents", "skills", slug),
      );

      expect(bundle.slug).toBe(slug);
      expect(bundle.frontmatter.description.length).toBeGreaterThan(0);
      expect(bundle.frontmatter.description.length).toBeLessThanOrEqual(1024);

      const skillFile = bundle.files.find((file) => file.relativePath.endsWith("SKILL.md"));
      expect(skillFile).toBeDefined();
      expect(skillFile?.content.split("\n").length).toBeLessThan(500);
    });
  }
});
