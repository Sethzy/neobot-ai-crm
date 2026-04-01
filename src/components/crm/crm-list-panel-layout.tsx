/**
 * Generic layout that pairs a CRM list page with an inline detail side panel.
 * On desktop, uses resizable panels (table left, detail right).
 * On mobile, falls back to the existing Sheet-based RecordDrawer overlay.
 * @module components/crm/crm-list-panel-layout
 */
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePanelRef } from "react-resizable-panels";
import { ExternalLink, X } from "lucide-react";

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
  /** Route prefix for the "Open" full-page link, e.g. "/customers/people". */
  fullPageRoutePrefix: string;
}

const PANEL_DEFAULT_SIZE = 35;
const PANEL_MIN_SIZE = 25;
const PANEL_MAX_SIZE = 50;

export function CrmListPanelLayout({
  objectType,
  children,
  renderPanelContent,
  fullPageRoutePrefix,
}: CrmListPanelLayoutProps) {
  const { isOpen, recordId, close } = useRecordDrawer();
  const isMobile = useIsMobile();
  const detailPanelRef = usePanelRef();

  // Expand/collapse the right panel when recordId changes.
  useEffect(() => {
    const panel = detailPanelRef.current;
    if (!panel) return;

    if (recordId) {
      if (panel.isCollapsed()) {
        panel.expand();
      }
    } else {
      if (!panel.isCollapsed()) {
        panel.collapse();
      }
    }
  }, [recordId, detailPanelRef]);

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

  // Desktop: resizable panel layout.
  return (
    <ResizablePanelGroup orientation="horizontal" className="flex min-h-0 flex-1">
      <ResizablePanel defaultSize={isOpen ? 100 - PANEL_DEFAULT_SIZE : 100} minSize={40}>
        {children}
      </ResizablePanel>

      {isOpen ? <ResizableHandle withHandle /> : null}

      <ResizablePanel
        panelRef={detailPanelRef}
        collapsible
        collapsedSize={0}
        defaultSize={isOpen ? PANEL_DEFAULT_SIZE : 0}
        minSize={PANEL_MIN_SIZE}
        maxSize={PANEL_MAX_SIZE}
      >
        {recordId ? (
          <div className="flex h-full flex-col border-t border-border/60 bg-card">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close panel"
                onClick={close}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${fullPageRoutePrefix}/${recordId}`}>
                  Open
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">
              {renderPanelContent(recordId)}
            </div>
          </div>
        ) : null}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
