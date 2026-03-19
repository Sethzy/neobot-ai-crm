/**
 * Skill editor page — loads a single skill's content for editing.
 * @module app/(dashboard)/skills/[slug]/page
 */
import { notFound } from "next/navigation";

import { resolveClientId } from "@/lib/chat/client-id";
import { getSkillContent } from "@/lib/runner/skills/discover-skills";
import { isDefaultSkillSlug } from "@/lib/runner/skills/skill-templates";
import { createClient } from "@/lib/supabase/server";

import { SkillEditorForm } from "./skill-editor-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SkillEditorPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const skill = await getSkillContent(supabase, clientId, slug);

  if (!skill) notFound();

  return (
    <div className="px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl">
        <SkillEditorForm
          slug={slug}
          initialContent={skill.content}
          canReset={isDefaultSkillSlug(slug)}
        />
      </div>
    </div>
  );
}
