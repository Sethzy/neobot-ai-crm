/**
 * Backward-compatible deals list route redirect.
 * @module app/(dashboard)/crm/deals/page
 */
import { redirect } from "next/navigation";

export default function DealsRedirectPage() {
  redirect("/customers/deals");
}
