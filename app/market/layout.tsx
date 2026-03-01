/** Shared layout for all /market/* pages. */
import { Footer } from "@/components/landing/Footer";
import { MarketSubNav } from "@/components/property/market-sub-nav";

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-page min-h-screen bg-[#F5EEE1] selection:bg-indigo-100 selection:text-indigo-900">
      <MarketSubNav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
