/**
 * Reusable empty-state block for CRM list and dashboard surfaces.
 * @module components/ui/empty-state
 */
"use client";

import { AppIcon, type AppIconName } from "@/components/icons/app-icons";

interface EmptyStateProps {
  iconName: AppIconName;
  title: string;
  description: string;
}

/**
 * Renders a compact, centered empty state with a semantic icon and two lines of copy.
 */
export function EmptyState({
  iconName,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center md:px-10 md:py-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-app-border-subtle bg-app-surface-muted text-muted-foreground">
        <AppIcon name={iconName} className="h-7 w-7" />
      </div>
      <h3 className="type-empty-title mt-5">{title}</h3>
      <p className="type-empty-copy mt-2 max-w-sm">{description}</p>
    </div>
  );
}
