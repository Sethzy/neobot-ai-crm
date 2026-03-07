/**
 * Individual report card component for sidebar display.
 * @module components/analyst/report-item
 */
import { FileSpreadsheet } from '@/components/icons/lucide-compat';
import { format } from 'date-fns';
import type { ReportHistoryItem } from '@/components/docgen/report-history';

interface ReportItemProps {
  /** Report data to display */
  report: ReportHistoryItem;
  /** Called when download is requested */
  onDownload: (filePath: string) => void;
}

/**
 * Compact report card for sidebar display.
 * Shows name, date, and type with hover state.
 */
export function ReportItem({ report, onDownload }: ReportItemProps) {
  return (
    <div
      className="p-3 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors"
      onClick={() => onDownload(report.file_path)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onDownload(report.file_path)}
    >
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{report.name}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {format(new Date(report.generated_at), 'MMM d, yyyy')} · Excel
      </p>
    </div>
  );
}
