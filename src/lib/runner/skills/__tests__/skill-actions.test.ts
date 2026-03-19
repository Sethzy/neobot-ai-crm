/**
 * Tests for skill content validation logic.
 * Server actions (saveSkillContent, resetSkillToDefault) are integration-tested via browser.
 * @module lib/runner/skills/__tests__/skill-actions
 */
import { describe, expect, it } from "vitest";

import { validateSkillContent } from "../discover-skills";

describe("validateSkillContent", () => {
  it("accepts valid SKILL.md with name and description", () => {
    const content = `---
name: my-skill
description: Does something useful.
---

# My Skill`;
    const result = validateSkillContent(content);
    expect(result.valid).toBe(true);
  });

  it("rejects content with missing frontmatter", () => {
    const result = validateSkillContent("# No frontmatter here");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("frontmatter");
    }
  });

  it("rejects content with missing name", () => {
    const content = `---
description: Some description
---

# Skill`;
    const result = validateSkillContent(content);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("name");
    }
  });

  it("rejects content with missing description", () => {
    const content = `---
name: my-skill
---

# Skill`;
    const result = validateSkillContent(content);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("description");
    }
  });

  it("rejects empty content", () => {
    const result = validateSkillContent("");
    expect(result.valid).toBe(false);
  });
});
