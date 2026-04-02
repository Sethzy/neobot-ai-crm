/**
 * Generic layout that pairs a CRM list page with an inline detail side panel.
 * On desktop, uses resizable panels (table left, detail right).
 * On mobile, falls back to the existing Sheet-based RecordDrawer overlay.
 * @module components/crm/crm-list-panel-layout
 */
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRecordDrawer } from "@/hooks/use-record-drawer";

import { RecordDrawer, type RecordObjectType } from "./record-drawer/record-drawer";

interface CrmListPanelLayoutProps {
  /** Entity type for the mobile Sheet fallback. */
  objectType: RecordObjectType;
  /** The list page content (header + DataTable). */
  children: ReactNode;
  /** Renders the detail panel body for a given record id (desktop only). */
  renderPanelContent: (recordId: string) => ReactNode;
}

export function CrmListPanelLayout({
  objectType,
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

  // Desktop: keyed by isOpen so the panel group reinitializes with correct
  // defaultSize values on open/close. Switching between records while the
  // panel stays open does NOT remount (same key), avoiding jank.
  return (
    <ResizablePanelGroup
      key={isOpen ? "open" : "closed"}
      orientation="horizontal"
      className="flex min-h-0 min-w-0 flex-1"
    >
      <ResizablePanel
        defaultSize={isOpen ? "65%" : "100%"}
        minSize="40%"
        className="flex min-w-0 flex-col overflow-hidden"
      >
        {children}
      </ResizablePanel>

      {isOpen ? (
        <>
          <ResizableHandle
            withHandle
            className="bg-transparent after:hidden [&>div]:bg-transparent"
          />
          <ResizablePanel
            defaultSize="35%"
            minSize="25%"
            maxSize="50%"
            className="min-w-0 overflow-hidden rounded-t-xl border-l border-r border-t border-border/60 bg-card"
          >
            {recordId ? (
              <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
                {/* Panel header */}
                <div className="flex min-w-0 items-center px-3 py-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close panel"
                    onClick={close}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Panel body */}
                <div className="min-w-0 flex-1 overflow-y-auto">
                  {renderPanelContent(recordId)}
                </div>
              </div>
            ) : null}
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}
