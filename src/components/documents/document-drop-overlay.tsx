/**
 * Contained overlay for drag-and-drop file upload.
 * @module components/documents/document-drop-overlay
 */
import { useState, useEffect, useCallback, useRef } from "react";

interface DocumentDropOverlayProps {
  /** Callback when files are dropped */
  onFilesSelected: (files: File[]) => void;
}

/**
 * Checks if a drag event contains files.
 */
function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * Overlay that appears when dragging files over the documents section.
 * Provides visual feedback and captures drop events.
 * Hidden by default, activates on dragenter with files.
 * Positioned absolutely within parent container.
 */
export function DocumentDropOverlay({
  onFilesSelected,
}: DocumentDropOverlayProps) {
  const [isActive, setIsActive] = useState(false);
  /** Depth counter to handle nested drag enter/leave events */
  const dragDepthRef = useRef(0);

  /** Reset overlay state */
  const hideOverlay = useCallback(() => {
    dragDepthRef.current = 0;
    setIsActive(false);
  }, []);

  /** Handle window dragenter - show overlay when files detected */
  const handleDragEnter = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepthRef.current++;
    setIsActive(true);
  }, []);

  /** Handle overlay dragleave - hide when all drags exit */
  const handleDragLeave = useCallback(() => {
    dragDepthRef.current--;
    if (dragDepthRef.current === 0) {
      setIsActive(false);
    }
  }, []);

  /** Handle overlay dragover - prevent default to allow drop */
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  /** Handle overlay drop - extract files and call callback */
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      hideOverlay();

      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected, hideOverlay]
  );

  // Attach window dragenter and dragend listeners
  useEffect(() => {
    // dragend fires when drag operation ends (drop outside window, escape key, etc.)
    const handleDragEnd = () => hideOverlay();

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragend", handleDragEnd);
    // Also listen for drop on document to catch drops outside overlay
    document.addEventListener("drop", handleDragEnd);
    document.addEventListener("dragleave", (e) => {
      // Check if leaving the document entirely
      if (e.relatedTarget === null || !document.contains(e.relatedTarget as Node)) {
        hideOverlay();
      }
    });

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragend", handleDragEnd);
      document.removeEventListener("drop", handleDragEnd);
    };
  }, [handleDragEnter, hideOverlay]);

  if (!isActive) return null;

  return (
    <div
      data-testid="drop-overlay"
      onDragOver={(e) => handleDragOver(e.nativeEvent)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e.nativeEvent)}
      className="absolute inset-0 z-10 bg-foreground/10 border-2 border-dashed border-foreground rounded-lg"
    />
  );
}
