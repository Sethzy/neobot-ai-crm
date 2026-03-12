/**
 * Legacy contacts list route kept as a redirect stub.
 * @module app/(dashboard)/crm/contacts/page
 */
import { redirect } from "next/navigation";

export default function ContactsRedirectPage() {
  redirect("/customers/people");
}
