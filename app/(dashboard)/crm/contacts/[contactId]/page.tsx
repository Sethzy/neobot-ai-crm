/**
 * Backward-compatible contact detail route that redirects to drawer query-param entry.
 * @module app/(dashboard)/crm/contacts/[contactId]/page
 */
import { redirect } from "next/navigation";

interface ContactDetailRouteProps {
  params: {
    contactId: string;
  };
}

/**
 * Keeps old deep links working while the canonical detail UX moves to `/crm/contacts?detail=...`.
 */
export default function ContactDetailPage({ params }: ContactDetailRouteProps) {
  redirect(`/crm/contacts?detail=${params.contactId}`);
}

