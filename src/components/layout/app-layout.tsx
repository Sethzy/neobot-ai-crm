/**
 * Main application layout with sidebar and content area.
 * Initializes upload processor to auto-handle queued files.
 * @module components/layout/app-layout
 */
'use client';

import { AppSidebar } from "./app-sidebar";
import { UploadProgressPanel } from "@/components/documents/upload-progress-panel";
import { useUpload } from "@/contexts/upload-context";
import { useUploadProcessor } from "@/hooks/use-upload-processor";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { queue, isUploading, isPanelVisible, dismissPanel, reportTask, clearReportTask } = useUpload();

  // Initialize upload processor - auto-processes pending queue items
  useUploadProcessor();

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider open={true} className="h-svh">
        <AppSidebar />
        <SidebarInset className="min-h-0">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
          {isPanelVisible && (
            <UploadProgressPanel
              queue={queue}
              isUploading={isUploading}
              onDismiss={dismissPanel}
              reportTask={reportTask}
              onClearReportTask={clearReportTask}
            />
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
