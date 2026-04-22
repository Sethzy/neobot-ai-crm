/**
 * Read-only detail page for a predefined skill bundle.
 *
 * @module app/(dashboard)/skills/[slug]/page
 */
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveClientId } from "@/lib/chat/client-id";
import { listInstalledSkillSlugs } from "@/lib/runner/skills/list-installed-skill-slugs";
import { listPredefinedSkills } from "@/lib/runner/skills/list-predefined-skills";
import { createClient } from "@/lib/supabase/server";

import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";
import { SkillMarkdownViewer } from "../skill-markdown-viewer";
import { SkillInstallButton } from "../skill-install-button";

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
  const [installedSkillSlugs, predefinedSkills] = await Promise.all([
    listInstalledSkillSlugs(supabase, clientId),
    listPredefinedSkills({ bundleRoot, registryPath }),
  ]);
  const predefinedSkill = predefinedSkills.find((skill) => skill.slug === slug);
  const predefinedBundle = predefinedSkill
    ? await readSkillBundle(path.join(bundleRoot, slug))
    : null;
  const rawSkillMarkdown = predefinedBundle?.files.find((file) => file.relativePath.endsWith("SKILL.md"))?.content ?? "";
  const skillMarkdown = rawSkillMarkdown.replace(
    /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/u,
    "",
  ).trim();
  const isInstalled = installedSkillSlugs.includes(slug);

  if (!predefinedSkill || !predefinedBundle) {
    notFound();
  }

  return (
    <PageCanvas>
        <PageHeader
          title={predefinedSkill.name}
          description={predefinedSkill.description}
          meta={
            <>
              <Badge variant="secondary">
                {isInstalled ? "Installed" : "Recommended"}
              </Badge>
              <span className="type-row-meta">
                Skill slug: <code>{predefinedSkill.slug}</code>
                {predefinedSkill.latestVersion
                  ? ` · v${predefinedSkill.latestVersion.slice(0, 8)}`
                  : ""}
              </span>
            </>
          }
          actions={
            <>
              <SkillInstallButton
                isInstalled={isInstalled}
                slug={predefinedSkill.slug}
                variant={isInstalled ? "outline" : "default"}
              />
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md px-4 type-control text-muted-foreground transition-colors hover:text-foreground"
                href="/skills"
              >
                Back
              </Link>
            </>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="type-section-title">Definition</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillMarkdownViewer content={skillMarkdown} />
          </CardContent>
        </Card>
    </PageCanvas>
  );
}
