/**
 * Route-level loading shell for the companies workspace.
 * @module app/(dashboard)/customers/companies/loading
 */
import { CrmListLoadingShell } from "@/components/crm/crm-list-loading-shell";

export default function Loading() {
  return <CrmListLoadingShell title="Companies" />;
}
