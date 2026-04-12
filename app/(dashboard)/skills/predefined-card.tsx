/**
 * Card for a predefined, not-yet-customized skill.
 *
 * @module app/(dashboard)/skills/predefined-card
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PredefinedSkillSummary } from "@/lib/runner/skills/list-predefined-skills";

import { duplicateSkillAction } from "./actions";

export function PredefinedCard({ skill }: { skill: PredefinedSkillSummary }) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{skill.slug}</CardTitle>
            <p className="text-muted-foreground text-xs">
              Predefined · v{skill.latestVersion.slice(0, 8)}
            </p>
          </div>
        </div>
        <CardDescription>{skill.description}</CardDescription>
      </CardHeader>
      <CardFooter className="flex gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/skills/${skill.slug}`}>View</Link>
        </Button>
        <form action={duplicateSkillAction.bind(null, skill.slug)}>
          <Button type="submit" size="sm" variant="outline">
            Duplicate
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
