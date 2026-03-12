/**
 * Backward-compatible company detail route redirect.
 * @module app/(dashboard)/crm/companies/[companyId]/page
 */
import { redirect } from "next/navigation";

interface CompanyDetailRouteProps {
  params: Promise<{
    companyId: string;
  }>;
}

export default async function CompanyDetailRedirectPage({
  params,
}: CompanyDetailRouteProps) {
  const { companyId } = await params;
  redirect(`/customers/companies/${companyId}`);
}
