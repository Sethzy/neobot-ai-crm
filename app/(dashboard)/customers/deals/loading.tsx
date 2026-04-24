/**
 * Route-level loading shell for the deals workspace.
 * @module app/(dashboard)/customers/deals/loading
 */
import { CrmListLoadingShell } from "@/components/crm/crm-list-loading-shell";

export default function Loading() {
  return <CrmListLoadingShell title="Deals" showViewToggle />;
}
