/**
 * Inner left-rail nav for the full-screen settings surface.
 * Groups pages under USER / AGENT / WORKSPACE. Top of the rail has a back link
 * that exits the settings surface and returns the user to the main app.
 * @module components/settings/settings-nav
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
}

interface NavSection {
  label: string;
  items: readonly NavItem[];
}

export const SETTINGS_NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "User",
    items: [
      { label: "Profile", href: "/settings/profile" },
      { label: "Notifications", href: "/settings/notifications" },
    ],
  },
  {
    label: "Agent",
    items: [
      { label: "General", href: "/settings/agent/general" },
      { label: "Memory", href: "/settings/agent/memory" },
      { label: "Connections", href: "/settings/agent/connections" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Billing", href: "/settings/workspace/billing" },
      { label: "Usage", href: "/settings/workspace/usage" },
    ],
  },
] as const;

export function SettingsNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Settings" className="flex w-full flex-col gap-5">
      <Link
        href="/chat"
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Settings
      </Link>

      {SETTINGS_NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {section.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      isActive &&
                        "bg-muted/60 font-medium text-foreground hover:bg-muted/70",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
