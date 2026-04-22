/**
 * Skill detail popup dialog. Opens when clicking a skill row in the catalog.
 * Shows skill metadata + rendered SKILL.md content + install/uninstall action.
 *
 * Markdown is pre-fetched by the parent catalog (fetch-before-open pattern)
 * so the dialog always renders with full content — no skeleton or loading state.
 *
 * @module app/(dashboard)/skills/skill-detail-dialog
 */
"use client";

import { useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

import { SkillInstallButton } from "./skill-install-button";
import { SkillMarkdownViewer } from "./skill-markdown-viewer";
import { SkillIcon } from "./skill-presentation";

interface SkillDetailDialogProps {
  isInstalled: boolean;
  skill: {
    slug: string;
    name: string;
    description: string;
    latestVersion?: string | null;
  };
  category?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fetched SKILL.md content. Passed by the catalog before open. */
  markdown: string;
}

export function SkillDetailDialog({
  isInstalled,
  skill,
  category,
  open,
  onOpenChange,
  markdown,
}: SkillDetailDialogProps) {
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => onOpenChange(nextOpen),
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-[704px] p-0">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-6 pt-5 pb-4">
          {/* Visually-hidden title satisfies Radix a11y requirement */}
          <DialogTitle className="sr-only">{skill.name}</DialogTitle>
          <div className="flex items-start gap-3">
            <SkillIcon className="mt-0.5 size-9 rounded-lg" iconClassName="size-4.5" slug={skill.slug} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="type-toolbar-title leading-tight">
                  {skill.name}
                </h2>
                {category ? (
                  <Badge
                    className="shrink-0 px-1.5 py-0 text-caption leading-4 font-normal"
                    variant="outline"
                  >
                    {category}
                  </Badge>
                ) : null}
              </div>

              {/* Description */}
              <p className="mt-1 measure-copy type-toolbar-description">
                {skill.description}
              </p>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-6 py-5">
            {markdown ? (
              <SkillMarkdownViewer compact content={markdown} />
            ) : (
              <p className="type-control-muted text-muted-foreground">
                No documentation available for this skill.
              </p>
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        {/* mx-0 mb-0 cancel the DialogFooter default -mx-4 -mb-4 (designed for p-4
            parent); we use p-0 on DialogContent so those negatives would overshoot. */}
        <DialogFooter className="mx-0 mb-0">
          <SkillInstallButton
            isInstalled={isInstalled}
            slug={skill.slug}
            size="sm"
            variant={isInstalled ? "outline" : "default"}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
