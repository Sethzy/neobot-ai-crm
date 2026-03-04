/**
 * Application sidebar with logo, navigation, and user section.
 * Uses shadcn Sidebar with icon-only collapse mode.
 * Navigation follows the Mission Control UX Spec §3.1 Primary Navigation.
 * @module components/layout/app-sidebar
 */
'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  MessageCircle,
  Gauge,
  CheckSquare,
  Zap,
  Brain,
  Users,
  BookOpen,
  FileText,
  Radio,
  Settings,
  LogOut,
  ChevronsUpDown,
  MoreHorizontal,
  Archive,
} from "lucide-react";
import { Logo } from "@/components/landing/Logo";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** AGENT section — primary operating surfaces */
const agentNavItems = [
  { label: "Chat", href: "/chat", icon: MessageCircle },
  { label: "Mission Control", href: "/mission-control", icon: Gauge },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Automations", href: "/automations", icon: Zap },
  { label: "Memory", href: "/memory", icon: Brain },
];

/** DATABASE section — data-centric surfaces */
const databaseNavItems = [
  { label: "CRM", href: "/crm", icon: Users },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Workspace", href: "/cases", icon: FileText },
  { label: "Channels", href: "/channels", icon: Radio },
];

export function AppSidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const { threads, archiveThread } = useThreads();

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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

  const renderNavItems = (items: typeof agentNavItems) =>
    items.map((item) => {
      const isActive =
        item.href === "/cases"
          ? pathname.startsWith("/cases")
          : pathname.startsWith(item.href);
      const Icon = item.icon;

      return (
        <SidebarMenuItem key={item.label}>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={item.label}
            className="hover:bg-muted/50 data-[active=true]:bg-muted/60 data-[active=true]:text-foreground data-[active=true]:font-medium data-[active=true]:hover:bg-muted/70 transition-colors"
          >
            <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-background">
      {/* Logo — tighter vertical padding */}
      <SidebarHeader className="px-3 pt-3 pb-2">
        <Logo />
      </SidebarHeader>

      {/* Navigation — reduced group spacing */}
      <SidebarContent className="px-2">
        {/* AGENT section */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold h-6">
            Agent
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(agentNavItems)}</SidebarMenu>
        </SidebarGroup>

        {/* DATABASE section */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold h-6">
            Database
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(databaseNavItems)}</SidebarMenu>
        </SidebarGroup>

        {/* SESSIONS section — thread history, always visible */}
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold h-6">
            Sessions
          </SidebarGroupLabel>
          <SidebarMenu>
            {threads.map((thread) => (
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
                    <span className="truncate text-sm">{thread.title}</span>
                  </Link>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction
                      aria-label={`More actions for ${thread.title}`}
                      className="opacity-0 group-hover/thread:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem onClick={() => handleArchiveThread(thread.id)}>
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ))}
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
              <Link href="/settings" onClick={() => isMobile && setOpenMobile(false)}>
                <Settings className="h-4 w-4" />
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
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-foreground text-[10px] font-semibold text-background">
                    {user?.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate text-sm text-foreground/80">
                    {user?.email}
                  </span>
                  <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-[--radix-dropdown-menu-trigger-width] min-w-48"
              >
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
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
