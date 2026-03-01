import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, FileText } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { MarketSearchBox } from "@/components/property/market-search-box";
import {
  cleanSearchTerm,
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  toNumber,
  toPropertySlug,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const metadata: Metadata = {
  title: "Singapore Property Profiles | Sunder",
  description:
    "Search Singapore private residential projects and view transaction histories.",
};

type PropertyTransactionRow = {
  project: string | null;
  district: string | null;
  contract_date: string | null;
  price: number | string | null;
};

type PropertySummary = {
  project: string;
  district: string | null;
  slug: string;
  sampleCount: number;
  latestTransactionDate: string | null;
  averagePrice: number | null;
  transactionCount: number;
};

type PropertyClient = Awaited<ReturnType<typeof createPropertyServerClient>>;

const PAGE_SIZE = 24;

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
}

async function fetchPropertySummaries(
  client: PropertyClient,
  searchTerm: string
): Promise<PropertySummary[]> {
  let query = client
    .from("ura_transactions")
    .select("project, district, contract_date, price")
    .order("contract_date", { ascending: false })
    .limit(searchTerm ? 4000 : 3000);

  if (searchTerm) {
    query = query.ilike("project", `%${searchTerm}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load properties: ${error.message}`);
  }

  const aggregateMap = new Map<
    string,
    {
      project: string;
      district: string | null;
      latestTransactionDate: string | null;
      sampleCount: number;
      priceTotal: number;
      priceCount: number;
    }
  >();

  for (const row of (data ?? []) as PropertyTransactionRow[]) {
    if (!row.project) {
      continue;
    }

    const key = `${row.project}::${row.district ?? ""}`;
    const current = aggregateMap.get(key) ?? {
      project: row.project,
      district: row.district,
      latestTransactionDate: row.contract_date,
      sampleCount: 0,
      priceTotal: 0,
      priceCount: 0,
    };

    current.sampleCount += 1;
    if (!current.latestTransactionDate && row.contract_date) {
      current.latestTransactionDate = row.contract_date;
    }

    const price = toNumber(row.price);
    if (price !== null) {
      current.priceTotal += price;
      current.priceCount += 1;
    }

    aggregateMap.set(key, current);
  }

  const initialSummaries = Array.from(aggregateMap.values())
    .sort((a, b) => {
      const aDate = a.latestTransactionDate ? Date.parse(a.latestTransactionDate) : 0;
      const bDate = b.latestTransactionDate ? Date.parse(b.latestTransactionDate) : 0;
      return bDate - aDate;
    })
    .slice(0, PAGE_SIZE)
    .map((entry) => ({
      project: entry.project,
      district: entry.district,
      slug: toPropertySlug(entry.project, entry.district),
      sampleCount: entry.sampleCount,
      latestTransactionDate: entry.latestTransactionDate,
      averagePrice:
        entry.priceCount > 0 ? entry.priceTotal / entry.priceCount : null,
      transactionCount: entry.sampleCount,
    }));

  const enriched = await Promise.all(
    initialSummaries.map(async (summary) => {
      const countBaseQuery = client
        .from("ura_transactions")
        .select("id", { count: "exact", head: true })
        .eq("project", summary.project);
      const countQuery = summary.district
        ? countBaseQuery.eq("district", summary.district)
        : countBaseQuery.is("district", null);

      const latestBaseQuery = client
        .from("ura_transactions")
        .select("contract_date")
        .eq("project", summary.project)
        .order("contract_date", { ascending: false })
        .limit(1);
      const latestQuery = summary.district
        ? latestBaseQuery.eq("district", summary.district)
        : latestBaseQuery.is("district", null);

      const [countResult, latestResult] = await Promise.all([
        countQuery,
        latestQuery,
      ]);

      if (countResult.error) {
        throw new Error(
          `Failed to load transaction count for ${summary.project}: ${countResult.error.message}`
        );
      }

      if (latestResult.error) {
        throw new Error(
          `Failed to load latest transaction for ${summary.project}: ${latestResult.error.message}`
        );
      }

      return {
        ...summary,
        transactionCount: countResult.count ?? summary.sampleCount,
        latestTransactionDate:
          latestResult.data?.[0]?.contract_date ?? summary.latestTransactionDate,
      };
    })
  );

  return enriched;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  if (!isPropertySupabaseConfigured()) {
    return (
      <ConfigNotice
        title="Property Data Is Not Configured"
        description="The public property dataset is hosted on a separate Supabase project."
      />
    );
  }

  const { q } = await searchParams;
  const searchTerm = parseSearchTerm(q);

  const hasSearch = searchTerm.length > 0;
  let properties: PropertySummary[] = [];

  if (hasSearch) {
    const client = await createPropertyServerClient();
    properties = await fetchPropertySummaries(client, searchTerm);
  }

  return (
    <>
      <section className={hasSearch ? "py-10 sm:py-14" : "flex min-h-[calc(100vh-49px)] flex-col justify-center pb-24"}>
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Private Property Profiles
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-600">
              Explore condo and private residential project transaction histories.
            </p>

            <MarketSearchBox
              action="/market/properties"
              type="properties"
              placeholder="Try: The Sail, D09, or River Valley"
              defaultValue={searchTerm}
            />

            {!hasSearch ? (
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <Building2 className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">3,000+</p>
                    <p className="text-xs text-zinc-500">Projects tracked</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <FileText className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">URA</p>
                    <p className="text-xs text-zinc-500">Transaction data</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Container>
      </section>

      {hasSearch ? (
        <section className="pb-16 sm:pb-20">
          <Container>
            <p className="mb-4 text-sm text-zinc-500">
              {formatCount(properties.length)} results for &ldquo;{searchTerm}&rdquo;
            </p>
            <DataTable
              isEmpty={properties.length === 0}
              emptyMessage="No properties found. Try searching by project name, district number, or broader keyword."
            >
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="border-b-2 border-[#E8DCC8] bg-[#FAF6EF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Project
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      District
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Transactions
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Latest
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Avg Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {properties.map((property, i) => (
                    <tr
                      key={`${property.project}-${property.district ?? "none"}`}
                      className={`transition-colors hover:bg-sunder-green/[0.04] ${i % 2 === 1 ? "bg-zinc-50/40" : ""}`}
                    >
                      <td className="px-4 py-4 text-sm text-zinc-900">
                        <Link
                          href={{
                            pathname: `/market/properties/${property.slug}`,
                            query: {
                              project: property.project,
                              ...(property.district
                                ? { district: property.district }
                                : {}),
                            },
                          }}
                          className="group/link inline-flex items-center gap-1 font-medium text-zinc-900 hover:text-sunder-green"
                        >
                          {property.project}
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover/link:opacity-100" />
                        </Link>
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {property.district ? `D${property.district}` : "Unknown"}
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {formatCount(property.transactionCount)}
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {formatDateMonthYear(property.latestTransactionDate)}
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {formatCurrencySgd(property.averagePrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          </Container>
        </section>
      ) : null}
    </>
  );
}
