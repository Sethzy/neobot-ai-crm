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

  const client = await createPropertyServerClient();
  const streets = await fetchHdbStreetSummaries(client, searchTerm);

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-full bg-sunder-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Free Public Resource
            </span>
            <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              HDB Resale Streets
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-600">
              Compare HDB resale activity across streets and towns in Singapore.
            </p>
          </div>

          <form action="/hdb" method="get" className="mx-auto mt-10 max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="Try: Tampines, Jurong West St 81"
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
            <StatCard label="Results" value={formatCount(streets.length)} />
            <StatCard label="Dataset" value="HDB Resale" hint="Registration-date resale records" />
            <StatCard label="Coverage" value="By Street" hint="Town + street transaction activity" />
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24 pt-8">
        <Container>
          <DataTable
            isEmpty={streets.length === 0}
            emptyMessage="No streets found. Try a broader town name or remove street-level keywords."
          >
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-[#FAF6EF]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Street
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Town
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Transactions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Latest Month
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Avg Price
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {streets.map((street) => (
                  <tr
                    key={`${street.town}-${street.streetName}`}
                    className="hover:bg-zinc-50/80"
                  >
                    <td className="px-4 py-4 text-sm text-zinc-900">
                      <Link
                        href={{
                          pathname: `/hdb/${toHdbTownSlug(street.town)}/${toHdbStreetSlug(
                            street.streetName
                          )}`,
                          query: {
                            town: street.town,
                            street: street.streetName,
                          },
                        }}
                        className="font-medium text-zinc-900 hover:text-sunder-green"
                      >
                        {street.streetName}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">{street.town}</td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCount(street.transactionCount)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatDateMonthYear(street.latestMonth)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCurrencySgd(street.averagePrice)}
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
