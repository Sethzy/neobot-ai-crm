/** Property profile page — private residential project transaction history. */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2, Clock, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { MarketCta } from "@/components/property/market-cta";
import { StatBar } from "@/components/property/stat-bar";
import { PropertyProfileCharts } from "./charts";
import { PropertyTransactionsTableClient } from "./transactions-table";
import {
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  formatPriceRange,
  median,
  parseFloorMidpoint,
  parseDistrictFromPropertySlug,
  toNumber,
  toPropertySlug,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

type PropertyContext = {
  project: string;
  district: string | null;
};

type UraTransactionRow = {
  contract_date: string | null;
  price: number | string | null;
  price_psf: number | string | null;
  area_sqm: number | string | null;
  floor_range: string | null;
  type_of_sale: string | null;
  property_type: string | null;
  tenure: string | null;
  no_of_units: number | null;
  street: string | null;
  market_segment: string | null;
};

type UraIdentityRow = {
  project: string | null;
  district: string | null;
};

type PropertyClient = Awaited<ReturnType<typeof createPropertyServerClient>>;

function normalizeOptionalString(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolvePropertyContext(
  client: PropertyClient,
  slug: string,
  queryProject: string | null,
  queryDistrict: string | null
): Promise<PropertyContext | null> {
  if (queryProject) {
    return { project: queryProject, district: queryDistrict };
  }

  const parsedDistrict = parseDistrictFromPropertySlug(slug);

  let lookupQuery = client
    .from("ura_transactions")
    .select("project, district")
    .order("contract_date", { ascending: false })
    .limit(5000);

  if (parsedDistrict !== null) {
    lookupQuery = lookupQuery.eq("district", parsedDistrict.toString());
  }

  const { data, error } = await lookupQuery;
  if (error) {
    throw new Error(`Failed to resolve property slug: ${error.message}`);
  }

  const uniqueEntries = new Map<string, PropertyContext>();
  for (const row of (data ?? []) as UraIdentityRow[]) {
    if (!row.project) continue;
    const key = `${row.project}::${row.district ?? ""}`;
    if (!uniqueEntries.has(key)) {
      uniqueEntries.set(key, { project: row.project, district: row.district });
    }
  }

  for (const entry of uniqueEntries.values()) {
    if (toPropertySlug(entry.project, entry.district) === slug) {
      return entry;
    }
  }

  return null;
}

async function fetchPropertyProfile(
  client: PropertyClient,
  context: PropertyContext
) {
  const countBaseQuery = client
    .from("ura_transactions")
    .select("id", { count: "exact", head: true })
    .eq("project", context.project);
  const countQuery = context.district
    ? countBaseQuery.eq("district", context.district)
    : countBaseQuery.is("district", null);

  const latestDateBaseQuery = client
    .from("ura_transactions")
    .select("contract_date")
    .eq("project", context.project)
    .order("contract_date", { ascending: false })
    .limit(1);
  const latestDateQuery = context.district
    ? latestDateBaseQuery.eq("district", context.district)
    : latestDateBaseQuery.is("district", null);

  const metricsBaseQuery = client
    .from("ura_transactions")
    .select("price, price_psf, type_of_sale")
    .eq("project", context.project)
    .order("contract_date", { ascending: false })
    .limit(2000);
  const metricsQuery = context.district
    ? metricsBaseQuery.eq("district", context.district)
    : metricsBaseQuery.is("district", null);

  const recentTransactionsBaseQuery = client
    .from("ura_transactions")
    .select(
      "contract_date, price, price_psf, area_sqm, floor_range, type_of_sale, property_type, tenure, no_of_units, street, market_segment"
    )
    .eq("project", context.project)
    .order("contract_date", { ascending: false })
    .limit(500);
  const recentTransactionsQuery = context.district
    ? recentTransactionsBaseQuery.eq("district", context.district)
    : recentTransactionsBaseQuery.is("district", null);

  const [
    countResult,
    latestDateResult,
    metricsResult,
    recentTransactionsResult,
  ] = await Promise.all([
    countQuery,
    latestDateQuery,
    metricsQuery,
    recentTransactionsQuery,
  ]);

  for (const result of [countResult, latestDateResult, metricsResult, recentTransactionsResult]) {
    if (result.error) {
      throw new Error(`Failed to load property profile: ${result.error.message}`);
    }
  }

  const transactionCount = countResult.count ?? 0;
  if (transactionCount === 0) return null;

  const latestDate = latestDateResult.data?.[0]?.contract_date ?? null;

  let priceTotal = 0;
  let priceCount = 0;
  let psfTotal = 0;
  let psfCount = 0;
  const prices: number[] = [];
  const saleTypeMap = new Map<string, number>();

  for (const row of metricsResult.data ?? []) {
    const price = toNumber(row.price);
    const pricePsf = toNumber(row.price_psf);

    if (price !== null) {
      priceTotal += price;
      priceCount += 1;
      prices.push(price);
    }
    if (pricePsf !== null) {
      psfTotal += pricePsf;
      psfCount += 1;
    }

    const saleType = row.type_of_sale ?? "Unknown";
    saleTypeMap.set(saleType, (saleTypeMap.get(saleType) ?? 0) + 1);
  }

  const saleTypeBreakdown = Array.from(saleTypeMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  return {
    transactionCount,
    latestTransactionDate: latestDate,
    averagePrice: priceCount > 0 ? priceTotal / priceCount : null,
    averagePsf: psfCount > 0 ? psfTotal / psfCount : null,
    medianPrice: median(prices),
    priceRange: { min: minPrice, max: maxPrice },
    saleTypeBreakdown,
    recentTransactions: (recentTransactionsResult.data ?? []) as UraTransactionRow[],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug.replace(/-/g, " ")} | Singapore Property Transactions`,
    description:
      "Public property profile with private transaction records and pricing trends.",
  };
}

export default async function PropertyProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ project?: string | string[]; district?: string | string[] }>;
}) {
  if (!isPropertySupabaseConfigured()) {
    return (
      <ConfigNotice
        title="Property Data Is Not Configured"
        description="The public property dataset is hosted on a separate Supabase project."
      />
    );
  }

  const { slug } = await params;
  const { project, district } = await searchParams;

  const client = await createPropertyServerClient();
  const context = await resolvePropertyContext(
    client,
    decodeURIComponent(slug),
    normalizeOptionalString(project),
    normalizeOptionalString(district)
  );

  if (!context) notFound();

  const profile = await fetchPropertyProfile(client, context);
  if (!profile) notFound();
  const firstTxn = profile.recentTransactions[0];
  const propertyType = firstTxn?.property_type ?? null;
  const tenure = firstTxn?.tenure ?? null;
  const marketSegment = firstTxn?.market_segment ?? null;
  const floorPsfPoints = profile.recentTransactions
    .map((transaction) => ({
      floor: parseFloorMidpoint(transaction.floor_range),
      psf: toNumber(transaction.price_psf),
    }))
    .filter(
      (point): point is { floor: number; psf: number } =>
        point.floor !== null && point.psf !== null
    );

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <Link
            href="/market/properties"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-sunder-green"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to properties
          </Link>

          <div className="mt-6">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl">
              {context.project}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {context.district ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  <MapPin className="h-3 w-3" />
                  D{context.district}
                  {marketSegment ? `: ${marketSegment}` : ""}
                </span>
              ) : null}
              {propertyType ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  <Building2 className="h-3 w-3" />
                  {propertyType}
                </span>
              ) : null}
              {tenure ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  <Clock className="h-3 w-3" />
                  {tenure}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-8">
            <StatBar
              items={[
                { label: "Total Transactions", value: formatCount(profile.transactionCount) },
                { label: "Avg PSF", value: formatCurrencySgd(profile.averagePsf) },
                { label: "Median Price", value: formatCurrencySgd(profile.medianPrice) },
                { label: "Price Range", value: formatPriceRange(profile.priceRange.min, profile.priceRange.max) },
                { label: "Last Sale", value: formatDateMonthYear(profile.latestTransactionDate) },
              ]}
            />
          </div>

          {/* Charts */}
          <PropertyProfileCharts
            dates={profile.recentTransactions.map((t) => t.contract_date)}
            saleTypeBreakdown={profile.saleTypeBreakdown}
            psfPoints={profile.recentTransactions.map((t) => ({
              date: t.contract_date,
              value: toNumber(t.price_psf),
            }))}
            floorPsfPoints={floorPsfPoints}
          />
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <PropertyTransactionsTableClient
            transactions={profile.recentTransactions}
          />
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
