/**
 * Backward-compatible contact detail route that redirects to drawer query-param entry.
 * @module app/(dashboard)/crm/contacts/[contactId]/page
 */
import { redirect } from "next/navigation";

interface ContactDetailRouteProps {
  params: Promise<{
    contactId: string;
  }>;
}

/**
 * Keeps old deep links working while the canonical detail UX moves to `/crm/contacts?detail=...`.
 */
export default async function ContactDetailPage({ params }: ContactDetailRouteProps) {
  const { contactId } = await params;
  redirect(`/crm/contacts?detail=${contactId}`);
}

