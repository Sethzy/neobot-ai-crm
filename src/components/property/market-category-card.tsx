/** Clickable category card for the /market hub page. */
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";

type MarketCategoryCardProps = {
  href: string;
  title: string;
  description: string;
  count: string;
  countLabel?: string;
  icon: AppIconName;
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
      className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-primary/30 hover:bg-primary/5 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <AppIcon name={icon} className="h-6 w-6" />
        </span>
        <AppIcon
          name="arrowRight"
          className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-auto pt-4">
        <p className="text-2xl font-bold tracking-tight text-primary">
          {count}
        </p>
        {countLabel ? (
          <p className="text-xs text-muted-foreground">{countLabel}</p>
        ) : null}
      </div>
    </Link>
  );
}
