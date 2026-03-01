/** Market Data Hub — lead magnet entrypoint for agents. */
import type { Metadata } from "next";
import { Briefcase, Building2, Home, MapPin, Users } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { MarketCategoryCard } from "@/components/property/market-category-card";
import { MarketCta } from "@/components/property/market-cta";

export const metadata: Metadata = {
  title: "Singapore Property Market Data | Sunder",
  description:
    "Free property market data for Singapore real estate agents. Agent profiles, private property transactions, HDB resale data, agency rankings, and area analytics.",
};

const CATEGORIES = [
  {
    href: "/market/agents",
    title: "Agent Profiles",
    description:
      "Search 42,000+ CEA-registered agents and their full transaction histories",
    count: "42,000+",
    countLabel: "registered agents",
    icon: <Users className="h-6 w-6" />,
  },
  {
    href: "/market/properties",
    title: "Private Properties",
    description:
      "Condo and residential project transaction data across all districts",
    count: "3,000+",
    countLabel: "projects",
    icon: <Building2 className="h-6 w-6" />,
  },
  {
    href: "/market/hdb",
    title: "HDB Resale",
    description: "HDB resale street-level pricing and transaction volume data",
    count: "900+",
    countLabel: "streets",
    icon: <Home className="h-6 w-6" />,
  },
  {
    href: "/market/agencies",
    title: "Agencies",
    description: "Agency-level activity, headcount, and top-performing agents",
    count: "1,500+",
    countLabel: "agencies",
    icon: <Briefcase className="h-6 w-6" />,
  },
  {
    href: "/market/areas",
    title: "Areas",
    description: "Town and district transaction activity and neighbourhood analytics",
    count: "30+",
    countLabel: "areas",
    icon: <MapPin className="h-6 w-6" />,
  },
] as const;

export default function MarketHubPage() {
  return (
    <>
      <section className="py-14 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-block rounded-full bg-sunder-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Free for Agents
            </span>
            <h1 className="mt-4 font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Property Market Data
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-600">
              Everything you need to research agents, properties, and
              neighbourhoods - all in one place. Powered by CEA, URA, and HDB
              public data.
            </p>
          </div>
        </Container>
      </section>

      <section className="pb-12">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <MarketCategoryCard key={cat.href} {...cat} />
            ))}
          </div>
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
