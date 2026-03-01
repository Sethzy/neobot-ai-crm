import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Users, FileText } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { DataTable } from "@/components/property/data-table";
import { MarketSearchBox } from "@/components/property/market-search-box";
import {
  cleanSearchTerm,
  formatCount,
  formatDateMonthYear,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export const metadata: Metadata = {
  title: "Singapore Property Agents | Sunder",
  description:
    "Search Singapore property agent profiles by registration number, name, and agency.",
};

type AgentRow = {
  registration_no: string;
  salesperson_name: string | null;
  estate_agent_name: string | null;
  registration_end_date: string | null;
};

type AgentStats = {
  transactionCount: number;
  lastTransactionDate: string | null;
};

type PropertyClient = Awaited<ReturnType<typeof createPropertyServerClient>>;

const PAGE_SIZE = 24;

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
}

async function fetchAgents(
  client: PropertyClient,
  searchTerm: string
): Promise<AgentRow[]> {
  if (!searchTerm) {
    const { data, error } = await client
      .from("cea_agents")
      .select(
        "registration_no, salesperson_name, estate_agent_name, registration_end_date"
      )
      .order("salesperson_name", { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      throw new Error(`Failed to load agents: ${error.message}`);
    }

    return (data ?? []) as AgentRow[];
  }

  const pattern = `%${searchTerm}%`;
  const [nameResult, regResult, agencyResult] = await Promise.all([
    client
      .from("cea_agents")
      .select(
        "registration_no, salesperson_name, estate_agent_name, registration_end_date"
      )
      .ilike("salesperson_name", pattern)
      .limit(PAGE_SIZE),
    client
      .from("cea_agents")
      .select(
        "registration_no, salesperson_name, estate_agent_name, registration_end_date"
      )
      .ilike("registration_no", pattern)
      .limit(PAGE_SIZE),
    client
      .from("cea_agents")
      .select(
        "registration_no, salesperson_name, estate_agent_name, registration_end_date"
      )
      .ilike("estate_agent_name", pattern)
      .limit(PAGE_SIZE),
  ]);

  for (const result of [nameResult, regResult, agencyResult]) {
    if (result.error) {
      throw new Error(`Failed to search agents: ${result.error.message}`);
    }
  }

  const merged = new Map<string, AgentRow>();
  for (const row of [
    ...(nameResult.data ?? []),
    ...(regResult.data ?? []),
    ...(agencyResult.data ?? []),
  ] as AgentRow[]) {
    merged.set(row.registration_no, row);
  }

  return Array.from(merged.values())
    .sort((a, b) =>
      (a.salesperson_name ?? "").localeCompare(b.salesperson_name ?? "")
    )
    .slice(0, PAGE_SIZE);
}

async function fetchAgentStats(
  client: PropertyClient,
  registrationNos: string[]
): Promise<Map<string, AgentStats>> {
  const pairs = await Promise.all(
    registrationNos.map(async (registrationNo) => {
      const [countResult, latestResult] = await Promise.all([
        client
          .from("cea_transactions")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_reg_num", registrationNo),
        client
          .from("cea_transactions")
          .select("transaction_date")
          .eq("salesperson_reg_num", registrationNo)
          .order("transaction_date", { ascending: false })
          .limit(1),
      ]);

      if (countResult.error) {
        throw new Error(
          `Failed to load count for ${registrationNo}: ${countResult.error.message}`
        );
      }

      if (latestResult.error) {
        throw new Error(
          `Failed to load latest transaction for ${registrationNo}: ${latestResult.error.message}`
        );
      }

      return [
        registrationNo,
        {
          transactionCount: countResult.count ?? 0,
          lastTransactionDate: latestResult.data?.[0]?.transaction_date ?? null,
        },
      ] as const;
    })
  );

  return new Map<string, AgentStats>(pairs);
}

export default async function AgentsPage({
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
  let agents: AgentRow[] = [];
  let statsByRegNo = new Map<string, AgentStats>();

  if (hasSearch) {
    const client = await createPropertyServerClient();
    agents = await fetchAgents(client, searchTerm);
    statsByRegNo = await fetchAgentStats(
      client,
      agents.map((agent) => agent.registration_no)
    );
  }

  return (
    <>
      {/* Hero — vertically centered when no search, compact when results showing */}
      <section className={hasSearch ? "py-10 sm:py-14" : "grid place-items-center pb-24"}>
        <Container>
          <div className="mx-auto max-w-xl text-center">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Singapore Property Agent Profiles
            </h1>
            <p className="mt-3 text-base text-zinc-500">
              Search 42,000+ agents and 1.3M+ transactions in Singapore.
            </p>

            <MarketSearchBox
              action="/market/agents"
              type="agents"
              placeholder="Enter agent name, registration number, or agency..."
              defaultValue={searchTerm}
            />

            {!hasSearch ? (
              <div className="mt-6 flex items-center justify-center gap-6 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  42,000+ registered agents
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  CEA registry data
                </span>
              </div>
            ) : null}
          </div>
        </Container>
      </section>

      {/* Results table — only when searching */}
      {hasSearch ? (
        <section className="pb-16 sm:pb-20">
          <Container>
            <p className="mb-4 text-sm text-zinc-500">
              {formatCount(agents.length)} results for &ldquo;{searchTerm}&rdquo;
            </p>
            <DataTable
              isEmpty={agents.length === 0}
              emptyMessage="No agents found. Try a broader search term like agency name or registration prefix."
            >
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="border-b-2 border-[#E8DCC8] bg-[#FAF6EF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Agent
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Registration
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Agency
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Transactions
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                      Last Activity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {agents.map((agent, i) => {
                    const stats = statsByRegNo.get(agent.registration_no);
                    return (
                      <tr key={agent.registration_no} className={`transition-colors hover:bg-sunder-green/[0.04] ${i % 2 === 1 ? "bg-zinc-50/40" : ""}`}>
                        <td className="px-4 py-4 text-sm text-zinc-900">
                          <Link
                            href={`/market/agents/${agent.registration_no}`}
                            className="group/link inline-flex items-center gap-1 font-medium text-zinc-900 hover:text-sunder-green"
                          >
                            {agent.salesperson_name ?? "Unknown Agent"}
                            <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover/link:opacity-100" />
                          </Link>
                        </td>
                        <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                          {agent.registration_no}
                        </td>
                        <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                          {agent.estate_agent_name ?? "N/A"}
                        </td>
                        <td className="px-4 py-4 text-sm text-zinc-600">
                          {formatCount(stats?.transactionCount ?? 0)}
                        </td>
                        <td className="hidden px-4 py-4 text-sm text-zinc-600 sm:table-cell">
                          {formatDateMonthYear(stats?.lastTransactionDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          </Container>
        </section>
      ) : null}
    </>
  );
}
