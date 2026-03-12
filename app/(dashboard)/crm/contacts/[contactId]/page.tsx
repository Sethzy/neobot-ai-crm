/**
 * Backward-compatible contact detail route redirect.
 * @module app/(dashboard)/crm/contacts/[contactId]/page
 */
import { redirect } from "next/navigation";

interface ContactDetailRouteProps {
  params: Promise<{
    contactId: string;
  }>;
}

export default async function ContactDetailPage({ params }: ContactDetailRouteProps) {
  const { contactId } = await params;
  redirect(`/customers/people/${contactId}`);
}
