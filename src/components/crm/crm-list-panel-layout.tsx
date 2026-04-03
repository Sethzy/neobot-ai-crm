/**
 * Generic layout that pairs a CRM list page with an inline detail side panel.
 * On desktop, the panel sits to the right of the page content with a border gutter.
 * On mobile, falls back to the existing Sheet-based RecordDrawer overlay.
 * @module components/crm/crm-list-panel-layout
 */
"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRecordDrawer } from "@/hooks/use-record-drawer";

import { RecordDrawer, type RecordObjectType } from "./record-drawer/record-drawer";

interface CrmListPanelLayoutProps {
  /** Entity type for the mobile Sheet fallback. */
  objectType: RecordObjectType;
  /** The list page content (CrmListPageShell wrapping a DataTable). */
  children: ReactNode;
  /** Renders the detail panel body for a given record id (desktop only). */
  renderPanelContent: (recordId: string, options: { closeButton: ReactNode }) => ReactNode;
}

export function CrmListPanelLayout({
  objectType,
  children,
  renderPanelContent,
}: CrmListPanelLayoutProps) {
  const { isOpen, recordId, close } = useRecordDrawer();
  const isMobile = useIsMobile();
  const listShellRef = useRef<HTMLDivElement | null>(null);
  const [panelOffsetTop, setPanelOffsetTop] = useState(0);

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

  useLayoutEffect(() => {
    if (isMobile) {
      return;
    }

    const listShellElement = listShellRef.current;
    const headerElement = listShellElement?.querySelector<HTMLElement>("[data-crm-list-page-header]");

    if (!headerElement) {
      return;
    }

    const updatePanelOffset = () => {
      setPanelOffsetTop(headerElement.getBoundingClientRect().height);
    };

    updatePanelOffset();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updatePanelOffset);
      return () => window.removeEventListener("resize", updatePanelOffset);
    }

    const resizeObserver = new ResizeObserver(() => {
      updatePanelOffset();
    });
    resizeObserver.observe(headerElement);
    window.addEventListener("resize", updatePanelOffset);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePanelOffset);
    };
  }, [children, isMobile]);

  // Mobile: render children normally + Sheet overlay.
  if (isMobile) {
    return (
      <>
        {children}
        <RecordDrawer
          isOpen={isOpen}
          recordId={recordId}
          objectType={objectType}
          onClose={close}
        />
      </>
    );
  }

  // Desktop: flex layout — list page on the left, detail panel on the right.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-sidebar">
      <div ref={listShellRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {isOpen && recordId ? (
        <div
          className="ml-1 flex w-[400px] shrink-0 flex-col overflow-hidden bg-sidebar"
          style={{ paddingTop: `${panelOffsetTop}px` }}
        >
          {/* Panel body — card inset with rounded top-left corner */}
          <div className="min-w-0 flex-1 overflow-y-auto rounded-tl-xl border-l border-t border-border/60 bg-card">
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
  );
}
