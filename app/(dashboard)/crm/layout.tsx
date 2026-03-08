/**
 * Shared CRM route layout with tab shell for sub-pages.
 * @module app/(dashboard)/crm/layout
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface CrmLayoutProps {
  children: ReactNode;
}

export default function CrmLayout({ children }: CrmLayoutProps) {
  const pathname = usePathname() ?? "";
  const isContactsActive = pathname.startsWith("/crm/contacts");
  const isDealsActive = pathname.startsWith("/crm/deals");
  const isCompaniesActive = pathname.startsWith("/crm/companies");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border/40 px-4 pt-4 md:px-12">
        <nav className="flex items-center gap-5">
          <Link
            href="/crm/contacts"
            className={[
              "border-b-2 px-1 pb-2 text-sm transition-colors",
              isContactsActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Contacts
          </Link>
          <Link
            href="/crm/deals"
            className={[
              "border-b-2 px-1 pb-2 text-sm transition-colors",
              isDealsActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Deals
          </Link>
          <Link
            href="/crm/companies"
            className={[
              "border-b-2 px-1 pb-2 text-sm transition-colors",
              isCompaniesActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Companies
          </Link>
        </nav>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
