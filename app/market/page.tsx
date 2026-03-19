/** Market Data Hub — lead magnet entrypoint for agents. */
import type { Metadata } from "next";
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
    icon: "contacts",
  },
  {
    href: "/market/properties",
    title: "Private Properties",
    description:
      "Condo and residential project transaction data across all districts",
    count: "3,000+",
    countLabel: "projects",
    icon: "property",
  },
  {
    href: "/market/hdb",
    title: "HDB Resale",
    description: "HDB resale street-level pricing and transaction volume data",
    count: "900+",
    countLabel: "streets",
    icon: "home",
  },
  {
    href: "/market/agencies",
    title: "Agencies",
    description: "Agency-level activity, headcount, and top-performing agents",
    count: "1,500+",
    countLabel: "agencies",
    icon: "agency",
  },
  {
    href: "/market/areas",
    title: "Areas",
    description: "Town and district transaction activity and neighbourhood analytics",
    count: "30+",
    countLabel: "areas",
    icon: "area",
  },
] as const;

export default function MarketHubPage() {
  return (
    <>
      <section className="py-14 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Free for Agents
            </span>
            <h1 className="mt-4 font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              Singapore Property Market Data
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
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
