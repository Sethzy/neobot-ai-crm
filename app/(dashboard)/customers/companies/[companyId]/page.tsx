/**
 * Full-page company detail route.
 * @module app/(dashboard)/customers/companies/[companyId]/page
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CompanyDetailContent } from "@/components/crm/record-detail/company-detail-content";
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { Button } from "@/components/ui/button";
import { getSingleQueryParam, resolveCrmRecordBackHref } from "@/lib/crm/navigation";

type CrmRecordSearchParams = {
  from?: string | string[];
};

interface CompanyDetailPageProps {
  params: Promise<{
    companyId: string;
  }>;
  searchParams?: Promise<CrmRecordSearchParams>;
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: CompanyDetailPageProps) {
  const { companyId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : ({} satisfies CrmRecordSearchParams);
  const backHref = resolveCrmRecordBackHref(
    "company",
    getSingleQueryParam(resolvedSearchParams.from),
  );

  return (
    <PageCanvas>
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            <span>Back to Companies</span>
          </Link>
        </Button>
      </div>
      <PageSurface padding="none" className="overflow-hidden">
        <CompanyDetailContent companyId={companyId} surface="page" />
      </PageSurface>
    </PageCanvas>
  );
}
