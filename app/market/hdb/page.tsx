import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Home, FileText } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { MarketSearchBox } from "@/components/property/market-search-box";
import {
  cleanSearchTerm,
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  toHdbStreetSlug,
  toHdbTownSlug,
  toNumber,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const metadata: Metadata = {
  title: "Singapore HDB Resale Streets | Sunder",
  description:
    "Browse HDB resale activity by town and street with recent pricing trends.",
};

export const revalidate = 21_600;

type HdbRow = {
  town: string | null;
  street_name: string | null;
  month: string | null;
  resale_price: number | string | null;
};

type StreetSummary = {
  town: string;
  streetName: string;
  transactionCount: number;
  latestMonth: string | null;
  averagePrice: number | null;
};

type PropertyClient = Awaited<ReturnType<typeof createPropertyServerClient>>;

const LIST_LIMIT = 40;
const SAMPLE_LIMIT = 90_000;

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
}

async function fetchHdbStreetSummaries(
  client: PropertyClient,
  searchTerm: string
): Promise<StreetSummary[]> {
  let query = client
    .from("hdb_resale_transactions")
    .select("town, street_name, month, resale_price")
    .not("town", "is", null)
    .not("street_name", "is", null)
    .order("month", { ascending: false })
    .limit(SAMPLE_LIMIT);

  if (searchTerm) {
    query = query.or(`town.ilike.%${searchTerm}%,street_name.ilike.%${searchTerm}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load HDB streets: ${error.message}`);
  }

  const grouped = new Map<
    string,
    {
      town: string;
      streetName: string;
      transactionCount: number;
      latestMonth: string | null;
      priceTotal: number;
      priceCount: number;
    }
  >();

  for (const row of (data ?? []) as HdbRow[]) {
    const town = row.town?.trim();
    const streetName = row.street_name?.trim();
    if (!town || !streetName) {
      continue;
    }

    const key = `${town}::${streetName}`;
    const current = grouped.get(key) ?? {
      town,
      streetName,
      transactionCount: 0,
      latestMonth: row.month,
      priceTotal: 0,
      priceCount: 0,
    };

    current.transactionCount += 1;
    if (!current.latestMonth && row.month) {
      current.latestMonth = row.month;
    }

    const price = toNumber(row.resale_price);
    if (price !== null) {
      current.priceTotal += price;
      current.priceCount += 1;
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      town: entry.town,
      streetName: entry.streetName,
      transactionCount: entry.transactionCount,
      latestMonth: entry.latestMonth,
      averagePrice: entry.priceCount > 0 ? entry.priceTotal / entry.priceCount : null,
    }))
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, LIST_LIMIT);
}

export default async function HdbPage({
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
  let streets: StreetSummary[] = [];

  if (hasSearch) {
    const client = await createPropertyServerClient();
    streets = await fetchHdbStreetSummaries(client, searchTerm);
  }

  return (
    <>
      <section className={hasSearch ? "py-10 sm:py-14" : "flex min-h-[calc(100vh-49px)] flex-col justify-center pb-24"}>
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              HDB Resale Streets
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-600">
              Compare HDB resale activity across streets and towns in Singapore.
            </p>

            <MarketSearchBox
              action="/market/hdb"
              type="hdb"
              placeholder="Try: Tampines, Jurong West St 81"
              defaultValue={searchTerm}
            />

            {!hasSearch ? (
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <Home className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">900+</p>
                    <p className="text-xs text-zinc-500">Streets tracked</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <FileText className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">HDB</p>
                    <p className="text-xs text-zinc-500">Resale data</p>
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
              {formatCount(streets.length)} results for &ldquo;{searchTerm}&rdquo;
            </p>
            <DataTable
              isEmpty={streets.length === 0}
              emptyMessage="No streets found. Try a broader town name or remove street-level keywords."
            >
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="border-b-2 border-[#E8DCC8] bg-[#FAF6EF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Street
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Town
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Transactions
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Latest Month
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Avg Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {streets.map((street, i) => (
                    <tr
                      key={`${street.town}-${street.streetName}`}
                      className={`transition-colors hover:bg-sunder-green/[0.04] ${i % 2 === 1 ? "bg-zinc-50/40" : ""}`}
                    >
                      <td className="px-4 py-4 text-sm text-zinc-900">
                        <Link
                          href={{
                            pathname: `/market/hdb/${toHdbTownSlug(street.town)}/${toHdbStreetSlug(
                              street.streetName
                            )}`,
                            query: {
                              town: street.town,
                              street: street.streetName,
                            },
                          }}
                          className="group/link inline-flex items-center gap-1 font-medium text-zinc-900 hover:text-sunder-green"
                        >
                          {street.streetName}
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover/link:opacity-100" />
                        </Link>
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">{street.town}</td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {formatCount(street.transactionCount)}
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {formatDateMonthYear(street.latestMonth)}
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {formatCurrencySgd(street.averagePrice)}
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
