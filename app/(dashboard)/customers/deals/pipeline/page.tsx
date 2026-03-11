/**
 * Legacy deals pipeline route redirecting to the unified deals board view.
 * @module app/(dashboard)/customers/deals/pipeline/page
 */
import { redirect } from "next/navigation";

export default function DealsPipelinePage() {
  redirect("/customers/deals?view=kanban");
}
