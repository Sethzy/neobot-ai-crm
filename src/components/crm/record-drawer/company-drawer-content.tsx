/**
 * Drawer wrapper for the shared company detail surface.
 * @module components/crm/record-drawer/company-drawer-content
 */
"use client";

import { CompanyDetailContent } from "@/components/crm/record-detail/company-detail-content";

interface CompanyDrawerContentProps {
  /** Company id selected in the drawer. */
  companyId: string;
}

export function CompanyDrawerContent({ companyId }: CompanyDrawerContentProps) {
  return <CompanyDetailContent companyId={companyId} surface="drawer" />;
}
