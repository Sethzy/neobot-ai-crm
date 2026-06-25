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
import { cn } from "@/lib/utils";

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

const skillDialogMarkdownClassName = cn(
  "skill-dialog-markdown",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-body",
  "[&_h2]:mt-5 [&_h2]:mb-1.5 [&_h2]:text-meta",
  "[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-meta",
  "[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-caption",
  "[&_p]:my-2.5 [&_p]:max-w-none [&_p]:text-foreground/80",
  "[&_ol]:my-2.5 [&_ol]:space-y-1 [&_ol]:pl-5",
  "[&_ul]:my-2.5 [&_ul]:space-y-1 [&_ul]:pl-5",
  "[&_blockquote]:my-4 [&_blockquote]:rounded-lg [&_blockquote]:px-3 [&_blockquote]:py-2",
  "[&_hr]:my-5",
  "[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:px-3 [&_pre]:py-3",
  "[&_code]:text-caption",
  "[&_table]:text-caption",
  "[&_th]:px-3 [&_th]:py-2",
  "[&_td]:px-3 [&_td]:py-2",
);

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
      <DialogContent
        aria-describedby={undefined}
        className="skill-detail-dialog-content p-0"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          maxHeight: "min(84vh, 760px)",
          maxWidth: "none",
          overflow: "hidden",
          width: "min(calc(100vw - 2rem), 44rem)",
        }}
      >

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-app-border-subtle px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            <SkillIcon
              className="mt-0.5 size-8 rounded-lg"
              iconClassName="size-4"
              slug={skill.slug}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="type-toolbar-title leading-tight">
                  {skill.name}
                </DialogTitle>
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
              <p className="mt-1 line-clamp-2 max-w-[58ch] type-toolbar-description">
                {skill.description}
              </p>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="skill-detail-dialog-body min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="px-6 py-5">
            {markdown ? (
              <SkillMarkdownViewer
                className={skillDialogMarkdownClassName}
                compact
                content={markdown}
              />
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
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-app-border-subtle bg-app-surface-muted px-5 py-3">
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
