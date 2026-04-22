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

import {
  PAGE_CONTENT_MAX_WIDTH,
  PAGE_GUTTER_CLASSES,
} from "@/components/layout/page-canvas";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
  const [isDragging, setIsDragging] = useState(false);
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
      setIsDragging(true);
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
      setIsDragging(false);
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

  const bodyClasses = cn(
    "min-h-0 min-w-0 flex-1 overflow-auto",
    // Max-width is unconditional so the body stays centered at the shared page
    // width regardless of panel state. Toggling it on panel open made the body
    // re-center horizontally during the same 200–280ms as the panel's width
    // animation, which compounded the perceived jank when the header's action
    // button was fading. Fixed-column layout = stable horizontal rhythm.
    "mx-auto w-full",
    PAGE_CONTENT_MAX_WIDTH,
    bodyClassName,
  );

  if (isMobile) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app-canvas">
        {header}
        <div className={cn("min-h-0 min-w-0 flex-1 pb-6", PAGE_GUTTER_CLASSES)}>
          <div className={bodyClasses}>{children}</div>
        </div>
        {mobileSlot}
      </div>
    );
  }

  const effectiveRender = renderPanelContent;
  const canRenderPanel = isPanelOpen && Boolean(effectiveRender);
  const resizerWidth = 6;
  const outerWidth = isPanelOpen ? panelWidth + resizerWidth : 0;
  const sharedTransition = isDragging
    ? "none"
    : `width ${isPanelOpen ? 280 : 220}ms cubic-bezier(0.22, 1, 0.36, 1)`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app-canvas">
      {header}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden pb-6",
          PAGE_GUTTER_CLASSES,
        )}
      >
        <div className={bodyClasses}>{children}</div>

        {canRenderPanel ? (
          <div
            className="flex shrink-0 overflow-hidden motion-reduce:!transition-none"
            style={{ width: outerWidth, transition: sharedTransition }}
            aria-hidden={!isPanelOpen}
          >
            <div
              className="mx-1 w-1.5 shrink-0 cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-app-border-strong/70 active:bg-app-border-strong"
              onMouseDown={handleDragStart}
              aria-hidden
            />

            <div
              className="flex shrink-0 flex-col overflow-hidden transition-opacity duration-200 ease-out motion-reduce:!transition-none"
              style={{ width: panelWidth, opacity: isPanelOpen ? 1 : 0 }}
            >
              <div className="surface-app min-w-0 flex-1 overflow-hidden">
                {effectiveRender!({
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
