/** Primary navigation bar for all /market/* pages. */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Briefcase, Home, MapPin, Users } from "lucide-react";
import { Logo } from "@/components/landing/Logo";

const NAV_ITEMS = [
  { href: "/market/agents", label: "Agents", icon: Users },
  { href: "/market/properties", label: "Properties", icon: Building2 },
  { href: "/market/hdb", label: "HDB", icon: Home },
  { href: "/market/agencies", label: "Agencies", icon: Briefcase },
  { href: "/market/areas", label: "Areas", icon: MapPin },
] as const;

export function MarketSubNav() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <nav
      aria-label="Market data navigation"
      className="sticky top-0 z-50 border-b border-[#E8DCC8] bg-[#F5EEE1]/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="mr-6 shrink-0 py-3 transition-opacity hover:opacity-80">
          <Logo className="h-6 w-auto sm:h-7" />
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              currentPath === href || currentPath.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? "border-sunder-green text-sunder-green"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
