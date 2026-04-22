/**
 * Application sidebar with logo, navigation, and user section.
 * Uses shadcn Sidebar with icon-only collapse mode.
 * Navigation follows the primary navigation spec.
 * @module components/layout/app-sidebar
 */
'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import posthog from "posthog-js";
import { toast } from "sonner";
import { Logo } from "@/components/landing/Logo";
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";
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

/** AGENT section — primary operating surfaces */
const agentNavItems: NavigationItem[] = [
  { label: "New Task", href: "/chat", icon: "compose" },
  { label: "Skills", href: "/skills", icon: "document" },
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Automations", href: "/automations", icon: "automations" },
];

/** DATABASE section — data-centric surfaces */
const customersNavItems: NavigationItem[] = [
  { label: "People", href: "/customers/people", icon: "contacts" },
  { label: "Companies", href: "/customers/companies", icon: "building" },
  { label: "Deals", href: "/customers/deals", icon: "deals" },
];

/** DATABASE section — data-centric surfaces */
const databaseNavItems: NavigationItem[] = [
  { label: "Meetings", href: "/meetings", icon: "meeting" },
];

interface AppSidebarProps {
  /** Opens the global command menu from the sidebar search button. */
  onOpenCommandMenu?: () => void;
}

function getThreadIconName(thread: {
  isPrimary: boolean;
  sourceType?: string | null;
}): AppIconName {
  if (thread.isPrimary) {
    return "home";
  }

  if (thread.sourceType === "automation_run") {
    return "automations";
  }

  return "chat";
}

export function AppSidebar({ onOpenCommandMenu }: AppSidebarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const { threads, isLoading: isThreadsLoading, archiveThread } = useThreads();
  const visibleThreads = threads.slice(0, 5);
  const hasOverflow = threads.length > 5;

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
            className="hover:bg-muted/50 data-[active=true]:bg-muted/60 data-[active=true]:text-foreground data-[active=true]:font-medium data-[active=true]:hover:bg-muted/70 transition-colors"
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
    <Sidebar collapsible="icon" className="bg-background">
      {/* Logo — tighter vertical padding */}
      <SidebarHeader className="px-3 pt-3 pb-2">
        <Logo />
      </SidebarHeader>

      {/* Navigation — reduced group spacing */}
      <SidebarContent className="px-2">
        {/* Search — opens the global command palette */}
        {onOpenCommandMenu ? (
          <SidebarGroup className="py-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Search"
                  onClick={() => {
                    onOpenCommandMenu();
                    closeMobileSidebar();
                  }}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <AppIcon name="search" className="h-4 w-4" />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

        {/* AGENT section */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 tracking-[0.12em] text-muted-foreground/50">
            Agent
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(agentNavItems)}</SidebarMenu>
        </SidebarGroup>

        {/* CUSTOMERS section */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 tracking-[0.12em] text-muted-foreground/50">
            Customers
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(customersNavItems)}</SidebarMenu>
        </SidebarGroup>

        {/* DATABASE section */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 tracking-[0.12em] text-muted-foreground/50">
            Database
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(databaseNavItems)}</SidebarMenu>
        </SidebarGroup>

        {/* SESSIONS section — thread history, always visible */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 tracking-[0.12em] text-muted-foreground/50">
            Sessions
          </SidebarGroupLabel>
          <SidebarMenu>
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
                  className="hover:bg-muted/50 data-[active=true]:bg-muted/60 data-[active=true]:text-foreground data-[active=true]:font-medium transition-colors"
                >
                  <Link
                    href={`/chat/${thread.id}`}
                    onClick={() => closeMobileSidebar()}
                  >
                    <AppIcon
                      name={getThreadIconName(thread)}
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="truncate text-sm">{thread.title}</span>
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
                    className="hover:bg-muted/50 text-muted-foreground transition-colors"
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
              className="hover:bg-muted/50 data-[active=true]:bg-muted/60 data-[active=true]:text-foreground data-[active=true]:font-medium transition-colors"
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
                  className="hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-foreground text-caption font-semibold text-background">
                    {user?.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate text-sm text-foreground/80">
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
