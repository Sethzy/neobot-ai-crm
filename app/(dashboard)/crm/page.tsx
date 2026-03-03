/**
 * CRM landing page that redirects to contacts.
 * @module app/(dashboard)/crm/page
 */
import { redirect } from "next/navigation";

export default function CrmPage() {
  redirect("/crm/contacts");
}
