/**
 * Read-only detail page for a predefined skill bundle.
 *
 * @module app/(dashboard)/skills/[slug]/page
 */
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveClientId } from "@/lib/chat/client-id";
import { listInstalledSkillSlugs } from "@/lib/runner/skills/list-installed-skill-slugs";
import { listPredefinedSkills } from "@/lib/runner/skills/list-predefined-skills";
import { createClient } from "@/lib/supabase/server";

import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";
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
  const skillMarkdown = predefinedBundle?.files.find((file) => file.relativePath.endsWith("SKILL.md"))?.content ?? "";
  const isInstalled = installedSkillSlugs.includes(slug);

  if (!predefinedSkill || !predefinedBundle) {
    notFound();
  }

  return (
    <div className="px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{predefinedSkill.name}</h1>
              <Badge variant="secondary">
                {isInstalled ? "Installed" : "Recommended"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">{predefinedSkill.description}</p>
            <p className="text-muted-foreground text-xs">
              Skill slug: <code>{predefinedSkill.slug}</code>
              {predefinedSkill.latestVersion ? ` · v${predefinedSkill.latestVersion.slice(0, 8)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SkillInstallButton
              isInstalled={isInstalled}
              slug={predefinedSkill.slug}
              variant={isInstalled ? "outline" : "default"}
            />
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              href="/skills"
            >
              Back
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Definition</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-sm">
              {skillMarkdown}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
