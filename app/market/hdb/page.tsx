import type { Metadata } from "next";
import { AppIcon } from "@/components/icons/app-icons";
import { Container } from "@/components/landing/Container";
import { ConfigNotice } from "@/components/property/config-notice";
import { MarketSearchBox } from "@/components/property/market-search-box";
import { cleanSearchTerm } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";

export const metadata: Metadata = {
  title: "Singapore HDB Resale Streets | NeoBot",
  description:
    "Browse HDB resale activity by town and street with recent pricing trends.",
};

function parseSearchTerm(value: string | string[] | undefined): string {
  return cleanSearchTerm(Array.isArray(value) ? value[0] : value);
}

export default async function HdbPage({
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
            HDB Resale Streets
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Compare 900+ streets across all HDB towns in Singapore.
          </p>

          <MarketSearchBox
            type="hdb"
            placeholder="Enter town or street name..."
            defaultValue={searchTerm}
          />

          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <AppIcon name="home" className="h-3.5 w-3.5" />
              900+ streets tracked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AppIcon name="document" className="h-3.5 w-3.5" />
              HDB resale data
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
