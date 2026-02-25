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

/** Read a cookie value on the client. */
function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1];
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const defaultSidebarOpen = getCookie("sidebar_state") === "true";
  const { queue, isUploading, isPanelVisible, dismissPanel, reportTask, clearReportTask } = useUpload();

  // Initialize upload processor - auto-processes pending queue items
  useUploadProcessor();

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultSidebarOpen} className="h-svh">
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
