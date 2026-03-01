import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, FileText } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { MarketSearchBox } from "@/components/property/market-search-box";
import {
  cleanSearchTerm,
  formatAreaName,
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

  const hasSearch = searchTerm.length > 0;
  let areas: AreaSeed[] = [];

  if (hasSearch) {
    areas = await fetchAreas(searchTerm);
  }

  return (
    <>
      <section className={hasSearch ? "py-10 sm:py-14" : "flex min-h-[calc(100vh-49px)] flex-col justify-center pb-24"}>
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Property Areas
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-600">
              Track transaction activity by neighbourhood, town, and district.
            </p>

            <MarketSearchBox
              action="/market/areas"
              type="areas"
              placeholder="Try: Tampines, Bukit Timah, D09"
              defaultValue={searchTerm}
            />

            {!hasSearch ? (
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <MapPin className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">30+</p>
                    <p className="text-xs text-zinc-500">Areas covered</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <FileText className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">CEA</p>
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
              {formatCount(areas.length)} results for &ldquo;{searchTerm}&rdquo;
            </p>
            <DataTable
              isEmpty={areas.length === 0}
              emptyMessage="No areas found. Try searching with a broader town or district keyword."
            >
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="border-b-2 border-[#E8DCC8] bg-[#FAF6EF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Area
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Recent Transactions
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Latest Activity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {areas.map((area, i) => (
                    <tr key={area.name} className={`transition-colors hover:bg-sunder-green/[0.04] ${i % 2 === 1 ? "bg-zinc-50/40" : ""}`}>
                      <td className="px-4 py-4 text-sm text-zinc-900">
                        <Link
                          href={{
                            pathname: `/market/areas/${toAreaSlug(area.name)}`,
                            query: { name: area.name },
                          }}
                          className="group/link inline-flex items-center gap-1 font-medium text-zinc-900 hover:text-sunder-green"
                        >
                          {formatAreaName(area.name)}
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover/link:opacity-100" />
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {formatCount(area.transactionCount)}
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {formatDateMonthYear(area.latestDate)}
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
