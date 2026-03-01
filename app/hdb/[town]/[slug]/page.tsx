/** HDB street profile page — resale transaction history and pricing. */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { StatCard } from "@/components/property/stat-card";
import { HdbProfileCharts } from "./charts";
import { HdbTransactionsTableClient } from "./transactions-table";
import {
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  formatPriceRange,
  humanizeSlug,
  median,
  toNumber,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const revalidate = 21_600;

type HdbRow = {
  month: string | null;
  flat_type: string | null;
  storey_range: string | null;
  floor_area_sqm: number | string | null;
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
      .select("month, flat_type, storey_range, floor_area_sqm, resale_price")
      .eq("town", displayTown)
      .eq("street_name", streetName)
      .order("month", { ascending: false })
      .limit(200),
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

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <Link
            href="/hdb"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-sunder-green"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to HDB streets
          </Link>

          <div className="mt-6 rounded-2xl border border-[#E8DCC8] border-t-4 border-t-sunder-green bg-white p-8 shadow-sm">
            <span className="inline-block rounded-full bg-sunder-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              HDB Street Profile
            </span>
            <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl">
              {streetName}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{displayTown}</p>
          </div>

          <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Transactions"
              value={formatCount(transactionCount)}
            />
            <StatCard
              label="Average Resale Price"
              value={formatCurrencySgd(avgPrice)}
            />
            <StatCard
              label="Median Resale Price"
              value={formatCurrencySgd(medianPrice)}
            />
            <StatCard
              label="Price Range"
              value={formatPriceRange(minPrice, maxPrice)}
            />
            <StatCard
              label="Latest Month"
              value={formatDateMonthYear(latestResult.data?.[0]?.month ?? null)}
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
          />
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <HdbTransactionsTableClient transactions={rows} />
        </Container>
      </section>
    </>
  );
}
