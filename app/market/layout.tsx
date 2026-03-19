/** Shared layout for all /market/* pages. */
import { BeamsBackground } from "@/components/ui/beams-background";
import { MarketSubNav } from "@/components/property/market-sub-nav";

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative grid min-h-screen grid-rows-[auto_1fr] bg-background">
      <BeamsBackground className="opacity-[0.03]" />
      <MarketSubNav />
      <main className="grid">{children}</main>
    </div>
  );
}
