/**
 * Server entrypoint for auth-confirm metadata and client shell.
 * @module app/auth/confirm/page
 */
import type { Metadata } from "next";

import ConfirmPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Confirm email · Sunder",
  description: "Confirm your email address to continue to Sunder.",
  robots: { index: false, follow: false },
};

export default function ConfirmPage() {
  return <ConfirmPageClient />;
}
