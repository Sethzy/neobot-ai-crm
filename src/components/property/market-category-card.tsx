/** Clickable category card for the /market hub page. */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

type MarketCategoryCardProps = {
  href: string;
  title: string;
  description: string;
  count: string;
  countLabel?: string;
  icon: ReactNode;
};

export function MarketCategoryCard({
  href,
  title,
  description,
  count,
  countLabel,
  icon,
}: MarketCategoryCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-[#E8DCC8] bg-white p-6 shadow-sm transition hover:border-sunder-green/30 hover:bg-sunder-green/[0.02] hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sunder-green/10 text-sunder-green ring-1 ring-sunder-green/10">
          {icon}
        </span>
        <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-sunder-green" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{description}</p>
      <div className="mt-auto pt-4">
        <p className="text-2xl font-bold tracking-tight text-sunder-green">
          {count}
        </p>
        {countLabel ? (
          <p className="text-xs text-zinc-500">{countLabel}</p>
        ) : null}
      </div>
    </Link>
  );
}
