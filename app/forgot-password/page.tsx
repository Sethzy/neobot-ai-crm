/**
 * Server entrypoint for forgot-password metadata and client shell.
 * @module app/forgot-password/page
 */
import type { Metadata } from "next";

import ForgotPasswordPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Reset password · NeoBot",
  description: "Request a secure password reset link for your NeoBot account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}
