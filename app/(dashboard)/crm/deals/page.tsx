/**
 * Legacy deals list route kept as a redirect stub.
 * @module app/(dashboard)/crm/deals/page
 */
import { redirect } from "next/navigation";

export default function DealsRedirectPage() {
  redirect("/customers/deals");
}
