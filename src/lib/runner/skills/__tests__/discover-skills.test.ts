/**
 * Tests for instruction skill frontmatter parsing and discovery.
 * @module lib/runner/skills/__tests__/discover-skills
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { discoverUserSkills, parseFrontmatter } from "../discover-skills";

describe("parseFrontmatter", () => {
  it("extracts name and description from valid frontmatter", () => {
    const content = `---
name: call-prep
description: Prepare for a client meeting with CRM history and talking points.
---

# Call Prep Workflow

1. Search CRM for the client...`;

    const result = parseFrontmatter(content);

    expect(result).toEqual({
      name: "call-prep",
      description: "Prepare for a client meeting with CRM history and talking points.",
    });
  });

  it("returns null for missing frontmatter", () => {
    expect(parseFrontmatter("# No frontmatter here\n\nJust markdown.")).toBeNull();
  });

  it("returns null when name is missing", () => {
    const content = `---
description: Some description
---

Content here.`;

    expect(parseFrontmatter(content)).toBeNull();
  });

  it("returns null when description is missing", () => {
    const content = `---
name: some-skill
---

Content here.`;

    expect(parseFrontmatter(content)).toBeNull();
  });

  it("handles multiline descriptions", () => {
    const content = `---
name: draft-outreach
description: >
  Research a prospect and draft personalized outreach.
  Uses web research and CRM data.
---

Content.`;

    const result = parseFrontmatter(content);

    expect(result?.description).toContain("Research a prospect");
    expect(result?.description).toContain("CRM data");
  });

  it("handles quoted descriptions with special characters", () => {
    const content = `---
name: market-briefing
description: "Weekly market update: prices, launches & policy changes"
---

Content.`;

    expect(parseFrontmatter(content)?.description).toBe(
      "Weekly market update: prices, launches & policy changes",
    );
  });
});

function createMockSupabase(
  listResults: Record<string, Array<{ name: string; id?: string | null }>>,
  downloadResults: Record<string, string>,
) {
  return {
    storage: {
      from: () => ({
        list: vi.fn(async (path: string) => ({
          data: (listResults[path] ?? []).map((entry) => ({
            id: null,
            ...entry,
          })),
          error: null,
        })),
        download: vi.fn(async (path: string) => {
          const content = downloadResults[path];

          if (!content) {
            return { data: null, error: { message: "Not found" } };
          }

          return {
            data: { text: async () => content },
            error: null,
          };
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

describe("discoverUserSkills", () => {
  it("discovers user skills, excluding system and connections", async () => {
    const supabase = createMockSupabase(
      {
        "client-1/skills": [
          { name: "system" },
          { name: "connections" },
          { name: "call-prep" },
          { name: "daily-briefing" },
        ],
      },
      {
        "client-1/skills/call-prep/SKILL.md": `---
name: call-prep
description: Prepare for a client meeting.
---
# Call Prep`,
        "client-1/skills/daily-briefing/SKILL.md": `---
name: daily-briefing
description: Morning briefing with tasks.
---
# Daily Briefing`,
      },
    );

    const skills = await discoverUserSkills(supabase, "client-1");

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      slug: "call-prep",
      path: "/agent/skills/call-prep/SKILL.md",
    });
    expect(skills[1]).toMatchObject({
      slug: "daily-briefing",
      path: "/agent/skills/daily-briefing/SKILL.md",
    });
  });

  it("returns an empty array when no user skills exist", async () => {
    const supabase = createMockSupabase(
      {
        "client-1/skills": [{ name: "system" }, { name: "connections" }],
      },
      {},
    );

    await expect(discoverUserSkills(supabase, "client-1")).resolves.toEqual([]);
  });

  it("skips skills with invalid frontmatter", async () => {
    const supabase = createMockSupabase(
      {
        "client-1/skills": [{ name: "good" }, { name: "bad" }],
      },
      {
        "client-1/skills/good/SKILL.md": `---
name: good
description: A good skill.
---
# Good`,
        "client-1/skills/bad/SKILL.md": "# No frontmatter",
      },
    );

    const skills = await discoverUserSkills(supabase, "client-1");

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("good");
  });

  it("returns an empty array when listing storage fails", async () => {
    const supabase = {
      storage: {
        from: () => ({
          list: vi.fn(async () => ({ data: null, error: { message: "fail" } })),
        }),
      },
    } as unknown as SupabaseClient;

    await expect(discoverUserSkills(supabase, "client-1")).resolves.toEqual([]);
  });

  it("ignores files at the skills root and only discovers directory entries", async () => {
    const supabase = createMockSupabase(
      {
        "client-1/skills": [
          { name: "call-prep", id: "file-1" },
          { name: "daily-briefing", id: null },
        ],
      },
      {
        "client-1/skills/daily-briefing/SKILL.md": `---
name: daily-briefing
description: Morning briefing with tasks.
---
# Daily Briefing`,
      },
    );

    const skills = await discoverUserSkills(supabase, "client-1");

    expect(skills).toEqual([
      expect.objectContaining({
        slug: "daily-briefing",
        path: "/agent/skills/daily-briefing/SKILL.md",
      }),
    ]);
  });
});
