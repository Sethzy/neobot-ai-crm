/**
 * Settings root — redirects to the first concrete settings page.
 * @module app/(dashboard)/settings/page
 */
import { redirect } from "next/navigation";

export default function SettingsRootPage() {
  redirect("/settings/profile");
}
