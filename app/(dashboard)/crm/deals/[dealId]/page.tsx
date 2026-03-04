/**
 * Backward-compatible deal detail route that redirects to drawer query-param entry.
 * @module app/(dashboard)/crm/deals/[dealId]/page
 */
import { redirect } from "next/navigation";

interface DealDetailRouteProps {
  params: {
    dealId: string;
  };
}

/**
 * Keeps old deep links working while the canonical detail UX moves to `/crm/deals?detail=...`.
 */
export default function DealDetailPage({ params }: DealDetailRouteProps) {
  redirect(`/crm/deals?detail=${params.dealId}`);
}
