/** Agent profile page — CEA agent transaction history and activity summary. */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { StatCard } from "@/components/property/stat-card";
import { AgentProfileCharts } from "./charts";
import {
  formatCount,
  formatDateMonthYear,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

type AgentRow = {
  registration_no: string;
  salesperson_name: string | null;
  estate_agent_name: string | null;
  registration_start_date: string | null;
  registration_end_date: string | null;
};

type AgentTransaction = {
  transaction_date: string | null;
  property_type: string | null;
  transaction_type: string | null;
  represented: string | null;
  town: string | null;
  district: string | null;
  general_location: string | null;
};

type AgentProfile = {
  agent: AgentRow | null;
  transactionCount: number;
  last12MonthsCount: number;
  latestTransactionDate: string | null;
  activeYears: number;
  recentTransactions: AgentTransaction[];
  propertyTypeBreakdown: Array<{ label: string; count: number }>;
};

type PropertyClient = Awaited<ReturnType<typeof createPropertyServerClient>>;

async function fetchAgentProfile(
  client: PropertyClient,
  registrationNo: string
): Promise<AgentProfile | null> {
  const oneYearAgo = new Date();
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  const oneYearAgoIso = oneYearAgo.toISOString().slice(0, 10);

  const [
    agentResult,
    totalCountResult,
    last12CountResult,
    latestDateResult,
    firstDateResult,
    recentTransactionsResult,
  ] = await Promise.all([
    client
      .from("cea_agents")
      .select(
        "registration_no, salesperson_name, estate_agent_name, registration_start_date, registration_end_date"
      )
      .eq("registration_no", registrationNo)
      .maybeSingle(),
    client
      .from("cea_transactions")
      .select("id", { count: "exact", head: true })
      .eq("salesperson_reg_num", registrationNo),
    client
      .from("cea_transactions")
      .select("id", { count: "exact", head: true })
      .eq("salesperson_reg_num", registrationNo)
      .gte("transaction_date", oneYearAgoIso),
    client
      .from("cea_transactions")
      .select("transaction_date")
      .eq("salesperson_reg_num", registrationNo)
      .order("transaction_date", { ascending: false })
      .limit(1),
    client
      .from("cea_transactions")
      .select("transaction_date")
      .eq("salesperson_reg_num", registrationNo)
      .order("transaction_date", { ascending: true })
      .limit(1),
    client
      .from("cea_transactions")
      .select(
        "transaction_date, property_type, transaction_type, represented, town, district, general_location"
      )
      .eq("salesperson_reg_num", registrationNo)
      .order("transaction_date", { ascending: false })
      .limit(500),
  ]);

  for (const result of [
    totalCountResult,
    last12CountResult,
    latestDateResult,
    firstDateResult,
    recentTransactionsResult,
  ]) {
    if (result.error) {
      throw new Error(`Failed to load agent profile: ${result.error.message}`);
    }
  }

  if (agentResult.error) {
    throw new Error(`Failed to load agent details: ${agentResult.error.message}`);
  }

  const transactionCount = totalCountResult.count ?? 0;
  if (!agentResult.data && transactionCount === 0) {
    return null;
  }

  const latestTransactionDate = latestDateResult.data?.[0]?.transaction_date ?? null;
  const firstTransactionDate = firstDateResult.data?.[0]?.transaction_date ?? null;

  let activeYears = 0;
  if (firstTransactionDate && latestTransactionDate) {
    const firstYear = new Date(`${firstTransactionDate}T00:00:00Z`).getUTCFullYear();
    const latestYear = new Date(`${latestTransactionDate}T00:00:00Z`).getUTCFullYear();
    if (!Number.isNaN(firstYear) && !Number.isNaN(latestYear)) {
      activeYears = Math.max(1, latestYear - firstYear + 1);
    }
  }

  const recentTransactions = (recentTransactionsResult.data ?? []) as AgentTransaction[];
  const propertyTypeMap = new Map<string, number>();
  for (const transaction of recentTransactions) {
    const label = transaction.property_type ?? "Unknown";
    propertyTypeMap.set(label, (propertyTypeMap.get(label) ?? 0) + 1);
  }

  const propertyTypeBreakdown = Array.from(propertyTypeMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    agent: agentResult.data as AgentRow | null,
    transactionCount,
    last12MonthsCount: last12CountResult.count ?? 0,
    latestTransactionDate,
    activeYears,
    recentTransactions,
    propertyTypeBreakdown,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regNo: string }>;
}): Promise<Metadata> {
  const { regNo } = await params;

  return {
    title: `Agent ${regNo} | Singapore Property Transactions`,
    description: `Public profile for CEA agent ${regNo} with transaction history and activity summary.`,
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ regNo: string }>;
}) {
  if (!isPropertySupabaseConfigured()) {
    return (
      <ConfigNotice
        title="Property Data Is Not Configured"
        description="The public property dataset is hosted on a separate Supabase project."
      />
    );
  }

  const { regNo } = await params;
  const registrationNo = decodeURIComponent(regNo).toUpperCase();
  const client = await createPropertyServerClient();
  const profile = await fetchAgentProfile(client, registrationNo);

  if (!profile) {
    notFound();
  }

  const isExpiredProfile = !profile.agent && profile.transactionCount > 0;
  const displayName = profile.agent?.salesperson_name ?? "Agent registration expired";
  const agencyName = profile.agent?.estate_agent_name ?? "Not in active CEA registry";

  const avgTxnPerQuarter =
    profile.activeYears > 0
      ? (profile.transactionCount / (profile.activeYears * 4)).toFixed(1)
      : "0";

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <Link
            href="/agents"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-sunder-green"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to agents
          </Link>

          <div className="mt-6 rounded-2xl border border-[#E8DCC8] border-t-4 border-t-sunder-green bg-white p-8 shadow-sm">
            <span className="inline-block rounded-full bg-sunder-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Agent Profile
            </span>
            <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl">
              {displayName}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">Registration No: {registrationNo}</p>
            <p className="mt-1 text-sm text-zinc-600">Agency: {agencyName}</p>

            {isExpiredProfile ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This registration is no longer in the current CEA registry, but historical transactions remain available.
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Total Transactions"
              value={formatCount(profile.transactionCount)}
            />
            <StatCard
              label="Last 12 Months"
              value={formatCount(profile.last12MonthsCount)}
            />
            <StatCard
              label="Last Transaction"
              value={formatDateMonthYear(profile.latestTransactionDate)}
            />
            <StatCard
              label="Active Years"
              value={formatCount(profile.activeYears)}
            />
            <StatCard
              label="Avg Txn/Quarter"
              value={avgTxnPerQuarter}
            />
          </div>

          {/* Charts */}
          <AgentProfileCharts
            dates={profile.recentTransactions.map((t) => t.transaction_date)}
            propertyTypeBreakdown={profile.propertyTypeBreakdown}
          />

          {profile.propertyTypeBreakdown.length > 0 ? (
            <div className="mt-8 rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                Property Type Breakdown
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.propertyTypeBreakdown.map((entry) => (
                  <span
                    key={entry.label}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700"
                  >
                    {entry.label}: {formatCount(entry.count)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <AgentTransactionsTable transactions={profile.recentTransactions} />
        </Container>
      </section>
    </>
  );
}

/** Server-rendered table wrapped by client PaginatedTable — uses a thin client wrapper. */
function AgentTransactionsTable({ transactions }: { transactions: AgentTransaction[] }) {
  /* We render the paginated table via a client component import. Since this is a server component page,
     we serialize the data to the client component. */
  return <AgentTransactionsTableClient transactions={transactions} />;
}

import { AgentTransactionsTableClient } from "./transactions-table";
