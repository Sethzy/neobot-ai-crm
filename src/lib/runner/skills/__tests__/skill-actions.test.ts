/**
 * Tests for skill content validation logic.
 * The delete-only reset helper is unit-tested here because it now owns the
 * recursive storage cleanup for user overrides.
 * @module lib/runner/skills/__tests__/skill-actions
 */
import { describe, expect, it, vi } from "vitest";

import { deleteSkillOverride, validateSkillContent } from "../skill-actions";

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

function makeStorageMock(initial: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    store,
    from: vi.fn(() => ({
      list: vi.fn(async (prefix: string) => {
        const directChildren = new Map<string, { name: string; id: string | null }>();

        for (const fullPath of store.keys()) {
          if (!fullPath.startsWith(`${prefix}/`)) {
            continue;
          }

          const remainder = fullPath.slice(prefix.length + 1);
          const [childName, ...rest] = remainder.split("/");
          if (!childName) {
            continue;
          }

          directChildren.set(childName, {
            name: childName,
            id: rest.length === 0 ? fullPath : null,
          });
        }

        return { data: Array.from(directChildren.values()), error: null };
      }),
      remove: vi.fn(async (paths: string[]) => {
        for (const storagePath of paths) {
          store.delete(storagePath);
        }
        return { data: null, error: null };
      }),
    })),
  };
}

describe("deleteSkillOverride", () => {
  it("removes every file under the user's skill folder", async () => {
    const storage = makeStorageMock({
      "client-1/skills/market-report/SKILL.md": "user content",
      "client-1/skills/market-report/reference/criteria.md": "user criteria",
      "client-1/skills/market-report/_fork.json": '{"forkedFromVersion":"v1","forkedAt":"t"}',
    });
    const supabase = { storage } as never;

    await deleteSkillOverride({ supabase, clientId: "client-1", slug: "market-report" });

    expect(storage.store.has("client-1/skills/market-report/SKILL.md")).toBe(false);
    expect(storage.store.has("client-1/skills/market-report/reference/criteria.md")).toBe(false);
    expect(storage.store.has("client-1/skills/market-report/_fork.json")).toBe(false);
  });

  it("throws when storage listing fails during reset", async () => {
    const supabase = {
      storage: {
        from: vi.fn(() => ({
          list: vi.fn(async () => ({
            data: null,
            error: { message: "storage unavailable" },
          })),
        })),
      },
    } as never;

    await expect(
      deleteSkillOverride({ supabase, clientId: "client-1", slug: "market-report" }),
    ).rejects.toThrow(/storage unavailable/u);
  });
});
