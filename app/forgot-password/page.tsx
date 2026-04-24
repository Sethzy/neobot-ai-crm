/**
 * Server entrypoint for forgot-password metadata and client shell.
 * @module app/forgot-password/page
 */
import type { Metadata } from "next";

import ForgotPasswordPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Reset password · Sunder",
  description: "Request a secure password reset link for your Sunder account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}
