/** Shared layout for all /market/* pages. */
import { MarketSubNav } from "@/components/property/market-sub-nav";

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-page grid min-h-screen grid-rows-[auto_1fr] bg-[#F5EEE1] selection:bg-indigo-100 selection:text-indigo-900">
      <MarketSubNav />
      <main className="grid">{children}</main>
    </div>
  );
}
