/**
 * Skills list page — displays all user instruction skills with edit links.
 * @module app/(dashboard)/skills/page
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveClientId } from "@/lib/chat/client-id";
import { discoverUserSkills } from "@/lib/runner/skills/discover-skills";
import { createClient } from "@/lib/supabase/server";

export default async function SkillsPage() {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const skills = await discoverUserSkills(supabase, clientId);

  return (
    <div className="px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="text-muted-foreground text-sm">
            Workflow guides that tell your agent how to handle recurring tasks.
            Edit any skill to customize it.
          </p>
        </div>

        {skills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No skills yet. Ask your agent to create one by describing a workflow.
          </p>
        ) : (
          <div className="grid gap-3">
            {skills.map((skill) => (
              <Card key={skill.slug}>
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{skill.name}</CardTitle>
                    <CardDescription>{skill.description}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/skills/${skill.slug}`}>Edit</Link>
                  </Button>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
