/**
 * Server entrypoint for auth-confirm metadata and client shell.
 * @module app/auth/confirm/page
 */
import type { Metadata } from "next";

import ConfirmPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Confirm email · NeoBot",
  description: "Confirm your email address to continue to NeoBot.",
  robots: { index: false, follow: false },
};

export default function ConfirmPage() {
  return <ConfirmPageClient />;
}
