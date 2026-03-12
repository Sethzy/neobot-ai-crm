/**
 * Reusable stat-card link used on the customers dashboard.
 * @module components/crm/dashboard/stat-card
 */
import Link from "next/link";

import { AppIcon, type AppIconName } from "@/components/icons/app-icons";

interface StatCardProps {
  href: string;
  iconName: AppIconName;
  label: string;
  primaryMetric: string;
  secondaryMetric?: string;
}

/**
 * Renders a compact metric card that navigates to the relevant drill-down page.
 */
export function StatCard({
  href,
  iconName,
  label,
  primaryMetric,
  secondaryMetric,
}: StatCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border/50 bg-card p-6 shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/55 text-foreground/70 transition-colors group-hover:bg-muted">
          <AppIcon name={iconName} className="h-5 w-5" />
        </div>
        <AppIcon
          name="arrowUpRight"
          className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/80"
        />
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          {primaryMetric}
        </p>
        <p className="mt-2 min-h-5 text-sm text-muted-foreground">
          {secondaryMetric ?? "\u00a0"}
        </p>
      </div>
    </Link>
  );
}
