/**
 * Application sidebar with logo, navigation, and user section.
 * Uses shadcn Sidebar with icon-only collapse mode.
 * Navigation follows the Mission Control UX Spec §3.1 Primary Navigation.
 * @module components/layout/app-sidebar
 */
'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

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
  { label: "Documents", href: "/cases", icon: FileText },
  { label: "Channels", href: "/channels", icon: Radio },
];

export function AppSidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user } = useSession();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

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
            <Link href={item.href}>
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="none" className="border-r border-border/40 bg-background">
      {/* Logo */}
      <SidebarHeader className="px-3 pt-5 pb-6">
        <Logo />
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="px-2 pt-1">
        {/* AGENT section */}
        <SidebarGroup>
          <SidebarGroupLabel>Agent</SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(agentNavItems)}</SidebarMenu>
        </SidebarGroup>

        {/* DATABASE section */}
        <SidebarGroup>
          <SidebarGroupLabel>Database</SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(databaseNavItems)}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: Settings + User */}
      <SidebarFooter className="border-t border-border/40 px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              tooltip="Settings"
              className="hover:bg-muted/50 data-[active=true]:bg-muted/60 data-[active=true]:text-foreground data-[active=true]:font-medium transition-colors"
            >
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={user?.email || "User"}
              className="hover:bg-transparent cursor-default"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-xs font-medium text-foreground/80">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <span className="truncate text-sm text-foreground/90">
                {user?.email}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={handleSignOut}
              className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/40"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

    </Sidebar>
  );
}
