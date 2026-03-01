import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, FileText } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { MarketSearchBox } from "@/components/property/market-search-box";
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

  const hasSearch = searchTerm.length > 0;
  let agencies: AgencySummary[] = [];

  if (hasSearch) {
    agencies = await fetchAgencySummaries(searchTerm);
  }

  return (
    <>
      <section className={hasSearch ? "py-10 sm:py-14" : "flex min-h-[calc(100vh-49px)] flex-col justify-center pb-24"}>
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Property Agencies
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-600">
              Discover agency-level activity and navigate to top-performing agents.
            </p>

            <MarketSearchBox
              action="/market/agencies"
              type="agencies"
              placeholder="Try: ERA, PropNex, Huttons"
              defaultValue={searchTerm}
            />

            {!hasSearch ? (
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <Briefcase className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">1,500+</p>
                    <p className="text-xs text-zinc-500">Active agencies</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] bg-white px-5 py-3">
                  <FileText className="h-5 w-5 text-sunder-green" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-zinc-900">CEA</p>
                    <p className="text-xs text-zinc-500">Registry data</p>
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
              {formatCount(agencies.length)} results for &ldquo;{searchTerm}&rdquo;
            </p>
            <DataTable
              isEmpty={agencies.length === 0}
              emptyMessage="No agencies found. Try a shorter keyword or search by official brand name."
            >
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="border-b-2 border-[#E8DCC8] bg-[#FAF6EF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Agency
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Agents
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Recent Transactions
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Latest Activity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {agencies.map((agency, i) => (
                    <tr key={agency.name} className={`transition-colors hover:bg-sunder-green/[0.04] ${i % 2 === 1 ? "bg-zinc-50/40" : ""}`}>
                      <td className="px-4 py-4 text-sm text-zinc-900">
                        <Link
                          href={{
                            pathname: `/market/agencies/${toAgencySlug(agency.name)}`,
                            query: { name: agency.name },
                          }}
                          className="group/link inline-flex items-center gap-1 font-medium text-zinc-900 hover:text-sunder-green"
                        >
                          {agency.name}
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover/link:opacity-100" />
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {formatCount(agency.agentCount)}
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {formatCount(agency.transactionCount)}
                      </td>
                      <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                        {formatDateMonthYear(agency.latestTransactionDate)}
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
