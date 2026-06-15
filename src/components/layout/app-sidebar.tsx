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
import { Logo } from "@/components/landing/Logo";
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { ThreadUnreadIndicator } from "@/components/chat/thread-unread-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
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
import { cn } from "@/lib/utils";

interface NavigationItem {
  label: string;
  href: string;
  icon: AppIconName;
}

/** AGENT section — primary operating surfaces */
const agentNavItems: NavigationItem[] = [
  { label: "New Task", href: "/chat", icon: "compose" },
  { label: "Skills", href: "/skills", icon: "document" },
  { label: "Automations", href: "/automations", icon: "automations" },
  { label: "Channels", href: "/channels", icon: "channels" },
];

/** CRM section — records plus todos and meetings attached to them */
const crmNavItems: NavigationItem[] = [
  { label: "People", href: "/customers/people", icon: "contacts" },
  { label: "Companies", href: "/customers/companies", icon: "building" },
  { label: "Deals", href: "/customers/deals", icon: "deals" },
  { label: "Todos", href: "/tasks", icon: "tasks" },
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
  const {
    threads,
    unreadCount,
    isLoading: isThreadsLoading,
  } = useThreads();
  const visibleThreads = threads.slice(0, 5);
  const hasOverflow = threads.length > 5;
  const unreadCountLabel = unreadCount > 9 ? "9+" : String(unreadCount);

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
            className="border border-transparent transition-colors hover:bg-sidebar-accent/70 data-[active=true]:border-primary/15 data-[active=true]:bg-primary/[0.055] data-[active=true]:font-medium data-[active=true]:text-primary data-[active=true]:shadow-xs data-[active=true]:hover:bg-primary/[0.075]"
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
      {/* Logo */}
      <SidebarHeader className="px-3 pb-2 pt-3">
        <Logo />
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* AGENT section */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 type-caption text-muted-foreground/50 tracking-[0.12em] normal-case">
            Agent
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(agentNavItems)}</SidebarMenu>
        </SidebarGroup>

        {/* CRM section — search + records + todos + meetings */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 type-caption text-muted-foreground/50 tracking-[0.12em] normal-case">
            CRM
          </SidebarGroupLabel>
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
            {renderNavItems(crmNavItems)}
          </SidebarMenu>
        </SidebarGroup>

        {/* CHATS section — thread history */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="flex h-6 items-center justify-between type-caption text-muted-foreground/50 tracking-[0.12em] normal-case">
            <span>Chats</span>
            {unreadCount > 0 ? (
              <span className="text-muted-foreground/70">{`· ${unreadCountLabel}`}</span>
            ) : null}
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
              (() => {
                const isActive = pathname.startsWith(`/chat/${thread.id}`);
                const showUnreadState = thread.isUnread && !isActive;

                return (
                  <SidebarMenuItem key={thread.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={thread.title}
                      className="border border-transparent transition-colors hover:bg-sidebar-accent/70 data-[active=true]:border-primary/15 data-[active=true]:bg-primary/[0.055] data-[active=true]:font-medium data-[active=true]:text-primary data-[active=true]:shadow-xs"
                    >
                      <Link
                        href={`/chat/${thread.id}`}
                        onClick={() => closeMobileSidebar()}
                      >
                        <AppIcon
                          name={getThreadIconName(thread)}
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        />
                        <span className="flex min-w-0 flex-1 items-center gap-2.5">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate type-control",
                              showUnreadState && "font-semibold",
                            )}
                          >
                            {thread.title}
                          </span>
                          {showUnreadState ? <ThreadUnreadIndicator /> : null}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })()
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

      {/* Footer — Settings link + user dropdown with sign-out */}
      <SidebarFooter className="border-t border-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              tooltip="Settings"
              className="border border-transparent transition-colors hover:bg-sidebar-accent/70 data-[active=true]:border-primary/15 data-[active=true]:bg-primary/[0.055] data-[active=true]:font-medium data-[active=true]:text-primary data-[active=true]:shadow-xs"
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
                  id="sidebar-user-menu-trigger"
                  className="transition-colors hover:bg-sidebar-accent/70"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-foreground type-caption font-semibold text-background">
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
                <DropdownMenuItem disabled className="type-caption text-muted-foreground">
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
