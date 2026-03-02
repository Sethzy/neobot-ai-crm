/** Soft CTA banner for /market profile pages. */
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function MarketCta() {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50/50 p-6 sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
          <div>
            <p className="font-semibold text-zinc-900">
              Need this data in your next proposal?
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              NeoBot can pull market data automatically to help you craft
              winning proposals.
            </p>
          </div>
        </div>
        <Link
          href="/register"
          className="shrink-0 rounded-full bg-sunder-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sunder-green-dark"
        >
          Try NeoBot Free
        </Link>
      </div>
    </div>
  );
}
