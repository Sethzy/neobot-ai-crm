/**
 * Drag-and-drop file upload zone.
 * Displays empty state and handles file selection via drop or click.
 * @module components/documents/upload-drop-zone
 */
import { useState, useRef, useCallback, type DragEvent } from "react";
import { Upload } from "@/components/icons/lucide-compat";
import { cn } from "@/lib/utils";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_EXTENSIONS_DISPLAY,
} from "@/contexts/upload-context";

interface UploadDropZoneProps {
  /** Callback when files are selected */
  onFilesSelected: (files: File[]) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * A drop zone for uploading files via drag-and-drop or click.
 * Shows empty state with instructions and file type guidance.
 */
export function UploadDropZone({
  onFilesSelected,
  className,
}: UploadDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [onFilesSelected]
  );

  return (
    <div
      data-testid="upload-drop-zone"
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors",
        isDragOver ? "border-foreground bg-foreground/5" : "border-muted-foreground/25",
        className
      )}
    >
      <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-muted-foreground">No documents yet</p>
      <p className="text-sm text-muted-foreground">
        Drag and drop files or click to upload ({ALLOWED_EXTENSIONS_DISPLAY})
      </p>

      <input
        ref={inputRef}
        data-testid="file-input"
        type="file"
        multiple
        accept={ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
