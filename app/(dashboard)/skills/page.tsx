/**
 * Skills dashboard — compact catalog view with search, installed and
 * recommended sections. Server component fetches data, delegates rendering
 * to the client-side SkillsCatalog.
 *
 * @module app/(dashboard)/skills/page
 */
import path from "node:path";

import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  getInstalledSkills,
  listRecommendedSkills,
} from "@/lib/runner/skills/get-installed-skills";
import { listPredefinedSkills } from "@/lib/runner/skills/list-predefined-skills";
import { createClient } from "@/lib/supabase/server";

import { SkillsCatalog } from "./skills-catalog";

export default async function SkillsPage() {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const bundleRoot = path.join(process.cwd(), "managed-agents", "skills");
  const registryPath = path.join(
    process.cwd(),
    "scripts",
    "managed-agents",
    "skill-registry.json",
  );

  const [predefinedSkills, installedSkills, recommendedSkills] =
    await Promise.all([
      listPredefinedSkills({ bundleRoot, registryPath }),
      getInstalledSkills(supabase, clientId),
      listRecommendedSkills(supabase, clientId),
    ]);
  const predefinedBySlug = new Map(
    predefinedSkills.map((skill) => [skill.slug, skill]),
  );
  const installedCards = installedSkills.map((skill) => ({
    isInstalled: true as const,
    skill: {
      ...skill,
      latestVersion: predefinedBySlug.get(skill.slug)?.latestVersion ?? null,
    },
  }));
  const recommendedCards = recommendedSkills.map((skill) => ({
    isInstalled: false as const,
    skill: {
      ...skill,
      latestVersion: predefinedBySlug.get(skill.slug)?.latestVersion ?? null,
    },
  }));

  return (
    <PageCanvas contentClassName="max-w-4xl gap-5">
      <PageHeader
        title="Skills"
        description="Give your agent specialized capabilities with reusable skill blocks."
        descriptionClassName="measure-copy"
      />

      <SkillsCatalog
        installedCards={installedCards}
        recommendedCards={recommendedCards}
      />
    </PageCanvas>
  );
}
