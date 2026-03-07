import type { Metadata } from "next";
import { AppIcon } from "@/components/icons/app-icons";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { MarketSearchBox } from "@/components/property/market-search-box";
import { cleanSearchTerm } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";

export const metadata: Metadata = {
  title: "Singapore Property Profiles | Sunder",
  description:
    "Search Singapore private residential projects and view transaction histories.",
};

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
}

export default async function PropertiesPage({
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
            Singapore Private Property Profiles
          </h1>
          <p className="mt-3 text-base text-zinc-500">
            Explore 3,000+ condo and private residential projects in Singapore.
          </p>

          <MarketSearchBox
            type="properties"
            placeholder="Enter project name, district, or area..."
            defaultValue={searchTerm}
          />

          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <AppIcon name="property" className="h-3.5 w-3.5" />
              3,000+ projects
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AppIcon name="document" className="h-3.5 w-3.5" />
              URA transaction data
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
