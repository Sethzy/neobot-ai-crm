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
  const client = await createPropertyServerClient();

  const agents = await fetchAgents(client, searchTerm);
  const statsByRegNo = await fetchAgentStats(
    client,
    agents.map((agent) => agent.registration_no)
  );

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-full bg-sunder-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Free Public Resource
            </span>
            <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Property Agent Profiles
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-600">
              Search by agent name, CEA registration number, or agency.
            </p>
          </div>

          <form action="/agents" method="get" className="mx-auto mt-10 max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="Try: R012345A, ERA, or agent name"
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
              value={formatCount(agents.length)}
              hint={searchTerm ? `Showing matches for "${searchTerm}"` : "Top agents by alphabetical listing"}
            />
            <StatCard
              label="Dataset"
              value="CEA"
              hint="Agent registry + transaction history"
            />
            <StatCard
              label="Coverage"
              value="SG"
              hint="Residential property transactions"
            />
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24 pt-8">
        <Container>
          <DataTable
            isEmpty={agents.length === 0}
            emptyMessage="No agents found. Try a broader search term like agency name or registration prefix."
          >
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
                    Agency
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Transactions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {agents.map((agent) => {
                  const stats = statsByRegNo.get(agent.registration_no);
                  return (
                    <tr key={agent.registration_no} className="hover:bg-zinc-50/80">
                      <td className="px-4 py-4 text-sm text-zinc-900">
                        <Link
                          href={`/agents/${agent.registration_no}`}
                          className="font-medium text-zinc-900 hover:text-sunder-green"
                        >
                          {agent.salesperson_name ?? "Unknown Agent"}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {agent.registration_no}
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {agent.estate_agent_name ?? "N/A"}
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {formatCount(stats?.transactionCount ?? 0)}
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
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
    </>
  );
}
