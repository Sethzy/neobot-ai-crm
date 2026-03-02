import type { Metadata } from "next";
import { Users, FileText } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { MarketSearchBox } from "@/components/property/market-search-box";
import { cleanSearchTerm } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";

export const metadata: Metadata = {
  title: "Singapore Property Agents | Sunder",
  description:
    "Search Singapore property agent profiles by registration number, name, and agency.",
};

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
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

  return (
    <section className="grid place-items-center pb-24">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Singapore Property Agent Profiles
          </h1>
          <p className="mt-3 text-base text-zinc-500">
            Search 42,000+ agents and 1.3M+ transactions in Singapore.
          </p>

          <MarketSearchBox
            type="agents"
            placeholder="Enter agent name, registration number, or agency..."
            defaultValue={searchTerm}
          />

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
        </div>
      </Container>
    </section>
  );
}
