/**
 * Integration tests for bundled instruction skill defaults.
 * @module lib/runner/skills/__tests__/skill-integration
 */
import { readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../discover-skills";

describe("bundled instruction skills", () => {
  const defaultsDirectory = join(__dirname, "..", "defaults");

  it("ships seven defaults with valid frontmatter", async () => {
    const slugs = readdirSync(defaultsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(slugs).toHaveLength(7);

    for (const slug of slugs) {
      const content = await readFile(join(defaultsDirectory, slug, "SKILL.md"), "utf-8");
      const metadata = parseFrontmatter(content);

      expect(metadata, `${slug}/SKILL.md should have valid frontmatter`).not.toBeNull();
      expect(metadata?.name, `${slug} frontmatter name should match slug`).toBe(slug);
      expect(metadata?.description.length, `${slug} description should not be empty`).toBeGreaterThan(10);
    }
  });

  it("references only universally available tools", async () => {
    const forbiddenReferences = ["send_message", "browse_website", "conn_"];
    const slugs = readdirSync(defaultsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const slug of slugs) {
      const content = await readFile(join(defaultsDirectory, slug, "SKILL.md"), "utf-8");

      for (const forbiddenReference of forbiddenReferences) {
        expect(
          content.includes(forbiddenReference),
          `${slug}/SKILL.md must not reference "${forbiddenReference}"`,
        ).toBe(false);
      }
    }
  });
});
