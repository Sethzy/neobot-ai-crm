/**
 * Main application layout with sidebar and content area.
 * @module components/layout/app-layout
 */
'use client';

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/landing/Logo";

const CommandMenu = dynamic(
  () =>
    import("@/components/command-menu").then((module) => ({
      default: module.CommandMenu,
    })),
  { ssr: false },
);

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [hasRequestedCommandMenu, setHasRequestedCommandMenu] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const isEditableTarget = Boolean(
        target
          && ((target instanceof HTMLElement && target.isContentEditable)
            || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
            || target.getAttribute("role") === "textbox"),
      );
      if (event.defaultPrevented || event.isComposing || isEditableTarget) {
        return;
      }

      const isCommandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isCommandShortcut) {
        return;
      }

      event.preventDefault();
      setHasRequestedCommandMenu(true);
      setIsCommandMenuOpen((previousValue) => !previousValue);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openCommandMenu = () => {
    setHasRequestedCommandMenu(true);
    setIsCommandMenuOpen(true);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider open={true} className="h-svh bg-app-sidebar">
        <AppSidebar onOpenCommandMenu={openCommandMenu} />
        <SidebarInset className="min-h-0 bg-app-canvas">
          {/* Mobile header — visible only below md breakpoint */}
          <header className="flex items-center gap-2 border-b border-app-border-subtle bg-app-canvas px-3 py-2 md:hidden">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <Logo />
          </header>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app-canvas">
            {children}
          </div>
        </SidebarInset>
        {hasRequestedCommandMenu ? (
          <CommandMenu
            open={isCommandMenuOpen}
            onOpenChange={setIsCommandMenuOpen}
          />
        ) : null}
      </SidebarProvider>
    </TooltipProvider>
  );
}
