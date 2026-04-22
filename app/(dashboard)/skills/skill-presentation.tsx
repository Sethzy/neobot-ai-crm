/**
 * Shared presentation helpers for the skills surface.
 * Centralizes display categories and icon treatment so the list cards,
 * dialogs, and detail page stay visually consistent.
 *
 * @module app/(dashboard)/skills/skill-presentation
 */
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { cn } from "@/lib/utils";

/** Static slug → display category. Keeps badge labelling out of the DB. */
export const SKILL_CATEGORIES: Record<string, string> = {
  "call-prep": "Productivity",
  "call-summary": "Productivity",
  "daily-briefing": "Productivity",
  "deal-comparison": "Research",
  docx: "Documents",
  "draft-outreach": "Outreach",
  "market-briefing": "Research",
  "market-report": "Research",
  onboarding: "Setup",
  "opportunity-analysis": "Research",
  pdf: "Documents",
  "pipeline-review": "Productivity",
  pptx: "Documents",
  "property-showcase": "Outreach",
  xlsx: "Documents",
};

const CATEGORY_ICON_TONE_CLASSES: Record<string, string> = {
  Productivity: "bg-warning/10 text-warning",
  Research: "bg-info/10 text-info",
  Documents: "bg-success/10 text-success",
  Outreach: "bg-tag/10 text-tag",
  Setup: "bg-stage-negotiation/10 text-stage-negotiation",
};

const SKILL_ICON_NAMES: Record<string, AppIconName> = {
  "call-prep": "phone",
  "call-summary": "note",
  "daily-briefing": "schedule",
  "deal-comparison": "deals",
  docx: "document",
  "draft-outreach": "send",
  "market-briefing": "insights",
  "market-report": "table",
  onboarding: "form",
  "opportunity-analysis": "missionControl",
  pdf: "folderOpen",
  "pipeline-review": "kanban",
  pptx: "documents",
  "property-showcase": "property",
  xlsx: "table",
};

export function getSkillCategory(slug: string) {
  return SKILL_CATEGORIES[slug];
}

function getSkillIconName(slug: string): AppIconName {
  return SKILL_ICON_NAMES[slug] ?? "agent";
}

function getSkillIconToneClassName(slug: string) {
  const category = getSkillCategory(slug);

  return category
    ? (CATEGORY_ICON_TONE_CLASSES[category] ?? "bg-muted text-foreground")
    : "bg-muted text-foreground";
}

interface SkillIconProps {
  slug: string;
  className?: string;
  iconClassName?: string;
}

export function SkillIcon({
  slug,
  className,
  iconClassName,
}: SkillIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
        getSkillIconToneClassName(slug),
        className,
      )}
    >
      <AppIcon
        className={cn("size-4", iconClassName)}
        name={getSkillIconName(slug)}
      />
    </span>
  );
}
