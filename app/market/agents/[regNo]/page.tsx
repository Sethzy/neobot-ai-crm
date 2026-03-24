/** Agent profile page — CEA agent transaction history and activity summary. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/icons/app-icons";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { MarketCta } from "@/components/property/market-cta";
import { MovementHistory } from "@/components/property/movement-history";
import { StatBar } from "@/components/property/stat-bar";
import {
  computeRentalRepBreakdown,
  computeSalesRepBreakdown,
  computeTransactionTypeBreakdown,
} from "@/lib/property/agent-breakdowns";
import { AgentProfileCharts } from "./charts";
import {
  formatActiveRange,
  formatCount,
  formatDateMonthYear,
  formatPropertyType,
  toAgencySlug,
} from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";
import { AgentTransactionsTableClient } from "./transactions-table";

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
  firstTransactionDate: string | null;
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
      .order("transaction_date", { ascending: false }),
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
    const label = formatPropertyType(transaction.property_type);
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
    firstTransactionDate,
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
  const transactionTypeBreakdown = computeTransactionTypeBreakdown(
    profile.recentTransactions
  );
  const salesRepBreakdown = computeSalesRepBreakdown(profile.recentTransactions);
  const rentalRepBreakdown = computeRentalRepBreakdown(profile.recentTransactions);

  const avgTxnPerQuarter =
    profile.activeYears > 0
      ? (profile.transactionCount / (profile.activeYears * 4)).toFixed(1)
      : "0";

  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <Link
            href="/market/agents"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
          >
            <AppIcon name="arrowLeft" className="h-4 w-4" />
            Back to agents
          </Link>

          <div className="mt-6">
            <div className="flex items-start gap-4">
              {/* Initials avatar */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                {displayName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {displayName}
                  </h1>
                  {/* CEA status badge */}
                  {isExpiredProfile ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Expired
                    </span>
                  ) : profile.agent ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Active
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <AppIcon name="shield" className="h-3.5 w-3.5" />
                    {registrationNo}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <AppIcon name="agency" className="h-3.5 w-3.5 text-muted-foreground" />
                    {profile.agent?.estate_agent_name ? (
                      <Link
                        href={{
                          pathname: `/market/agencies/${toAgencySlug(
                            profile.agent.estate_agent_name
                          )}`,
                          query: { name: profile.agent.estate_agent_name },
                        }}
                        className="font-medium hover:text-primary hover:underline underline-offset-4 decoration-border"
                      >
                        {agencyName}
                      </Link>
                    ) : (
                      agencyName
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <AppIcon name="calendar" className="h-3.5 w-3.5" />
                    {formatActiveRange(
                      profile.firstTransactionDate,
                      profile.latestTransactionDate
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

            {isExpiredProfile ? (
              <p className="mt-4 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                This registration is no longer in the current CEA registry, but
                historical transactions remain available.
              </p>
            ) : null}

          <div className="mt-8">
            <StatBar
              items={[
                { label: "Total Transactions", value: formatCount(profile.transactionCount) },
                { label: "Last 12 Months", value: formatCount(profile.last12MonthsCount) },
                { label: "Last Transaction", value: formatDateMonthYear(profile.latestTransactionDate) },
                { label: "Avg Txn/Quarter", value: avgTxnPerQuarter },
                { label: "Active Years", value: formatCount(profile.activeYears) },
              ]}
            />
          </div>

          {/* Charts */}
          <AgentProfileCharts
            dates={profile.recentTransactions.map((t) => t.transaction_date)}
            propertyTypeBreakdown={profile.propertyTypeBreakdown}
            transactionTypeBreakdown={transactionTypeBreakdown}
            salesRepBreakdown={salesRepBreakdown}
            rentalRepBreakdown={rentalRepBreakdown}
            transactions={profile.recentTransactions.map((row) => ({
              town: row.town,
              district: row.district,
            }))}
          />
        </Container>
      </section>

      <section className="pb-12 sm:pb-16">
        <Container>
          <AgentTransactionsTable transactions={profile.recentTransactions} />
        </Container>
      </section>

      <section className="pb-10">
        <Container>
          <MovementHistory
            agencyName={profile.agent?.estate_agent_name ?? null}
            registrationStart={profile.agent?.registration_start_date ?? null}
            registrationEnd={profile.agent?.registration_end_date ?? null}
          />
        </Container>
      </section>

      <section className="pb-16 sm:pb-20">
        <Container>
          <MarketCta />
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
