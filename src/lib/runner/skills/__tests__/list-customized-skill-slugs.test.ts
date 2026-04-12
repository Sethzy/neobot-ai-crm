/**
 * Tests for listCustomizedSkillSlugs.
 *
 * @module lib/runner/skills/__tests__/list-customized-skill-slugs.test
 */
import { describe, expect, it, vi } from "vitest";

import { listCustomizedSkillSlugs } from "../list-customized-skill-slugs";

function makeStorageMock(files: string[]) {
  return {
    from: vi.fn((_bucket: string) => ({
      list: vi.fn(async (prefix: string) => {
        const items = files
          .filter((file) => file.startsWith(`${prefix}/`))
          .map((file) => ({
            name: file.slice(prefix.length + 1).split("/")[0],
            id: null,
          }));
        const unique = Array.from(new Map(items.map((item) => [item.name, item])).values());
        return { data: unique, error: null };
      }),
      download: vi.fn(async (storagePath: string) => {
        if (files.includes(storagePath)) {
          return { data: new Blob(["x"]), error: null };
        }

        return { data: null, error: { message: "not found", status: 404 } };
      }),
    })),
  };
}

describe("listCustomizedSkillSlugs", () => {
  it("returns slugs that have a SKILL.md file under the user's skills folder", async () => {
    const supabase = {
      storage: makeStorageMock([
        "client-1/skills/call-prep/SKILL.md",
        "client-1/skills/pipeline-review/SKILL.md",
        "client-1/skills/pipeline-review/_fork.json",
      ]),
    } as never;

    const result = await listCustomizedSkillSlugs(supabase, "client-1");

    expect(result.sort()).toEqual(["call-prep", "pipeline-review"]);
  });

  it("returns an empty array when the user has no customized skills", async () => {
    const supabase = { storage: makeStorageMock([]) } as never;

    const result = await listCustomizedSkillSlugs(supabase, "client-1");

    expect(result).toEqual([]);
  });

  it("ignores slugs that only have a _fork.json but no SKILL.md", async () => {
    const supabase = {
      storage: makeStorageMock(["client-1/skills/orphan/_fork.json"]),
    } as never;

    const result = await listCustomizedSkillSlugs(supabase, "client-1");

    expect(result).toEqual([]);
  });
});
