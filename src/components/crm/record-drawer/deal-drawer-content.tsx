/**
 * Drawer wrapper for the shared deal detail surface.
 * @module components/crm/record-drawer/deal-drawer-content
 */
"use client";

import { DealDetailContent } from "@/components/crm/record-detail/deal-detail-content";

interface DealDrawerContentProps {
  /** Deal id selected in the drawer. */
  dealId: string;
}

export function DealDrawerContent({ dealId }: DealDrawerContentProps) {
  return <DealDetailContent dealId={dealId} surface="drawer" />;
}
