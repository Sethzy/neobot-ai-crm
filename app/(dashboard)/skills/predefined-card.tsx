/**
 * Compact row card for a skill in the catalog UI. Matches the competitor's
 * dense, scannable layout: icon dot + name + category badges + truncated
 * description + inline action.
 *
 * @module app/(dashboard)/skills/predefined-card
 */
import { Badge } from "@/components/ui/badge";
import type { InstalledSkillSummary } from "@/lib/runner/skills/get-installed-skills";

import { SkillInstallButton } from "./skill-install-button";

/** Static slug → display category. Keeps badge labelling out of the DB. */
export const SKILL_CATEGORIES: Record<string, string> = {
  "call-prep": "Productivity",
  "call-summary": "Productivity",
  "daily-briefing": "Productivity",
  "deal-comparison": "Research",
  "docx": "Documents",
  "draft-outreach": "Outreach",
  "market-briefing": "Research",
  "market-report": "Research",
  "onboarding": "Setup",
  "opportunity-analysis": "Research",
  "pdf": "Documents",
  "pipeline-review": "Productivity",
  "pptx": "Documents",
  "property-showcase": "Outreach",
  "xlsx": "Documents",
};

/** Category → dot color using semantic tokens. */
const CATEGORY_DOT_CLASSES: Record<string, string> = {
  Productivity: "bg-warning",
  Research: "bg-info",
  Documents: "bg-success",
  Outreach: "bg-tag",
  Setup: "bg-stage-negotiation",
};

export interface SkillCardData {
  isInstalled: boolean;
  skill: InstalledSkillSummary & { latestVersion?: string | null };
}

interface PredefinedCardProps {
  isInstalled: boolean;
  skill: InstalledSkillSummary & { latestVersion?: string | null };
  onSelect?: () => void;
  /** Called on mouse enter — used by the catalog to prefetch markdown. */
  onHover?: () => void;
}

export function PredefinedCard({ isInstalled, skill, onSelect, onHover }: PredefinedCardProps) {
  const category = SKILL_CATEGORIES[skill.slug];
  const dotColor = category
    ? (CATEGORY_DOT_CLASSES[category] ?? "bg-primary")
    : "bg-primary";

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 transition-colors hover:bg-accent/40" onMouseEnter={onHover}>
      {/* Colored dot icon — color varies by category */}
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${dotColor}`}
      />

      {/* Name + badges + description — clicking opens the detail dialog */}
      <button
        className="min-w-0 flex-1 text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground group-hover:underline">
            {skill.name}
          </span>
          {skill.latestVersion ? (
            <span className="shrink-0 text-caption text-muted-foreground font-normal">
              v{skill.latestVersion.slice(0, 7)}
            </span>
          ) : null}
          {category ? (
            <Badge
              className="shrink-0 px-1.5 py-0 text-caption leading-4 font-normal"
              variant="outline"
            >
              {category}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {skill.description}
        </p>
      </button>

      {/* Inline action — installed: hidden until hover; recommended: always visible */}
      <div className={`shrink-0 self-center ${isInstalled ? "opacity-0 group-hover:opacity-100 transition-opacity" : ""}`}>
        <SkillInstallButton
          isInstalled={isInstalled}
          size="sm"
          slug={skill.slug}
          variant="ghost"
        />
      </div>
    </div>
  );
}
