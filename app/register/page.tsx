/**
 * Server entrypoint for the registration route metadata and client shell.
 * @module app/register/page
 */
import type { Metadata } from "next";

import RegisterPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Create account · Sunder",
  description: "Create your Sunder account and set up your workspace.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <RegisterPageClient />;
}
