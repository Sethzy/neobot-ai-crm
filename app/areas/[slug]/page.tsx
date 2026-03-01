/** Area profile page — combined CEA and HDB transaction activity for a town/district. */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { StatCard } from "@/components/property/stat-card";
import { AreaTransactionsTableClient } from "./transactions-table";
import {
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  humanizeSlug,
  toNumber,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const revalidate = 21_600;

type CeaTransaction = {
  id: number;
  salesperson_reg_num: string | null;
  salesperson_name: string | null;
  transaction_date: string | null;
  property_type: string | null;
  transaction_type: string | null;
};

type HdbTransaction = {
  resale_price: number | string | null;
  month: string | null;
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
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string | string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { name } = await searchParams;

  const areaName = parseOptionalString(name) ?? humanizeSlug(slug);
  return {
    title: `${areaName} Property Transactions | Sunder`,
    description: `Area profile for ${areaName} with CEA and HDB transaction activity.`,
  };
}

export default async function AreaProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string | string[] }>;
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
  const { name } = await searchParams;

  const areaName = parseOptionalString(name) ?? humanizeSlug(slug);
  const client = await createPropertyServerClient();

  const [
    townCountResult,
    districtCountResult,
    townRecentResult,
    districtRecentResult,
    townLatestResult,
    districtLatestResult,
    hdbCountResult,
    hdbRecentResult,
    hdbLatestResult,
  ] = await Promise.all([
    client
      .from("cea_transactions")
      .select("id", { count: "exact", head: true })
      .eq("town", areaName),
    client
      .from("cea_transactions")
      .select("id", { count: "exact", head: true })
      .eq("district", areaName),
    client
      .from("cea_transactions")
      .select(
        "id, salesperson_reg_num, salesperson_name, transaction_date, property_type, transaction_type"
      )
      .eq("town", areaName)
      .order("transaction_date", { ascending: false })
      .limit(120),
    client
      .from("cea_transactions")
      .select(
        "id, salesperson_reg_num, salesperson_name, transaction_date, property_type, transaction_type"
      )
      .eq("district", areaName)
      .order("transaction_date", { ascending: false })
      .limit(120),
    client
      .from("cea_transactions")
      .select("transaction_date")
      .eq("town", areaName)
      .order("transaction_date", { ascending: false })
      .limit(1),
    client
      .from("cea_transactions")
      .select("transaction_date")
      .eq("district", areaName)
      .order("transaction_date", { ascending: false })
      .limit(1),
    client
      .from("hdb_resale_transactions")
      .select("id", { count: "exact", head: true })
      .eq("town", areaName),
    client
      .from("hdb_resale_transactions")
      .select("resale_price, month")
      .eq("town", areaName)
      .order("month", { ascending: false })
      .limit(1200),
    client
      .from("hdb_resale_transactions")
      .select("month")
      .eq("town", areaName)
      .order("month", { ascending: false })
      .limit(1),
  ]);

  for (const result of [
    townCountResult,
    districtCountResult,
    townRecentResult,
    districtRecentResult,
    townLatestResult,
    districtLatestResult,
    hdbCountResult,
    hdbRecentResult,
    hdbLatestResult,
  ]) {
    if (result.error) {
      throw new Error(`Failed to load area profile: ${result.error.message}`);
    }
  }

  const ceaCount = (townCountResult.count ?? 0) + (districtCountResult.count ?? 0);
  const hdbCount = hdbCountResult.count ?? 0;
  if (ceaCount === 0 && hdbCount === 0) notFound();

  const recentMerged = new Map<number, CeaTransaction>();
  for (const row of [
    ...((townRecentResult.data ?? []) as CeaTransaction[]),
    ...((districtRecentResult.data ?? []) as CeaTransaction[]),
  ]) {
    recentMerged.set(row.id, row);
  }

  const recentCea = Array.from(recentMerged.values())
    .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""))
    .slice(0, 120);

  const recentHdb = (hdbRecentResult.data ?? []) as HdbTransaction[];

  let hdbPriceTotal = 0;
  let hdbPriceCount = 0;
  for (const row of recentHdb) {
    const value = toNumber(row.resale_price);
    if (value !== null) {
      hdbPriceTotal += value;
      hdbPriceCount += 1;
    }
  }

  const latestDates = [
    townLatestResult.data?.[0]?.transaction_date ?? null,
    districtLatestResult.data?.[0]?.transaction_date ?? null,
    hdbLatestResult.data?.[0]?.month ?? null,
  ].filter((value): value is string => Boolean(value));
  const latestDate = latestDates.sort().reverse()[0] ?? null;

  const agentCount = new Set(
    recentCea
      .map((row) => row.salesperson_reg_num)
      .filter((value): value is string => Boolean(value))
  ).size;

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <Link
            href="/areas"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-sunder-green"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to areas
          </Link>

          <div className="mt-6 rounded-2xl border border-[#E8DCC8] border-t-4 border-t-sunder-green bg-white p-8 shadow-sm">
            <span className="inline-block rounded-full bg-sunder-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Area Profile
            </span>
            <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl">
              {areaName}
            </h1>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="CEA Transactions" value={formatCount(ceaCount)} />
            <StatCard label="HDB Transactions" value={formatCount(hdbCount)} />
            <StatCard
              label="Avg HDB Resale"
              value={
                hdbPriceCount > 0
                  ? formatCurrencySgd(hdbPriceTotal / hdbPriceCount)
                  : "N/A"
              }
            />
            <StatCard
              label="Active Agents (Recent)"
              value={formatCount(agentCount)}
              hint={`Latest: ${formatDateMonthYear(latestDate)}`}
            />
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <AreaTransactionsTableClient
            transactions={recentCea}
            areaName={areaName}
          />
        </Container>
      </section>
    </>
  );
}
