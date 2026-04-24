/**
 * Full-page deal detail route.
 * @module app/(dashboard)/customers/deals/[dealId]/page
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DealDetailContent } from "@/components/crm/record-detail/deal-detail-content";
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { Button } from "@/components/ui/button";
import { getSingleQueryParam, resolveCrmRecordBackHref } from "@/lib/crm/navigation";

interface DealDetailPageProps {
  params: Promise<{
    dealId: string;
  }>;
  searchParams?: Promise<{
    from?: string | string[];
  }>;
}

export default async function DealDetailPage({
  params,
  searchParams,
}: DealDetailPageProps) {
  const { dealId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const backHref = resolveCrmRecordBackHref(
    "deal",
    getSingleQueryParam(resolvedSearchParams.from),
  );

  return (
    <PageCanvas>
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            <span>Back to Deals</span>
          </Link>
        </Button>
      </div>
      <PageSurface padding="none" className="overflow-hidden">
        <DealDetailContent dealId={dealId} surface="page" />
      </PageSurface>
    </PageCanvas>
  );
}
