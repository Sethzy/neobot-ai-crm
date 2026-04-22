/**
 * Application sidebar with logo, navigation, and user section.
 * Uses shadcn Sidebar with icon-only collapse mode.
 * Navigation follows the primary navigation spec.
 * @module components/layout/app-sidebar
 */
'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import posthog from "posthog-js";
import { toast } from "sonner";
import { Logo } from "@/components/landing/Logo";
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";
import { useThreads } from "@/contexts/thread-context";
import { AllChatsPopover } from "./all-chats-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavigationItem {
  label: string;
  href: string;
  icon: AppIconName;
}

/** Primary navigation — flat list, no section headers */
const primaryNavItems: NavigationItem[] = [
  { label: "Agent", href: "/agent", icon: "agent" },
  { label: "New Task", href: "/chat", icon: "compose" },
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Automations", href: "/automations", icon: "automations" },
  { label: "Skills", href: "/skills", icon: "document" },
  { label: "People", href: "/customers/people", icon: "contacts" },
  { label: "Companies", href: "/customers/companies", icon: "building" },
  { label: "Deals", href: "/customers/deals", icon: "deals" },
  { label: "Meetings", href: "/meetings", icon: "meeting" },
];

interface AppSidebarProps {
  /** Opens the global command menu from the sidebar search button. */
  onOpenCommandMenu?: () => void;
}

export function AppSidebar({ onOpenCommandMenu }: AppSidebarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const { threads, isLoading: isThreadsLoading, archiveThread } = useThreads();
  const visibleThreads = threads.slice(0, 5);
  const hasOverflow = threads.length > 5;
  const [isChatsOpen, setIsChatsOpen] = useState(true);

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    posthog.reset();
    router.push("/");
  };

  const handleArchiveThread = useCallback(
    async (threadId: string) => {
      let hasArchived = false;
      try {
        hasArchived = await archiveThread(threadId);
      } catch {
        toast.error("Failed to archive chat.");
        return;
      }

      if (!hasArchived) {
        toast.error("Failed to archive chat.");
        return;
      }

      const isViewingArchivedThread = pathname.startsWith(`/chat/${threadId}`);
      if (!isViewingArchivedThread) {
        return;
      }

      const nextThread = threads.find((thread) => thread.id !== threadId);
      if (nextThread) {
        router.push(`/chat/${nextThread.id}`);
      } else {
        router.push("/chat");
      }
    },
    [archiveThread, pathname, router, threads],
  );

  const renderNavItems = (items: NavigationItem[]) =>
    items.map((item) => {
      const isActive = item.href === "/chat"
        ? pathname === "/chat"
        : pathname.startsWith(item.href);

      return (
        <SidebarMenuItem key={item.label}>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={item.label}
            className="transition-colors hover:bg-sidebar-accent/70 data-[active=true]:bg-app-surface data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:ring-1 data-[active=true]:ring-app-border-subtle data-[active=true]:shadow-xs data-[active=true]:hover:bg-app-surface"
          >
            <Link href={item.href} onClick={closeMobileSidebar}>
              <AppIcon name={item.icon} className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon" className="bg-app-sidebar">
      {/* Logo — tighter vertical padding */}
      <SidebarHeader className="px-3 pt-3 pb-2">
        <Logo />
      </SidebarHeader>

      {/* Navigation — reduced group spacing */}
      <SidebarContent className="px-2">
        {/* Primary nav — flat list, Search inline so it groups with the rest */}
        <SidebarGroup className="py-1">
          <SidebarMenu>
            {onOpenCommandMenu ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Search"
                  onClick={() => {
                    onOpenCommandMenu();
                    closeMobileSidebar();
                  }}
                  className="transition-colors hover:bg-sidebar-accent/70"
                >
                  <AppIcon name="search" className="h-4 w-4" />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
            {renderNavItems(primaryNavItems)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Chats section — thread history, always visible */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-7 gap-0 px-0 type-control-muted font-normal normal-case tracking-normal text-muted-foreground">
            <button
              type="button"
              onClick={() => setIsChatsOpen((open) => !open)}
              aria-expanded={isChatsOpen}
              aria-controls="sidebar-chats-list"
              className="flex h-full flex-1 items-center gap-1 rounded-md px-2 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <span>Chats</span>
              <AppIcon
                name="chevronDown"
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-150",
                  !isChatsOpen && "-rotate-90",
                )}
              />
            </button>
            <Link
              href="/chat"
              onClick={closeMobileSidebar}
              aria-label="New chat"
              title="New chat"
              className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <AppIcon name="add" className="h-3.5 w-3.5" />
              <span className="sr-only">New chat</span>
            </Link>
          </SidebarGroupLabel>
          <SidebarMenu
            id="sidebar-chats-list"
            className={cn(!isChatsOpen && "hidden")}
          >
            {isThreadsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SidebarMenuItem key={i}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Skeleton className="h-4 flex-1" style={{ animationDelay: `${i * 50}ms` }} />
                  </div>
                </SidebarMenuItem>
              ))
            ) : visibleThreads.map((thread) => (
              <SidebarMenuItem key={thread.id} className="group/thread">
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(`/chat/${thread.id}`)}
                  tooltip={thread.title}
                  className="transition-colors hover:bg-sidebar-accent/70 data-[active=true]:bg-app-surface data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:ring-1 data-[active=true]:ring-app-border-subtle data-[active=true]:shadow-xs"
                >
                  <Link
                    href={`/chat/${thread.id}`}
                    onClick={() => closeMobileSidebar()}
                  >
                    {thread.sourceType === "automation_run" ? (
                      <AppIcon name="automations" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <AppIcon name="chat" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{thread.title}</span>
                  </Link>
                </SidebarMenuButton>
                {thread.isPinned ? null : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction
                        aria-label={`More actions for ${thread.title}`}
                        className="opacity-0 group-hover/thread:opacity-100 transition-opacity"
                      >
                        <AppIcon name="more" className="h-4 w-4" />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuItem onClick={() => handleArchiveThread(thread.id)}>
                        <AppIcon name="archive" className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </SidebarMenuItem>
            ))}
            {!isThreadsLoading && hasOverflow ? (
              <SidebarMenuItem>
                <AllChatsPopover pathname={pathname} onNavigate={closeMobileSidebar}>
                  <SidebarMenuButton
                    tooltip="All chats"
                    className="text-muted-foreground transition-colors hover:bg-sidebar-accent/70"
                  >
                    <AppIcon name="more" className="h-4 w-4" />
                    <span>All chats</span>
                  </SidebarMenuButton>
                </AllChatsPopover>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — compact: Settings link + user dropdown with sign-out */}
      <SidebarFooter className="border-t border-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              tooltip="Settings"
              className="transition-colors hover:bg-sidebar-accent/70 data-[active=true]:bg-app-surface data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:ring-1 data-[active=true]:ring-app-border-subtle data-[active=true]:shadow-xs"
            >
              <Link href="/settings" onClick={closeMobileSidebar}>
                <AppIcon name="settings" className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* User row — opens dropdown with sign-out */}
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip={user?.email || "User"}
                  className="transition-colors hover:bg-sidebar-accent/70"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-foreground text-caption font-semibold text-background">
                    {user?.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate type-control text-foreground/80">
                    {user?.email}
                  </span>
                  <AppIcon
                    name="selector"
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
                  />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-48"
                >
                <DropdownMenuItem disabled className="text-caption text-muted-foreground">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <AppIcon name="logout" className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
