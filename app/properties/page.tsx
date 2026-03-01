import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { StatCard } from "@/components/property/stat-card";
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
  const client = await createPropertyServerClient();

  const properties = await fetchPropertySummaries(client, searchTerm);

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-full bg-sunder-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Free Public Resource
            </span>
            <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Private Property Profiles
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-600">
              Explore condo and private residential project transaction histories.
            </p>
          </div>

          <form action="/properties" method="get" className="mx-auto mt-10 max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="Try: The Sail, D09, or River Valley"
                className="h-12 w-full rounded-xl border border-[#E8DCC8] bg-white px-4 text-zinc-900 shadow-sm outline-none transition focus:border-sunder-green focus:ring-2 focus:ring-sunder-green/20"
              />
              <button
                type="submit"
                className="h-12 rounded-xl bg-sunder-green px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-sunder-green-dark"
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Results"
              value={formatCount(properties.length)}
              hint={searchTerm ? `Showing matches for "${searchTerm}"` : "Latest active projects"}
            />
            <StatCard
              label="Data Source"
              value="URA"
              hint="Private residential transactions"
            />
            <StatCard
              label="Coverage"
              value="Districts"
              hint="Projects across Singapore"
            />
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24 pt-8">
        <Container>
          <DataTable
            isEmpty={properties.length === 0}
            emptyMessage="No properties found. Try searching by project name, district number, or broader keyword."
          >
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-[#FAF6EF]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    District
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Transactions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Latest
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Avg Price
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {properties.map((property) => (
                  <tr
                    key={`${property.project}-${property.district ?? "none"}`}
                    className="hover:bg-zinc-50/80"
                  >
                    <td className="px-4 py-4 text-sm text-zinc-900">
                      <Link
                        href={{
                          pathname: `/properties/${property.slug}`,
                          query: {
                            project: property.project,
                            ...(property.district
                              ? { district: property.district }
                              : {}),
                          },
                        }}
                        className="font-medium text-zinc-900 hover:text-sunder-green"
                      >
                        {property.project}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {property.district ? `D${property.district}` : "Unknown"}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCount(property.transactionCount)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatDateMonthYear(property.latestTransactionDate)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCurrencySgd(property.averagePrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </Container>
      </section>
    </>
  );
}
