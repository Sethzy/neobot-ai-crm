/**
 * Uploads every predefined skill bundle under `managed-agents/skills/` to the
 * Anthropic org. The upload is idempotent: missing skills are created, and
 * existing skills receive a new version. The resulting registry is written to
 * `scripts/managed-agents/skill-registry.json`.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/upload-custom-skills.ts
 *
 * @module scripts/managed-agents/upload-custom-skills
 */
import fs from "node:fs";
import path from "node:path";

import Anthropic, { toFile } from "@anthropic-ai/sdk";

import { readSkillBundle, type SkillBundle } from "./read-skill-bundle";

const SKILLS_DIR = path.join(process.cwd(), "managed-agents", "skills");
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "managed-agents", "skill-registry.json");
const DISPLAY_TITLE_PREFIX = "sunder-skill:";
const SKILLS_BETA = "skills-2025-10-02";

export interface SkillRegistryEntry {
  skillId: string;
  displayTitle: string;
  /** Anthropic `latest_version` captured at the most recent upload. */
  latestVersion: string;
}

export type SkillRegistry = Record<string, SkillRegistryEntry>;

type UploadClient = Pick<Anthropic, "beta">;

export async function runUpload(
  client: UploadClient,
  bundles: SkillBundle[],
): Promise<SkillRegistry> {
  const existingByDisplayTitle = new Map<string, string>();

  for await (const skill of client.beta.skills.list({
    source: "custom",
    betas: [SKILLS_BETA],
  })) {
    if (skill.display_title) {
      existingByDisplayTitle.set(skill.display_title, skill.id);
    }
  }

  const registry: SkillRegistry = {};

  for (const bundle of bundles) {
    const displayTitle = `${DISPLAY_TITLE_PREFIX}${bundle.slug}`;
    const files = await Promise.all(
      bundle.files.map((file) =>
        toFile(Buffer.from(file.content, "utf8"), file.relativePath, {
          type: guessMimeType(file.relativePath),
        })),
    );

    const existingSkillId = existingByDisplayTitle.get(displayTitle);

    if (existingSkillId) {
      try {
        const version = await client.beta.skills.versions.create(existingSkillId, {
          files,
          betas: [SKILLS_BETA],
        });

        registry[bundle.slug] = {
          skillId: existingSkillId,
          displayTitle,
          latestVersion: version.version,
        };

        console.log(`  bumped: ${bundle.slug} -> ${version.version}`);
      } catch (error) {
        if (!isVersionCreateTopLevelFolderError(error)) {
          throw error;
        }

        await deleteSkillAndVersions(client, existingSkillId);

        const recreated = await client.beta.skills.create({
          display_title: displayTitle,
          files,
          betas: [SKILLS_BETA],
        });

        registry[bundle.slug] = {
          skillId: recreated.id,
          displayTitle,
          latestVersion: recreated.latest_version ?? "unknown",
        };

        console.log(`  recreated: ${bundle.slug} (${recreated.id})`);
      }

      continue;
    }

    const created = await client.beta.skills.create({
      display_title: displayTitle,
      files,
      betas: [SKILLS_BETA],
    });

    registry[bundle.slug] = {
      skillId: created.id,
      displayTitle,
      latestVersion: created.latest_version ?? "unknown",
    };

    console.log(`  created: ${bundle.slug} (${created.id})`);
  }

  return registry;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });
  const bundleDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SKILLS_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const bundles: SkillBundle[] = [];
  for (const bundleDir of bundleDirs) {
    bundles.push(await readSkillBundle(bundleDir));
  }

  console.log(`Uploading ${bundles.length} skill bundles...`);
  const registry = await runUpload(client, bundles);

  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Wrote ${REGISTRY_PATH}`);
  console.log("Next: pnpm tsx scripts/managed-agents/create-agent.ts");
}

function guessMimeType(relativePath: string): string {
  if (relativePath.endsWith(".md")) {
    return "text/markdown";
  }

  if (relativePath.endsWith(".json")) {
    return "application/json";
  }

  return "text/plain";
}

function isVersionCreateTopLevelFolderError(error: unknown): boolean {
  return (
    error instanceof Error
    && error.message.includes("SKILL.md file must be exactly in the top-level folder")
  );
}

async function deleteSkillAndVersions(client: UploadClient, skillId: string): Promise<void> {
  const versions: string[] = [];

  for await (const version of client.beta.skills.versions.list(skillId, {
    betas: [SKILLS_BETA],
  })) {
    versions.push(version.version);
  }

  for (const version of versions) {
    await client.beta.skills.versions.delete(version, {
      skill_id: skillId,
      betas: [SKILLS_BETA],
    });
  }

  await client.beta.skills.delete(skillId, {
    betas: [SKILLS_BETA],
  });
}

if (process.env.VITEST !== "true") {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
