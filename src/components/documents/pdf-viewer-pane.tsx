/**
 * PDF viewer pane with highlight support.
 * @module components/documents/pdf-viewer-pane
 */
import Image from "next/image";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import {
  highlightPlugin,
  type RenderHighlightsProps,
} from "@react-pdf-viewer/highlight";
import { useEffect, useState } from "react";
import type { HighlightArea } from "@/lib/highlight-utils";
import { useHighlights } from "@/contexts/highlight-context";

import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import "@react-pdf-viewer/highlight/lib/styles/index.css";

interface PdfViewerPaneProps {
  /** URL to the PDF file or image */
  pdfUrl: string;
  /** File type (e.g., 'pdf', 'png', 'jpg') - defaults to 'pdf' for backward compatibility */
  fileType?: string;
}

/** Image file types that should be rendered as <img> instead of PDF viewer */
const IMAGE_FILE_TYPES = ["png", "jpg", "jpeg", "gif", "webp", "tiff", "tif", "heic", "bmp"];
const SUPABASE_STORAGE_HOST = "https://xtewwwycvapskgvfnliq.supabase.co/";

/**
 * Renders a single highlight overlay.
 */
function HighlightOverlay({ area }: { area: HighlightArea }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${area.left}%`,
        top: `${area.top}%`,
        width: `${area.width}%`,
        height: `${area.height}%`,
        backgroundColor: "rgba(236, 237, 255, 0.4)",
        border: "2px solid #808BF8",
        borderRadius: "2px",
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Displays a PDF with navigation toolbar and optional highlights,
 * or an image viewer for non-PDF file types.
 * Uses HighlightContext for highlight state and page navigation.
 */
export function PdfViewerPane({ pdfUrl, fileType = "pdf" }: PdfViewerPaneProps) {
  const { highlights, registerJumpToPage } = useHighlights();
  const isImage = IMAGE_FILE_TYPES.includes(fileType.toLowerCase());
  const isPdf = fileType.toLowerCase() === "pdf";
  const isUnsupported = !isImage && !isPdf;
  const isSupabaseHostedImage = isImage && pdfUrl.startsWith(SUPABASE_STORAGE_HOST);
  const [naturalImageSize, setNaturalImageSize] = useState<{ width: number; height: number } | null>(null);

  // Create plugins (only used for PDF)
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: () => [], // Remove sidebar tabs (thumbnails, bookmarks, attachments)
  });

  const highlightPluginInstance = highlightPlugin({
    renderHighlights: (props: RenderHighlightsProps) => {
      // Filter highlights for this page
      const pageHighlights = highlights.filter(
        (h) => h.pageIndex === props.pageIndex
      );

      return (
        <div>
          {pageHighlights.map((area, idx) => (
            <HighlightOverlay key={`${props.pageIndex}-${idx}`} area={area} />
          ))}
        </div>
      );
    },
  });

  // Register jumpToPage with context for external navigation (PDF only)
  useEffect(() => {
    if (isImage || isUnsupported) {
      // Non-PDF files don't support page navigation
      registerJumpToPage(null);
      return;
    }
    registerJumpToPage((pageIndex: number) => {
      defaultLayoutPluginInstance.toolbarPluginInstance.pageNavigationPluginInstance.jumpToPage(
        pageIndex
      );
    });
    return () => registerJumpToPage(null);
  }, [defaultLayoutPluginInstance, registerJumpToPage, isImage, isUnsupported]);

  useEffect(() => {
    if (!isSupabaseHostedImage) {
      setNaturalImageSize(null);
      return;
    }

    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (cancelled) return;
      setNaturalImageSize({
        width: probe.naturalWidth || 1200,
        height: probe.naturalHeight || 1600,
      });
    };
    probe.onerror = () => {
      if (cancelled) return;
      setNaturalImageSize({ width: 1200, height: 1600 });
    };
    probe.src = pdfUrl;

    return () => {
      cancelled = true;
    };
  }, [isSupabaseHostedImage, pdfUrl]);

  // Image viewer for non-PDF files
  if (isImage) {
    return (
      <div className="h-full flex flex-col bg-neutral-50/50">
        {/* Simple toolbar mimicking PDF viewer */}
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-[#eeeeee] border-b border-[#d1d1d1] text-sm text-muted-foreground">
          <span>Image Preview</span>
        </div>
        {/* Image container with relative positioning for highlight overlay */}
        <div
          className="flex-1 overflow-auto flex items-start justify-center [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300/40 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-stone-300/60"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#a8a29e66 transparent' }}
        >
          <div className="relative inline-block">
            {isSupabaseHostedImage ? (
              <Image
                src={pdfUrl}
                alt="Document preview"
                width={naturalImageSize?.width ?? 1200}
                height={naturalImageSize?.height ?? 1600}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="h-auto max-w-full"
                style={{ backgroundColor: "white" }}
              />
            ) : (
              <img
                src={pdfUrl}
                alt="Document preview"
                className="max-w-full h-auto"
                style={{ backgroundColor: "white" }}
              />
            )}
            {/* Highlight overlays - same style as PDF viewer */}
            {highlights
              .filter((h) => h.pageIndex === 0) // Images are single page (index 0)
              .map((area, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "absolute",
                    left: `${area.left}%`,
                    top: `${area.top}%`,
                    width: `${area.width}%`,
                    height: `${area.height}%`,
                    backgroundColor: "rgba(236, 237, 255, 0.4)",
                    border: "2px solid #808BF8",
                    borderRadius: "2px",
                    pointerEvents: "none",
                  }}
                />
              ))}
          </div>
        </div>
      </div>
    );
  }

  // Unsupported file type fallback
  if (isUnsupported) {
    return (
      <div className="h-full flex flex-col bg-[#525659]">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Preview not available for .{fileType.toLowerCase()} files
          </p>
        </div>
      </div>
    );
  }

  // PDF viewer
  return (
    <div className="h-full">
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
        <Viewer
          fileUrl={pdfUrl}
          defaultScale={1} // 100% zoom
          plugins={[defaultLayoutPluginInstance, highlightPluginInstance]}
        />
      </Worker>
    </div>
  );
}
