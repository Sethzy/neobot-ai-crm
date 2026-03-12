/**
 * Backward-compatible deal detail route redirect.
 * @module app/(dashboard)/crm/deals/[dealId]/page
 */
import { redirect } from "next/navigation";

interface DealDetailRouteProps {
  params: Promise<{
    dealId: string;
  }>;
}

export default async function DealDetailPage({ params }: DealDetailRouteProps) {
  const { dealId } = await params;
  redirect(`/customers/deals/${dealId}`);
}
