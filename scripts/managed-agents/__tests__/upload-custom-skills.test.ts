/**
 * Unit tests for the upload-custom-skills orchestration function.
 *
 * Tests the pure `runUpload(client, bundles)` export instead of the CLI
 * wrapper. The Anthropic client is injected so we can keep the tests fast and
 * deterministic.
 *
 * @module scripts/managed-agents/__tests__/upload-custom-skills.test
 */
import { describe, expect, it, vi } from "vitest";

import type { SkillBundle } from "../read-skill-bundle";
import { runUpload } from "../upload-custom-skills";

function makeBundle(slug: string): SkillBundle {
  return {
    slug,
    frontmatter: {
      name: slug,
      description: `Does ${slug} work.`,
    },
    files: [
      {
        relativePath: `${slug}/SKILL.md`,
        absolutePath: `/tmp/${slug}/SKILL.md`,
        content: `---\nname: ${slug}\ndescription: Does ${slug} work.\n---\n# ${slug}\n`,
      },
    ],
  };
}

function makeFakeClient(
  existingSkills: Array<{ id: string; display_title: string; latest_version: string }>,
  options?: { failVersionCreate?: boolean },
) {
  const created: Array<{ display_title: string; files: unknown[]; betas: string[] }> = [];
  const deleted: Array<{ skill_id: string; betas: string[] }> = [];
  const deletedVersions: Array<{ skill_id: string; version: string; betas: string[] }> = [];
  const versioned: Array<{ skill_id: string; files: unknown[]; betas: string[] }> = [];

  const fakeClient = {
    beta: {
      skills: {
        list: vi.fn(async function* () {
          for (const skill of existingSkills) {
            yield skill;
          }
        }),
        create: vi.fn(
          async (params: { display_title: string; files: unknown[]; betas: string[] }) => {
            created.push(params);
            return {
              id: `skill_${params.display_title.replace(/\W/g, "").toLowerCase()}`,
              display_title: params.display_title,
              latest_version: `v-${Date.now()}`,
              source: "custom",
              type: "skill",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          },
        ),
        versions: {
          list: vi.fn(async function* (skillId: string) {
            const existing = existingSkills.find((skill) => skill.id === skillId);
            if (!existing) {
              return;
            }

            yield {
              skill_id: skillId,
              version: existing.latest_version,
            };
          }),
          create: vi.fn(
            async (skillId: string, params: { files: unknown[]; betas: string[] }) => {
              if (options?.failVersionCreate) {
                throw new Error("SKILL.md file must be exactly in the top-level folder.");
              }
              versioned.push({ skill_id: skillId, files: params.files, betas: params.betas });
              return {
                id: `sv_${Date.now()}`,
                skill_id: skillId,
                version: `v-${Date.now()}`,
                name: "x",
                description: "x",
                directory: "x",
                type: "skill_version",
                created_at: new Date().toISOString(),
              };
            },
          ),
          delete: vi.fn(
            async (version: string, params: { skill_id: string; betas: string[] }) => {
              deletedVersions.push({
                skill_id: params.skill_id,
                version,
                betas: params.betas,
              });
              return { id: version, type: "skill_version_deleted", deleted: true };
            },
          ),
        },
        delete: vi.fn(async (skillId: string, params: { betas: string[] }) => {
          deleted.push({ skill_id: skillId, betas: params.betas });
          return { id: skillId, deleted: true, type: "skill_deleted" };
        }),
      },
    },
  };

  return {
    fakeClient,
    created,
    deleted,
    deletedVersions,
    versioned,
  };
}

describe("runUpload", () => {
  it("creates new skills for bundles whose display title is not in the org", async () => {
    const { fakeClient, created, versioned } = makeFakeClient([]);

    const registry = await runUpload(fakeClient as never, [
      makeBundle("call-prep"),
      makeBundle("daily-briefing"),
    ]);

    expect(created).toHaveLength(2);
    expect(versioned).toHaveLength(0);
    expect(registry["call-prep"]).toEqual(
      expect.objectContaining({
        skillId: expect.stringMatching(/^skill_/),
        latestVersion: expect.any(String),
      }),
    );
    expect(registry["daily-briefing"]).toBeDefined();
  });

  it("bumps the version for bundles whose display title already exists", async () => {
    const { fakeClient, created, versioned } = makeFakeClient([
      {
        id: "skill_abc",
        display_title: "sunder-skill:call-prep",
        latest_version: "v-old",
      },
    ]);

    const registry = await runUpload(fakeClient as never, [makeBundle("call-prep")]);

    expect(created).toHaveLength(0);
    expect(versioned).toHaveLength(1);
    expect(versioned[0]?.skill_id).toBe("skill_abc");
    expect(registry["call-prep"]?.skillId).toBe("skill_abc");
    expect(registry["call-prep"]?.latestVersion).not.toBe("v-old");
  });

  it("writes each bundle latestVersion into the returned registry", async () => {
    const { fakeClient } = makeFakeClient([]);

    const registry = await runUpload(fakeClient as never, [makeBundle("call-prep")]);

    expect(registry["call-prep"]?.latestVersion).toMatch(/^v-/);
  });

  it("recreates the skill when Anthropic rejects versions.create for top-level-folder validation", async () => {
    const { fakeClient, created, deleted, deletedVersions, versioned } = makeFakeClient(
      [
        {
          id: "skill_old",
          display_title: "sunder-skill:call-prep",
          latest_version: "v-old",
        },
      ],
      { failVersionCreate: true },
    );

    const registry = await runUpload(fakeClient as never, [makeBundle("call-prep")]);

    expect(versioned).toHaveLength(0);
    expect(deletedVersions).toEqual([
      {
        skill_id: "skill_old",
        version: "v-old",
        betas: ["skills-2025-10-02"],
      },
    ]);
    expect(deleted).toEqual([{ skill_id: "skill_old", betas: ["skills-2025-10-02"] }]);
    expect(created).toHaveLength(1);
    expect(registry["call-prep"]?.skillId).toMatch(/^skill_/);
    expect(registry["call-prep"]?.skillId).not.toBe("skill_old");
  });
});
