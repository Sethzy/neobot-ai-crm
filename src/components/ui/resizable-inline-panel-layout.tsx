/**
 * Generic page shell that pairs a main content card with an optional
 * resizable, inline right-side detail panel. Extracted from the CRM list
 * layout so non-CRM pages (e.g. automation detail) can reuse the same
 * visual chrome — sidebar canvas, top header strip, twin rounded cards,
 * drag-resizable panel with pinned close button.
 *
 * Mobile devices fall back to rendering the body only; callers that need
 * mobile drawer behavior wire their own overlay on top.
 *
 * @module components/ui/resizable-inline-panel-layout
 */
"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 700;

interface ResizableInlinePanelLayoutProps {
  /** Full-width strip rendered above the body + panel row. */
  header: ReactNode;
  /** Body content — rendered inside the left rounded card. */
  children: ReactNode;
  /** Extra classes applied to the body card wrapper. */
  bodyClassName?: string;
  /** Renders the panel body when `isPanelOpen` is true. Receives a pre-wired close button slot. */
  renderPanelContent?: (options: { closeButton: ReactNode }) => ReactNode;
  /** Controlled open/close state for the right panel. */
  isPanelOpen: boolean;
  /** Called when the user closes the panel (Escape, close button). */
  onClosePanel: () => void;
  /** Optional override for the default panel width in px. */
  defaultPanelWidth?: number;
  /** Content rendered instead of the panel when on mobile. Defaults to nothing. */
  mobileSlot?: ReactNode;
}

export function ResizableInlinePanelLayout({
  header,
  children,
  bodyClassName,
  renderPanelContent,
  isPanelOpen,
  onClosePanel,
  defaultPanelWidth = DEFAULT_PANEL_WIDTH,
  mobileSlot,
}: ResizableInlinePanelLayoutProps) {
  const isMobile = useIsMobile();
  const [panelWidth, setPanelWidth] = useState(defaultPanelWidth);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    if (!isPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClosePanel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPanelOpen, onClosePanel]);

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = event.clientX;
      startWidthRef.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelWidth],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startXRef.current - event.clientX;
      const nextWidth = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, startWidthRef.current + delta),
      );
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

  const bodyClasses = [
    "ml-3 min-h-0 min-w-0 flex-1 overflow-auto rounded-t-xl border-l border-t border-border/60 bg-card md:ml-4",
    bodyClassName,
  ]
    .filter(Boolean)
    .join(" ");

  if (isMobile) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className={bodyClasses}>{children}</div>
        {mobileSlot}
      </div>
    );
  }

  const showPanel = isPanelOpen && Boolean(renderPanelContent);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-sidebar">
      {header}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className={bodyClasses}>{children}</div>

        {showPanel ? (
          <>
            <div
              className="w-1.5 shrink-0 cursor-col-resize bg-sidebar transition-colors hover:bg-border/50 active:bg-border"
              onMouseDown={handleDragStart}
              aria-hidden
            />

            <div
              className="flex shrink-0 flex-col overflow-hidden bg-sidebar"
              style={{ width: panelWidth }}
            >
              <div className="min-w-0 flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border/60 bg-card">
                {renderPanelContent!({
                  closeButton: (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close panel"
                      onClick={onClosePanel}
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
