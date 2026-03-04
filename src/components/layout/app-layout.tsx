/**
 * Main application layout with sidebar and content area.
 * Initializes upload processor to auto-handle queued files.
 * @module components/layout/app-layout
 */
'use client';

import { useEffect, useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { UploadProgressPanel } from "@/components/documents/upload-progress-panel";
import { useUpload } from "@/contexts/upload-context";
import { useUploadProcessor } from "@/hooks/use-upload-processor";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/landing/Logo";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { queue, isUploading, isPanelVisible, dismissPanel, reportTask, clearReportTask } = useUpload();
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);

  // Initialize upload processor - auto-processes pending queue items
  useUploadProcessor();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isCommandShortcut) {
        return;
      }

      event.preventDefault();
      setIsCommandMenuOpen((previousValue) => !previousValue);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider open={true} className="h-svh">
        <AppSidebar onOpenCommandMenu={() => setIsCommandMenuOpen(true)} />
        <SidebarInset className="min-h-0">
          {/* Mobile header — visible only below md breakpoint */}
          <header className="flex md:hidden items-center gap-2 border-b border-border/40 px-3 py-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <Logo />
          </header>
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
        <CommandMenu open={isCommandMenuOpen} onOpenChange={setIsCommandMenuOpen} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
