/** Soft CTA banner for /market profile pages. */
import Link from "next/link";
import { AppIcon } from "@/components/icons/app-icons";

export function MarketCta() {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-6 sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AppIcon name="outputs" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">
              Need this data in your next proposal?
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sunder can pull market data automatically to help you craft
              winning proposals.
            </p>
          </div>
        </div>
        <Link
          href="/register"
          className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          Try Sunder Free
        </Link>
      </div>
    </div>
  );
}
