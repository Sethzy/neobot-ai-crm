/** Shared layout for all /market/* pages. */
import { BeamsBackground } from "@/components/ui/beams-background";
import { MarketSubNav } from "@/components/property/market-sub-nav";

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-page relative grid min-h-screen grid-rows-[auto_1fr] bg-zinc-50 selection:bg-indigo-100 selection:text-indigo-900">
      <BeamsBackground className="opacity-5" />
      <MarketSubNav />
      <main className="grid">{children}</main>
    </div>
  );
}
