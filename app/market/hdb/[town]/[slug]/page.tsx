/** HDB street profile page — resale transaction history and pricing. */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Calendar, Home, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { MarketCta } from "@/components/property/market-cta";
import { StatBar } from "@/components/property/stat-bar";
import { HdbProfileCharts } from "./charts";
import { HdbTransactionsTableClient } from "./transactions-table";
import {
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  formatPriceRange,
  humanizeSlug,
  median,
  parseFloorMidpoint,
  toNumber,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const revalidate = 21_600;

type HdbRow = {
  month: string | null;
  flat_type: string | null;
  block: string | null;
  street_name: string | null;
  storey_range: string | null;
  floor_area_sqm: number | string | null;
  flat_model: string | null;
  lease_commence_date: number | null;
  remaining_lease: string | null;
  resale_price: number | string | null;
};

function parseOptionalString(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ town: string; slug: string }>;
  searchParams: Promise<{ town?: string | string[]; street?: string | string[] }>;
}): Promise<Metadata> {
  const { town, slug } = await params;
  const { street } = await searchParams;

  const displayTown = humanizeSlug(town);
  const displayStreet = parseOptionalString(street) ?? humanizeSlug(slug);

  return {
    title: `${displayStreet}, ${displayTown} | HDB Resale Transactions`,
    description: `HDB resale profile for ${displayStreet} in ${displayTown}, including pricing and recent transaction records.`,
  };
}

export default async function HdbStreetProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ town: string; slug: string }>;
  searchParams: Promise<{ town?: string | string[]; street?: string | string[] }>;
}) {
  if (!isPropertySupabaseConfigured()) {
    return (
      <ConfigNotice
        title="Property Data Is Not Configured"
        description="The public property dataset is hosted on a separate Supabase project."
      />
    );
  }

  const { town, slug } = await params;
  const { street, town: townQuery } = await searchParams;

  const displayTown = parseOptionalString(townQuery) ?? humanizeSlug(town);
  const streetName = parseOptionalString(street) ?? humanizeSlug(slug);

  const client = await createPropertyServerClient();
  const [countResult, latestResult, recentResult] = await Promise.all([
    client
      .from("hdb_resale_transactions")
      .select("id", { count: "exact", head: true })
      .eq("town", displayTown)
      .eq("street_name", streetName),
    client
      .from("hdb_resale_transactions")
      .select("month")
      .eq("town", displayTown)
      .eq("street_name", streetName)
      .order("month", { ascending: false })
      .limit(1),
    client
      .from("hdb_resale_transactions")
      .select(
        "month, flat_type, block, street_name, storey_range, floor_area_sqm, flat_model, lease_commence_date, remaining_lease, resale_price"
      )
      .eq("town", displayTown)
      .eq("street_name", streetName)
      .order("month", { ascending: false }),
  ]);

  for (const result of [countResult, latestResult, recentResult]) {
    if (result.error) {
      throw new Error(`Failed to load HDB street profile: ${result.error.message}`);
    }
  }

  const transactionCount = countResult.count ?? 0;
  if (transactionCount === 0) notFound();

  const rows = (recentResult.data ?? []) as HdbRow[];

  const prices = rows
    .map((row) => toNumber(row.resale_price))
    .filter((value): value is number => value !== null);

  const avgPrice =
    prices.length > 0
      ? prices.reduce((sum, value) => sum + value, 0) / prices.length
      : null;

  const medianPrice = median(prices);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  /** Flat type breakdown for donut chart. */
  const flatTypeMap = new Map<string, number>();
  for (const row of rows) {
    const label = row.flat_type ?? "Unknown";
    flatTypeMap.set(label, (flatTypeMap.get(label) ?? 0) + 1);
  }
  const flatTypeBreakdown = Array.from(flatTypeMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const psfValues = rows
    .map((row) => {
      const price = toNumber(row.resale_price);
      const sqm = toNumber(row.floor_area_sqm);
      if (price === null || sqm === null || sqm <= 0) return null;
      return Math.round(price / (sqm * 10.764));
    })
    .filter((value): value is number => value !== null);
  const avgPsf =
    psfValues.length > 0
      ? Math.round(psfValues.reduce((sum, value) => sum + value, 0) / psfValues.length)
      : null;
  const storeyPsfPoints = rows
    .map((row) => {
      const floor = parseFloorMidpoint(row.storey_range);
      const price = toNumber(row.resale_price);
      const sqm = toNumber(row.floor_area_sqm);
      if (floor === null || price === null || sqm === null || sqm <= 0) return null;
      return { floor, psf: Math.round(price / (sqm * 10.764)) };
    })
    .filter((point): point is { floor: number; psf: number } => point !== null);
  const dominantFlatTypes = flatTypeBreakdown
    .slice(0, 3)
    .map((entry) => entry.label)
    .join(", ");
  const leaseYears = rows
    .map((row) => row.lease_commence_date)
    .filter((year): year is number => year !== null && year > 0);
  const earliestLease = leaseYears.length > 0 ? Math.min(...leaseYears) : null;

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <Link
            href="/market/hdb"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-sunder-green"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to HDB streets
          </Link>

          <div className="mt-6 rounded-2xl border border-[#E8DCC8] border-t-4 border-t-sunder-green bg-white p-6 shadow-sm">
            <span className="inline-block rounded-full bg-sunder-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              HDB Street Profile
            </span>
            <h1 className="mt-2 font-serif text-2xl font-medium tracking-tight text-zinc-900 sm:text-3xl">
              {streetName}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                <MapPin className="h-3 w-3" />
                {displayTown}
              </span>
              {dominantFlatTypes ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  <Home className="h-3 w-3" />
                  {dominantFlatTypes}
                </span>
              ) : null}
              {earliestLease ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  <Calendar className="h-3 w-3" />
                  Lease from {earliestLease}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-8">
            <StatBar
              items={[
                { label: "Transactions", value: formatCount(transactionCount) },
                { label: "Average Resale Price", value: formatCurrencySgd(avgPrice) },
                { label: "Median Resale Price", value: formatCurrencySgd(medianPrice) },
                { label: "Price Range", value: formatPriceRange(minPrice, maxPrice) },
                { label: "Avg PSF", value: avgPsf ? `$${avgPsf.toLocaleString()}` : "N/A" },
                { label: "Latest Month", value: formatDateMonthYear(latestResult.data?.[0]?.month ?? null) },
              ]}
            />
          </div>

          {/* Charts */}
          <HdbProfileCharts
            dates={rows.map((r) => r.month)}
            flatTypeBreakdown={flatTypeBreakdown}
            pricePoints={rows.map((r) => ({
              date: r.month,
              value: toNumber(r.resale_price),
            }))}
            storeyPsfPoints={storeyPsfPoints}
          />
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <HdbTransactionsTableClient transactions={rows} />
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <MarketCta />
        </Container>
      </section>
    </>
  );
}
