/**
 * Shared metadata row for CRM kanban cards.
 * @module components/crm/kanban-card-row
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface KanbanCardRowProps {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  isPlaceholder?: boolean;
}

/**
 * Renders a compact icon-and-content row with optional placeholder styling.
 */
export function KanbanCardRow({
  icon,
  children,
  className,
  contentClassName,
  isPlaceholder = false,
}: KanbanCardRowProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {icon}
      <div
        className={cn(
          "min-w-0",
          isPlaceholder && "text-muted-foreground/40",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
