/**
 * Route-level loading shell for the people workspace.
 * @module app/(dashboard)/customers/people/loading
 */
import { CrmListLoadingShell } from "@/components/crm/crm-list-loading-shell";

export default function Loading() {
  return <CrmListLoadingShell title="People" />;
}
