/**
 * Fixed left sidebar displaying report history.
 * Converts to drawer on mobile breakpoints.
 * @module components/analyst/report-sidebar
 */
import type { ReportHistoryItem } from '@/components/docgen/report-history';
import { ReportItem } from './report-item';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ReportSidebarProps {
  /** List of reports to display */
  reports: ReportHistoryItem[];
  /** Called when report download is requested */
  onDownload: (filePath: string) => void;
  /** Mobile mode: controlled open state */
  isOpen?: boolean;
  /** Mobile mode: close callback */
  onClose?: () => void;
  /** Whether to render as mobile drawer */
  isMobile?: boolean;
}

/**
 * Fixed sidebar for report history.
 * Desktop: Fixed sidebar (w-64), Mobile: Sheet drawer.
 */
export function ReportSidebar({
  reports,
  onDownload,
  isOpen,
  onClose,
  isMobile = false,
}: ReportSidebarProps) {
  const content = (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No reports yet
        </p>
      ) : (
        reports.map((report) => (
          <ReportItem key={report.id} report={report} onDownload={onDownload} />
        ))
      )}
    </div>
  );

  // Mobile: render as Sheet/Drawer
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>Reports</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: render as fixed sidebar
  return (
    <aside className="w-64 border-r bg-muted/20 flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm">Reports</h2>
      </div>
      {content}
    </aside>
  );
}
