"use server";
/**
 * Server actions for the `/skills` dashboard.
 *
 * @module app/(dashboard)/skills/actions
 */
import path from "node:path";

import { revalidatePath } from "next/cache";

import {
  installSkill,
  uninstallSkill,
} from "@/lib/runner/skills/skill-actions";
import { readSkillBundle } from "../../../scripts/managed-agents/read-skill-bundle";

function revalidateSkillRoutes(slug: string): void {
  revalidatePath("/skills");
  revalidatePath(`/skills/${slug}`);
}

export async function installSkillAction(slug: string): Promise<void> {
  const result = await installSkill(slug);

  if (!result.success) {
    throw new Error(result.error ?? `Failed to install skill "${slug}".`);
  }

  revalidateSkillRoutes(slug);
}

export async function uninstallSkillAction(slug: string): Promise<void> {
  const result = await uninstallSkill(slug);

  if (!result.success) {
    throw new Error(result.error ?? `Failed to uninstall skill "${slug}".`);
  }

  revalidateSkillRoutes(slug);
}

/** Fetches the SKILL.md body (frontmatter stripped) for a given slug. */
export async function fetchSkillMarkdown(
  slug: string,
): Promise<string | null> {
  const bundleRoot = path.join(process.cwd(), "managed-agents", "skills");

  try {
    const bundle = await readSkillBundle(path.join(bundleRoot, slug));
    const skillFile = bundle.files.find((f) =>
      f.relativePath.endsWith("SKILL.md"),
    );

    if (!skillFile) return null;

    // Strip YAML frontmatter
    const stripped = skillFile.content.replace(
      /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/u,
      "",
    );
    return stripped.trim();
  } catch {
    return null;
  }
}
