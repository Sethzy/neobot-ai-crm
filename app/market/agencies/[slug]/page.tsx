import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/icons/app-icons";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { MarketCta } from "@/components/property/market-cta";
import { StatBar } from "@/components/property/stat-bar";
import { AgencyProfileCharts } from "./charts";
import {
  formatCount,
  formatDateMonthYear,
  humanizeSlug,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const revalidate = 21_600;

type AgentRow = {
  registration_no: string;
  salesperson_name: string | null;
};

type TxnRow = {
  salesperson_reg_num: string | null;
  transaction_date: string | null;
};

type TopAgent = {
  registrationNo: string;
  name: string | null;
  transactionCount: number;
  latestTransactionDate: string | null;
};

const MAX_TOP_AGENTS = 20;
const TXN_SAMPLE_LIMIT = 220_000;

function parseOptionalString(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchAgencyAgents(agencyName: string): Promise<AgentRow[]> {
  const client = await createPropertyServerClient();

  const exact = await client
    .from("cea_agents")
    .select("registration_no, salesperson_name")
    .eq("estate_agent_name", agencyName)
    .order("salesperson_name", { ascending: true })
    .limit(6_000);

  if (exact.error) {
    throw new Error(`Failed to load agency agents: ${exact.error.message}`);
  }

  if ((exact.data ?? []).length > 0) {
    return (exact.data ?? []) as AgentRow[];
  }

  const fuzzy = await client
    .from("cea_agents")
    .select("registration_no, salesperson_name")
    .ilike("estate_agent_name", agencyName)
    .order("salesperson_name", { ascending: true })
    .limit(6_000);

  if (fuzzy.error) {
    throw new Error(`Failed to load agency agents: ${fuzzy.error.message}`);
  }

  return (fuzzy.data ?? []) as AgentRow[];
}

async function fetchAgencySummaryAndTopAgents(
  agents: AgentRow[]
): Promise<{
  transactionCount: number;
  latestTransactionDate: string | null;
  topAgents: TopAgent[];
  transactionDates: (string | null)[];
}> {
  const client = await createPropertyServerClient();
  const regSet = new Set(agents.map((agent) => agent.registration_no));
  const nameByReg = new Map(
    agents.map((agent) => [agent.registration_no, agent.salesperson_name])
  );

  const { data, error } = await client
    .from("cea_transactions")
    .select("salesperson_reg_num, transaction_date")
    .order("transaction_date", { ascending: false })
    .limit(TXN_SAMPLE_LIMIT);

  if (error) {
    throw new Error(`Failed to load agency transactions: ${error.message}`);
  }

  let transactionCount = 0;
  let latestTransactionDate: string | null = null;
  const transactionDates: (string | null)[] = [];
  const perAgent = new Map<string, { count: number; latest: string | null }>();

  for (const row of (data ?? []) as TxnRow[]) {
    const regNo = row.salesperson_reg_num;
    if (!regNo || !regSet.has(regNo)) {
      continue;
    }

    transactionCount += 1;
    transactionDates.push(row.transaction_date ?? null);
    if (!latestTransactionDate && row.transaction_date) {
      latestTransactionDate = row.transaction_date;
    }

    const current = perAgent.get(regNo) ?? {
      count: 0,
      latest: row.transaction_date,
    };

    current.count += 1;
    if (!current.latest && row.transaction_date) {
      current.latest = row.transaction_date;
    }

    perAgent.set(regNo, current);
  }

  const topAgents = Array.from(perAgent.entries())
    .map(([registrationNo, value]) => ({
      registrationNo,
      name: nameByReg.get(registrationNo) ?? null,
      transactionCount: value.count,
      latestTransactionDate: value.latest,
    }))
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, MAX_TOP_AGENTS);

  return { transactionCount, latestTransactionDate, topAgents, transactionDates };
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

  const agencyName = parseOptionalString(name) ?? humanizeSlug(slug);

  return {
    title: `${agencyName} | Singapore Property Agency Profile`,
    description: `Agency profile for ${agencyName} with active agents and historical transaction activity.`,
  };
}

export default async function AgencyProfilePage({
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

  const agencyName = parseOptionalString(name) ?? humanizeSlug(slug);
  const agents = await fetchAgencyAgents(agencyName);

  if (agents.length === 0) {
    notFound();
  }

  const { transactionCount, latestTransactionDate, topAgents, transactionDates } =
    await fetchAgencySummaryAndTopAgents(agents);

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <Link
            href="/market/agencies"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-sunder-green"
          >
            <AppIcon name="arrowLeft" className="h-4 w-4" />
            Back to agencies
          </Link>

          <div className="mt-6 rounded-2xl border border-[#E8DCC8] border-t-4 border-t-sunder-green bg-white p-8 shadow-sm">
            <span className="inline-block rounded-full bg-sunder-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Agency Profile
            </span>
            <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl">
              {agencyName}
            </h1>
          </div>

          <div className="mt-8">
            <StatBar
              items={[
                { label: "Active Agents", value: formatCount(agents.length) },
                { label: "Recent Transactions", value: formatCount(transactionCount) },
                { label: "Latest Activity", value: formatDateMonthYear(latestTransactionDate) },
                { label: "Top Agents Shown", value: formatCount(topAgents.length) },
              ]}
            />
          </div>

          <AgencyProfileCharts dates={transactionDates} />
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <DataTable title="Top Agents in This Agency">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-[#FAF6EF]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Registration
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
                {topAgents.map((agent) => (
                  <tr key={agent.registrationNo} className="hover:bg-zinc-50/80">
                    <td className="px-4 py-4 text-sm text-zinc-900">
                      <Link
                        href={`/market/agents/${agent.registrationNo}`}
                        className="font-medium text-zinc-900 hover:text-sunder-green"
                      >
                        {agent.name ?? "Unknown"}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">{agent.registrationNo}</td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatCount(agent.transactionCount)}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {formatDateMonthYear(agent.latestTransactionDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
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
