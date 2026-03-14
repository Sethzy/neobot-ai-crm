/**
 * Individual file card component for Library grid/list display.
 * Shows file type icon, name, type badge, and hover actions.
 * @module components/library/library-file-card
 */
import { memo, type ComponentType } from "react";
import {
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileIcon,
  PresentationIcon,
  SheetIcon,
  type LucideProps,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportHistoryItem } from "@/components/docgen/report-history";

/** File type config: icon component, color class, label, badge text */
interface FileTypeConfig {
  Icon: ComponentType<LucideProps>;
  colorClass: string;
  label: string;
  badge: string;
}

/**
 * Get file type configuration based on filename extension.
 * Returns icon component, color, label, and badge text.
 */
function getFileTypeConfig(filename: string): FileTypeConfig {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  switch (ext) {
    case "xlsx":
    case "xls":
      return { Icon: FileSpreadsheetIcon, colorClass: "text-green-600", label: "Spreadsheet", badge: "EXCEL" };
    case "csv":
      return { Icon: SheetIcon, colorClass: "text-emerald-600", label: "CSV", badge: "CSV" };
    case "pdf":
      return { Icon: FileTextIcon, colorClass: "text-red-600", label: "PDF", badge: "PDF" };
    case "docx":
    case "doc":
      return { Icon: FileTextIcon, colorClass: "text-blue-600", label: "Document", badge: "WORD" };
    case "pptx":
    case "ppt":
      return { Icon: PresentationIcon, colorClass: "text-orange-600", label: "Presentation", badge: "PPT" };
    default:
      return { Icon: FileIcon, colorClass: "text-zinc-400", label: "File", badge: "FILE" };
  }
}

interface LibraryFileCardProps {
  /** Report data to display */
  report: ReportHistoryItem;
  /** Called when download is requested */
  onDownload: (filePath: string) => void;
  /** Display mode - grid shows card, list shows row */
  viewMode: "grid" | "list";
  /** Map of tag IDs to display names for quick reports */
  tagNameMap?: Map<string, string>;
}

/**
 * Builds a description showing included doc types and record count.
 * Format: "Income Document, Medical Expense · 37 records"
 * Returns null if no meaningful data to display.
 */
function getReportDescription(
  report: ReportHistoryItem,
  tagNameMap?: Map<string, string>
): string | null {
  const parts: string[] = [];

  // Add tag names if available
  if (report.tags_included?.length && tagNameMap) {
    const tagNames = report.tags_included
      .map((id) => tagNameMap.get(id) || id)
      .join(", ");
    parts.push(tagNames);
  }

  // Add record count if > 0
  if (report.splits_count > 0) {
    const recordText = `${report.splits_count} record${report.splits_count !== 1 ? "s" : ""}`;
    parts.push(recordText);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * File card for Library tab.
 * Renders as a card in grid view or a row in list view.
 * Click triggers download, hover shows download button.
 */
export const LibraryFileCard = memo(function LibraryFileCard({
  report,
  onDownload,
  viewMode,
  tagNameMap,
}: LibraryFileCardProps) {
  const handleClick = () => onDownload(report.file_path);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onDownload(report.file_path);
    }
  };

  const description = getReportDescription(report, tagNameMap);
  const formattedDate = format(new Date(report.generated_at), "MMM d, h:mm a");
  // Use file_path for extension detection (name may not have extension, e.g., "Quick Report")
  const fileConfig = getFileTypeConfig(report.file_path);
  const { Icon } = fileConfig;

  if (viewMode === "list") {
    return (
      <div
        className="group grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        <Icon className={cn("h-4 w-4", fileConfig.colorClass)} />
        <div className="min-w-0">
          <span className="text-sm font-medium truncate block">{report.name}</span>
          {description && (
            <span className="text-xs text-muted-foreground truncate block">
              {description}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{formattedDate}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(report.file_path);
          }}
        >
          <DownloadIcon className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {/* File icon and type badge */}
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 rounded-md bg-muted/50">
          <Icon className={cn("h-5 w-5", fileConfig.colorClass)} />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1.5 py-0.5 bg-muted/60 rounded">
          {fileConfig.badge}
        </span>
      </div>

      {/* Filename */}
      <p className="text-sm font-medium truncate" title={report.name}>
        {report.name}
      </p>

      {/* Hover download button - absolute positioned */}
      <Button
        variant="secondary"
        size="sm"
        className="absolute bottom-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDownload(report.file_path);
        }}
      >
        <DownloadIcon className="size-4" />
      </Button>
    </div>
  );
});
