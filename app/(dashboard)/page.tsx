/**
 * Dashboard root entry route.
 * @module app/(dashboard)/page
 */
import { redirect } from "next/navigation";

export default function DashboardRootPage() {
  redirect("/chat");
}
