/**
 * Shared page shell for CRM list pages with a header row and rounded card body.
 * @module components/crm/crm-list-page-shell
 */
"use client";

import type { ReactNode } from "react";

interface CrmListPageShellProps {
  /** Leading icon rendered next to the page title. */
  icon: ReactNode;
  /** Primary page title shown in the dashboard header. */
  title: string;
  /** Optional secondary text shown below the title. */
  description?: ReactNode;
  /** Optional controls aligned to the right side of the header. */
  headerActions?: ReactNode;
  /** Main page content rendered inside the rounded card surface. */
  children: ReactNode;
  /** Optional additional classes for the card body wrapper. */
  bodyClassName?: string;
}

/**
 * Provides the shared dashboard list-page chrome used by people, companies,
 * and deals so the drawer alignment treatment stays consistent.
 */
export function CrmListPageShell({
  icon,
  title,
  description,
  headerActions,
  children,
  bodyClassName,
}: CrmListPageShellProps) {
  const hasHeaderMeta = Boolean(description) || Boolean(headerActions);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
      <div
        data-crm-list-page-header
        className={
          hasHeaderMeta
            ? "flex flex-col gap-3 bg-sidebar px-4 py-3 md:px-8 lg:flex-row lg:items-start lg:justify-between"
            : "flex items-center justify-between bg-sidebar px-4 py-3 md:px-8"
        }
      >
        <div className={description ? "space-y-1" : undefined}>
          <div className="flex items-center gap-2">
            {icon}
            <h1 className="text-sm font-medium text-foreground">{title}</h1>
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {headerActions}
      </div>

      <div
        className={[
          "ml-3 min-h-0 min-w-0 flex-1 rounded-t-xl border-l border-t border-border/60 bg-card px-4 pt-4 md:ml-4",
          bodyClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
