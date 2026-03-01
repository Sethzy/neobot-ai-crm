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
  toAgencySlug,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const metadata: Metadata = {
  title: "Singapore Property Agencies | Sunder",
  description:
    "Browse Singapore property agencies with active agent counts and transaction activity.",
};

export const revalidate = 21_600;

type AgentRow = {
  registration_no: string;
  estate_agent_name: string | null;
};

type TxnRow = {
  salesperson_reg_num: string | null;
  transaction_date: string | null;
};

type AgencySummary = {
  name: string;
  agentCount: number;
  transactionCount: number;
  latestTransactionDate: string | null;
};

const LIST_LIMIT = 30;
const AGENT_SOURCE_LIMIT = 10_000;
const TXN_SAMPLE_LIMIT = 120_000;

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
}

async function fetchAgencySummaries(searchTerm: string): Promise<AgencySummary[]> {
  const client = await createPropertyServerClient();

  let agentQuery = client
    .from("cea_agents")
    .select("registration_no, estate_agent_name")
    .not("estate_agent_name", "is", null)
    .limit(AGENT_SOURCE_LIMIT);

  if (searchTerm) {
    agentQuery = agentQuery.ilike("estate_agent_name", `%${searchTerm}%`);
  } else {
    agentQuery = agentQuery.order("estate_agent_name", { ascending: true });
  }

  const [agentsResult, txnsResult] = await Promise.all([
    agentQuery,
    client
      .from("cea_transactions")
      .select("salesperson_reg_num, transaction_date")
      .order("transaction_date", { ascending: false })
      .limit(TXN_SAMPLE_LIMIT),
  ]);

  if (agentsResult.error) {
    throw new Error(`Failed to load agencies: ${agentsResult.error.message}`);
  }

  if (txnsResult.error) {
    throw new Error(`Failed to load transaction sample: ${txnsResult.error.message}`);
  }

  const agencyByReg = new Map<string, string>();
  const agentCountByAgency = new Map<string, number>();

  for (const row of (agentsResult.data ?? []) as AgentRow[]) {
    const agencyName = row.estate_agent_name?.trim();
    if (!agencyName) {
      continue;
    }

    agencyByReg.set(row.registration_no, agencyName);
    agentCountByAgency.set(
      agencyName,
      (agentCountByAgency.get(agencyName) ?? 0) + 1
    );
  }

  const seeds = Array.from(agentCountByAgency.entries())
    .map(([name, agentCount]) => ({
      name,
      agentCount,
      transactionCount: 0,
      latestTransactionDate: null as string | null,
    }))
    .sort((a, b) => b.agentCount - a.agentCount)
    .slice(0, LIST_LIMIT);

  const seedMap = new Map(seeds.map((seed) => [seed.name, seed]));

  for (const row of (txnsResult.data ?? []) as TxnRow[]) {
    const regNo = row.salesperson_reg_num;
    if (!regNo) {
      continue;
    }

    const agencyName = agencyByReg.get(regNo);
    if (!agencyName) {
      continue;
    }

    const summary = seedMap.get(agencyName);
    if (!summary) {
      continue;
    }

    summary.transactionCount += 1;
    if (!summary.latestTransactionDate && row.transaction_date) {
      summary.latestTransactionDate = row.transaction_date;
    }
  }

  return Array.from(seedMap.values()).sort(
    (a, b) => b.transactionCount - a.transactionCount
  );
}

export default async function AgenciesPage({
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
  const agencies = await fetchAgencySummaries(searchTerm);

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-full bg-sunder-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Free Public Resource
            </span>
            <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Property Agencies
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-600">
              Discover agency-level activity and navigate to top-performing agents.
            </p>
          </div>

          <form action="/agencies" method="get" className="mx-auto mt-10 max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="Try: ERA, PropNex, Huttons"
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
            <StatCard label="Results" value={formatCount(agencies.length)} />
            <StatCard label="Dataset" value="CEA" hint="Agency and transaction records" />
            <StatCard
              label="Method"
              value="Fast Sample"
              hint="Aggregated from the latest transaction window"
            />
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24 pt-8">
        <Container>
          <DataTable
            isEmpty={agencies.length === 0}
            emptyMessage="No agencies found. Try a shorter keyword or search by official brand name."
          >
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-[#FAF6EF]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Agency
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Agents
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
                {agencies.map((agency) => (
                  <tr key={agency.name} className="hover:bg-zinc-50/80">
                    <td className="px-4 py-4 text-sm text-zinc-900">
                      <Link
                        href={{
                          pathname: `/agencies/${toAgencySlug(agency.name)}`,
                          query: { name: agency.name },
                        }}
                        className="font-medium text-zinc-900 hover:text-sunder-green"
                      >
                        {agency.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCount(agency.agentCount)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCount(agency.transactionCount)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatDateMonthYear(agency.latestTransactionDate)}
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
