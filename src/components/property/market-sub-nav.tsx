/** Primary navigation bar for all /market/* pages. */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { Logo } from "@/components/landing/Logo";

const NAV_ITEMS = [
  { href: "/market/agents", label: "Agents", icon: "contacts" },
  { href: "/market/properties", label: "Properties", icon: "property" },
  { href: "/market/hdb", label: "HDB", icon: "home" },
  { href: "/market/agencies", label: "Agencies", icon: "agency" },
  { href: "/market/areas", label: "Areas", icon: "area" },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: AppIconName }>;

export function MarketSubNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <nav
      aria-label="Market data navigation"
      className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="mr-6 shrink-0 py-3 transition-opacity hover:opacity-80">
          <Logo className="h-6 w-auto sm:h-7" />
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const isActive =
              currentPath === href || currentPath.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <AppIcon name={icon} className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
