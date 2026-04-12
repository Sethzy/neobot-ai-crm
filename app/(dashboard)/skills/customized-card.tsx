/**
 * Card for a predefined skill that the user has customized.
 *
 * @module app/(dashboard)/skills/customized-card
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
import type { ForkMetadata } from "@/lib/runner/skills/fork-metadata";
import type { PredefinedSkillSummary } from "@/lib/runner/skills/list-predefined-skills";

import { resetSkillAction } from "./actions";
import { UpdateAvailableBanner } from "./update-available-banner";

interface CustomizedCardProps {
  skill: PredefinedSkillSummary;
  fork: ForkMetadata | null;
  isOutdated: boolean;
}

export function CustomizedCard({ skill, fork, isOutdated }: CustomizedCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{skill.slug}</CardTitle>
            <p className="text-muted-foreground text-xs">
              Customized
              {fork ? ` · forked from v${fork.forkedFromVersion.slice(0, 8)}` : ""}
            </p>
          </div>
        </div>
        <CardDescription>{skill.description}</CardDescription>
        {isOutdated && fork ? (
          <UpdateAvailableBanner
            slug={skill.slug}
            currentForkVersion={fork.forkedFromVersion}
            latestVersion={skill.latestVersion}
          />
        ) : null}
      </CardHeader>
      <CardFooter className="flex gap-2">
        <Button size="sm" asChild>
          <Link href={`/skills/${skill.slug}`}>Edit</Link>
        </Button>
        <form action={resetSkillAction.bind(null, skill.slug)}>
          <Button type="submit" size="sm" variant="outline">
            Reset
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
