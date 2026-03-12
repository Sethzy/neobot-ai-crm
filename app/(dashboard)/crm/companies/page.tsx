/**
 * Legacy companies list route kept as a redirect stub.
 * @module app/(dashboard)/crm/companies/page
 */
import { redirect } from "next/navigation";

export default function CompaniesRedirectPage() {
  redirect("/customers/companies");
}
