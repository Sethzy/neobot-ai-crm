/**
 * Drawer wrapper for the shared contact detail surface.
 * @module components/crm/record-drawer/contact-drawer-content
 */
"use client";

import { ContactDetailContent } from "@/components/crm/record-detail/contact-detail-content";

interface ContactDrawerContentProps {
  /** Contact id selected in the drawer. */
  contactId: string;
}

export function ContactDrawerContent({ contactId }: ContactDrawerContentProps) {
  return <ContactDetailContent contactId={contactId} surface="drawer" />;
}
