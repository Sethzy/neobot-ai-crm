/**
 * Upload progress panel showing file-by-file status.
 * Fixed position in bottom-right corner.
 * @module components/documents/upload-progress-panel
 */
import { useState } from "react";
import { X, Check, Loader2, AlertCircle, ChevronUp, ChevronDown, Download, FileSpreadsheet } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { QueueItem, ReportTask } from "@/contexts/upload-context";

interface UploadProgressPanelProps {
  /** Current upload queue */
  queue: QueueItem[];
  /** Whether any uploads are in progress */
  isUploading: boolean;
  /** Callback to dismiss the panel */
  onDismiss: () => void;
  /** Current report generation task */
  reportTask: ReportTask | null;
  /** Callback to clear report task */
  onClearReportTask: () => void;
}

/**
 * Fixed-position panel showing upload progress.
 * Displays file list with status icons and summary.
 */
export function UploadProgressPanel({
  queue,
  isUploading,
  onDismiss,
  reportTask,
  onClearReportTask,
}: UploadProgressPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const hasContent = queue.length > 0 || reportTask !== null;
  if (!hasContent) return null;

  const isReportGenerating = reportTask?.status === "generating";

  const completedCount = queue.filter((item) => item.status === "complete").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const totalCount = queue.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isBusy = isUploading || isReportGenerating;
  const statusText = isReportGenerating
    ? "Generating"
    : isUploading
      ? "Uploading"
      : reportTask?.status === "complete"
        ? "Ready"
        : "Complete";

  return (
    <div className="fixed bottom-4 right-4 w-64 bg-background border border-border/40 rounded-xl shadow-sm z-50 overflow-hidden">
      {/* Header - compact with integrated progress */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          {isBusy ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
          <span className="text-xs font-medium text-foreground/80">{statusText}</span>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground/70 tabular-nums">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-5 w-5 text-muted-foreground/50 hover:text-foreground transition-colors"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
          >
            {isCollapsed ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-5 w-5 text-muted-foreground/50 hover:text-foreground transition-colors"
            onClick={onDismiss}
            disabled={isBusy}
            aria-label="Dismiss panel"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Progress bar - only show when uploading */}
      {isUploading && (
        <div className="h-[2px] bg-muted/30">
          <div
            className={cn(
              "h-full transition-all",
              failedCount > 0 ? "bg-amber-500" : "bg-foreground/60"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Content */}
      {!isCollapsed && (
        <div className="px-3 py-2 pt-1.5 max-h-32 overflow-y-auto border-t border-border/20">
          <div className="space-y-1">
            {/* Upload queue items */}
            {queue.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5">
                {item.status === "complete" && (
                  <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                )}
                {item.status === "uploading" && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70 shrink-0" />
                )}
                {item.status === "pending" && (
                  <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/20 shrink-0" />
                )}
                {item.status === "failed" && (
                  <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                )}
                <span className="text-xs text-foreground/70 truncate">{item.file.name}</span>
                {item.status === "failed" && item.error && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-destructive/80 shrink-0 cursor-help">
                        {item.error.includes("already exists") ? "Duplicate" : "Failed"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {item.error}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}

            {/* Report task */}
            {reportTask && (
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {reportTask.status === "generating" && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70 shrink-0" />
                  )}
                  {reportTask.status === "complete" && (
                    <FileSpreadsheet className="h-3 w-3 text-emerald-500 shrink-0" />
                  )}
                  {reportTask.status === "failed" && (
                    <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                  )}
                  <span className="text-xs text-foreground/70 truncate">{reportTask.name}</span>
                </div>
                {reportTask.status === "complete" && reportTask.downloadUrl && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 text-muted-foreground/70 hover:text-foreground shrink-0"
                    onClick={() => {
                      window.open(reportTask.downloadUrl, "_blank");
                      onClearReportTask();
                    }}
                    aria-label="Download report"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                )}
                {reportTask.status === "failed" && (
                  <span className="text-xs text-destructive/80 shrink-0">Failed</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
