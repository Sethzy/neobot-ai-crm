import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { StatCard } from "@/components/property/stat-card";
import {
  cleanSearchTerm,
  formatCount,
  formatDateMonthYear,
  toAreaSlug,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const metadata: Metadata = {
  title: "Singapore Property Areas | Sunder",
  description:
    "Explore Singapore property transaction activity by town and district areas.",
};

export const revalidate = 21_600;

type CeaRow = {
  town: string | null;
  district: string | null;
  transaction_date: string | null;
};

type AreaSeed = {
  name: string;
  transactionCount: number;
  latestDate: string | null;
};

const LIST_LIMIT = 30;
const SAMPLE_LIMIT = 90_000;

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
}

function normalizeAreaName(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

async function fetchAreas(searchTerm: string): Promise<AreaSeed[]> {
  const client = await createPropertyServerClient();

  const query = client
    .from("cea_transactions")
    .select("town, district, transaction_date")
    .order("transaction_date", { ascending: false })
    .limit(SAMPLE_LIMIT);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load areas: ${error.message}`);
  }

  const rows = (data ?? []) as CeaRow[];
  if (!searchTerm) {
    return aggregateAreas(rows);
  }

  const loweredSearch = searchTerm.toLowerCase();
  const filtered = rows.filter((row) => {
    const town = row.town?.toLowerCase() ?? "";
    const district = row.district?.toLowerCase() ?? "";
    return town.includes(loweredSearch) || district.includes(loweredSearch);
  });

  return aggregateAreas(filtered);
}

function aggregateAreas(rows: CeaRow[]): AreaSeed[] {
  const grouped = new Map<string, { transactionCount: number; latestDate: string | null }>();

  for (const row of rows) {
    const areaName = normalizeAreaName(row.town) ?? normalizeAreaName(row.district);
    if (!areaName) {
      continue;
    }

    const current = grouped.get(areaName) ?? {
      transactionCount: 0,
      latestDate: row.transaction_date,
    };

    current.transactionCount += 1;
    if (!current.latestDate && row.transaction_date) {
      current.latestDate = row.transaction_date;
    }

    grouped.set(areaName, current);
  }

  return Array.from(grouped.entries())
    .map(([name, value]) => ({
      name,
      transactionCount: value.transactionCount,
      latestDate: value.latestDate,
    }))
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, LIST_LIMIT);
}

export default async function AreasPage({
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
  const areas = await fetchAreas(searchTerm);

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-full bg-sunder-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Free Public Resource
            </span>
            <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Property Areas
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-600">
              Track transaction activity by neighborhood, town, and district.
            </p>
          </div>

          <form action="/areas" method="get" className="mx-auto mt-10 max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="Try: Tampines, Bukit Timah, D09"
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
            <StatCard label="Results" value={formatCount(areas.length)} />
            <StatCard label="Source" value="CEA + HDB" hint="Town and district coverage" />
            <StatCard
              label="Method"
              value="Fast Sample"
              hint="Aggregated from recent transaction windows"
            />
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24 pt-8">
        <Container>
          <DataTable
            isEmpty={areas.length === 0}
            emptyMessage="No areas found. Try searching with a broader town or district keyword."
          >
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-[#FAF6EF]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Area
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Recent Transactions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Latest Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {areas.map((area) => (
                  <tr key={area.name} className="hover:bg-zinc-50/80">
                    <td className="px-4 py-4 text-sm text-zinc-900">
                      <Link
                        href={{
                          pathname: `/areas/${toAreaSlug(area.name)}`,
                          query: { name: area.name },
                        }}
                        className="font-medium text-zinc-900 hover:text-sunder-green"
                      >
                        {area.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCount(area.transactionCount)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatDateMonthYear(area.latestDate)}
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
