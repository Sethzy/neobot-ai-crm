/**
 * Skills dashboard list view for predefined and customized playbooks.
 *
 * @module app/(dashboard)/skills/page
 */
import path from "node:path";

import { resolveClientId } from "@/lib/chat/client-id";
import { discoverUserSkills } from "@/lib/runner/skills/discover-skills";
import { readForkMetadata } from "@/lib/runner/skills/fork-metadata";
import { listPredefinedSkills } from "@/lib/runner/skills/list-predefined-skills";
import { createClient } from "@/lib/supabase/server";

import { CustomizedCard } from "./customized-card";
import { PredefinedCard } from "./predefined-card";

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

  const [predefinedSkills, customizedSkills] = await Promise.all([
    listPredefinedSkills({ bundleRoot, registryPath }),
    discoverUserSkills(supabase, clientId),
  ]);
  const customizedBySlug = new Map(customizedSkills.map((skill) => [skill.slug, skill]));
  const cards = await Promise.all(
    predefinedSkills.map(async (skill) => {
      const isCustomized = customizedBySlug.has(skill.slug);

      if (!isCustomized) {
        return {
          kind: "predefined" as const,
          skill,
        };
      }

      const fork = await readForkMetadata(supabase, clientId, skill.slug);
      return {
        kind: "customized" as const,
        skill,
        fork,
        isOutdated: fork !== null && fork.forkedFromVersion !== skill.latestVersion,
      };
    }),
  );

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playbooks</h1>
          <p className="text-muted-foreground text-sm">
            Sunder ships with predefined workflows. Duplicate any playbook to
            customize it for your own workflow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) =>
            card.kind === "predefined" ? (
              <PredefinedCard key={card.skill.slug} skill={card.skill} />
            ) : (
              <CustomizedCard
                key={card.skill.slug}
                skill={card.skill}
                fork={card.fork}
                isOutdated={card.isOutdated}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
