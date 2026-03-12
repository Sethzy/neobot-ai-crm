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
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/30 text-muted-foreground">
        <AppIcon name={iconName} className="h-7 w-7" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
