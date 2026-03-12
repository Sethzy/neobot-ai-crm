/**
 * Legacy CRM landing route that now redirects to the customers dashboard.
 * @module app/(dashboard)/crm/page
 */
import { redirect } from "next/navigation";

export default function CrmPage() {
  redirect("/customers");
}
