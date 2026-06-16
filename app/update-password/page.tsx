/**
 * Server entrypoint for update-password metadata and client shell.
 * @module app/update-password/page
 */
import type { Metadata } from "next";

import UpdatePasswordPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Set new password · NeoBot",
  description: "Choose a new password for your NeoBot account.",
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return <UpdatePasswordPageClient />;
}
