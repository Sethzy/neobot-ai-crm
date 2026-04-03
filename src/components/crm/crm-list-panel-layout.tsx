/**
 * Generic layout that pairs a CRM list page with an inline detail side panel.
 * Header renders at full width above the body+panel flex row so it never
 * gets squished when the panel is open (matches Twenty's layout pattern).
 * On mobile, falls back to the existing Sheet-based RecordDrawer overlay.
 * @module components/crm/crm-list-panel-layout
 */
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRecordDrawer } from "@/hooks/use-record-drawer";

import { RecordDrawer, type RecordObjectType } from "./record-drawer/record-drawer";

interface CrmListPanelLayoutProps {
  /** Entity type for the mobile Sheet fallback. */
  objectType: RecordObjectType;
  /** Leading icon rendered next to the page title. */
  icon: ReactNode;
  /** Primary page title shown in the dashboard header. */
  title: string;
  /** Optional secondary text shown below the title. */
  description?: ReactNode;
  /** Optional controls aligned to the right side of the header. */
  headerActions?: ReactNode;
  /** Optional additional classes for the card body wrapper. */
  bodyClassName?: string;
  /** Main page content rendered inside the rounded card surface. */
  children: ReactNode;
  /** Renders the detail panel body for a given record id (desktop only). */
  renderPanelContent: (recordId: string, options: { closeButton: ReactNode }) => ReactNode;
}

export function CrmListPanelLayout({
  objectType,
  icon,
  title,
  description,
  headerActions,
  bodyClassName,
  children,
  renderPanelContent,
}: CrmListPanelLayoutProps) {
  const { isOpen, recordId, close } = useRecordDrawer();
  const isMobile = useIsMobile();

  // Close panel on Escape key.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  const hasHeaderMeta = Boolean(description) || Boolean(headerActions);

  const headerElement = (
    <div
      className={
        hasHeaderMeta
          ? "flex shrink-0 flex-col gap-3 bg-sidebar px-4 py-3 md:px-8 lg:flex-row lg:items-start lg:justify-between"
          : "flex shrink-0 items-center justify-between bg-sidebar px-4 py-3 md:px-8"
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
  );

  const bodyClasses = [
    "ml-3 min-h-0 min-w-0 flex-1 overflow-auto rounded-t-xl border-l border-t border-border/60 bg-card px-4 pt-4 md:ml-4",
    bodyClassName,
  ]
    .filter(Boolean)
    .join(" ");

  // Mobile: render children normally + Sheet overlay.
  if (isMobile) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {headerElement}
        <div className={bodyClasses}>{children}</div>
        <RecordDrawer
          isOpen={isOpen}
          recordId={recordId}
          objectType={objectType}
          onClose={close}
        />
      </div>
    );
  }

  // Desktop: header full-width, then body + panel in a flex row below.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-sidebar">
      {headerElement}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className={bodyClasses}>{children}</div>

        {isOpen && recordId ? (
          <div className="ml-1 flex w-[400px] shrink-0 flex-col overflow-hidden bg-sidebar">
            <div className="min-w-0 flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border/60 bg-card">
              {renderPanelContent(recordId, {
                closeButton: (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close panel"
                    onClick={close}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ),
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
