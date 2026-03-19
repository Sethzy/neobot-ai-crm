import type { Metadata } from "next";
import { AppIcon } from "@/components/icons/app-icons";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { MarketSearchBox } from "@/components/property/market-search-box";
import { cleanSearchTerm } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";

export const metadata: Metadata = {
  title: "Singapore Property Agencies | Sunder",
  description:
    "Browse Singapore property agencies with active agent counts and transaction activity.",
};

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
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

  return (
    <section className="grid place-items-center pb-24">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Singapore Property Agencies
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Browse 1,500+ agencies with agent counts and transaction activity.
          </p>

          <MarketSearchBox
            type="agencies"
            placeholder="Enter agency name..."
            defaultValue={searchTerm}
          />

          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <AppIcon name="agency" className="h-3.5 w-3.5" />
              1,500+ agencies
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AppIcon name="document" className="h-3.5 w-3.5" />
              CEA registry data
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
