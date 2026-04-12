/**
 * Skill detail page for predefined/customized playbooks.
 *
 * @module app/(dashboard)/skills/[slug]/page
 */
import path from "node:path";
import { notFound } from "next/navigation";

import { resolveClientId } from "@/lib/chat/client-id";
import { getSkillContent } from "@/lib/runner/skills/discover-skills";
import { listPredefinedSkills } from "@/lib/runner/skills/list-predefined-skills";
import { createClient } from "@/lib/supabase/server";

import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";

import { SkillEditorForm } from "./skill-editor-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SkillEditorPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const bundleRoot = path.join(process.cwd(), "managed-agents", "skills");
  const registryPath = path.join(
    process.cwd(),
    "scripts",
    "managed-agents",
    "skill-registry.json",
  );
  const [customizedSkill, predefinedSkills] = await Promise.all([
    getSkillContent(supabase, clientId, slug),
    listPredefinedSkills({ bundleRoot, registryPath }),
  ]);
  const predefinedSkill = predefinedSkills.find((skill) => skill.slug === slug);
  const predefinedBundle = predefinedSkill
    ? await readSkillBundle(path.join(bundleRoot, slug))
    : null;

  if (!customizedSkill && !predefinedSkill) {
    notFound();
  }

  return (
    <div className="px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl">
        <SkillEditorForm
          slug={slug}
          initialContent={customizedSkill?.content ?? ""}
          predefinedContent={predefinedBundle?.files.find((file) => file.relativePath.endsWith("SKILL.md"))?.content ?? ""}
          isCustomized={customizedSkill !== null}
        />
      </div>
    </div>
  );
}
