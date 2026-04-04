/**
 * Generic layout that pairs a CRM list page with a resizable inline detail side panel.
 * Header renders at full width above the body+panel row. The panel left edge
 * is draggable to resize (like Twenty CRM's command menu side panel).
 * On mobile, falls back to the existing Sheet-based RecordDrawer overlay.
 * @module components/crm/crm-list-panel-layout
 */
"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRecordDrawer } from "@/hooks/use-record-drawer";

import { RecordDrawer, type RecordObjectType } from "./record-drawer/record-drawer";

const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 700;

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
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

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

  const handleDragStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = event.clientX;
    startWidthRef.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startXRef.current - event.clientX;
      const nextWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidthRef.current + delta));
      setPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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

  const panelIsOpen = isOpen && recordId;

  // Desktop: header full-width, then body + resizable panel below.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-sidebar">
      {headerElement}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className={bodyClasses}>{children}</div>

        {panelIsOpen ? (
          <>
            {/* Drag handle */}
            <div
              className="w-1.5 shrink-0 cursor-col-resize bg-sidebar transition-colors hover:bg-border/50 active:bg-border"
              onMouseDown={handleDragStart}
            />

            {/* Panel */}
            <div
              className="flex shrink-0 flex-col overflow-hidden bg-sidebar"
              style={{ width: panelWidth }}
            >
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
          </>
        ) : null}
      </div>
    </div>
  );
}
