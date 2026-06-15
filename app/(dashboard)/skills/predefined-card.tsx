/**
 * Compact row card for a skill in the catalog UI. Matches the competitor's
 * dense, scannable layout: icon + name + category badges + truncated
 * description + inline action.
 *
 * @module app/(dashboard)/skills/predefined-card
 */
import { Badge } from "@/components/ui/badge";
import type { InstalledSkillSummary } from "@/lib/runner/skills/get-installed-skills";

import { SkillInstallButton } from "./skill-install-button";
import { SkillIcon, getSkillCategory } from "./skill-presentation";

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
  const category = getSkillCategory(skill.slug);

  return (
    <div className="group flex min-w-0 items-start gap-3 rounded-lg border border-app-border-subtle bg-app-surface px-4 py-3 shadow-xs transition-colors hover:border-app-border-strong hover:bg-app-hover/60" onMouseEnter={onHover}>
      <SkillIcon className="mt-0.5" slug={skill.slug} />

      {/* Name + badges + description — clicking opens the detail dialog */}
      <button
        className="min-w-0 flex-1 text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="type-row-title truncate text-foreground">
            {skill.name}
          </span>
          {category ? (
            <Badge
              className="shrink-0 px-1.5 py-0 text-caption leading-4 font-normal"
              variant="outline"
            >
              {category}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 type-row-meta text-muted-foreground">
          {skill.description}
        </p>
      </button>

      {/* Inline action — installed: hidden until hover; recommended: always visible */}
      <div className={`shrink-0 self-center ${isInstalled ? "transition-opacity opacity-0 group-hover:opacity-100" : ""}`}>
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
