/**
 * Shared header row for customers detail pages.
 * @module components/crm/detail/detail-page-header
 */
"use client";

import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";

interface DetailPageHeaderProps {
  backHref: string;
  backLabel: string;
  deleteLabel: string;
  isDeleting?: boolean;
  onDelete: () => void;
}

/**
 * Renders the back link and destructive action row used across customer detail pages.
 */
export function DetailPageHeader({
  backHref,
  backLabel,
  deleteLabel,
  isDeleting = false,
  onDelete,
}: DetailPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button asChild variant="ghost" size="sm" className="h-auto px-0 py-0 text-sm text-muted-foreground">
        <Link href={backHref}>
          <AppIcon name="arrowLeft" className="mr-2 h-4 w-4" />
          {backLabel}
        </Link>
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDeleting}
        className="border-destructive/20 text-destructive hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
        onClick={onDelete}
      >
        {deleteLabel}
      </Button>
    </div>
  );
}
