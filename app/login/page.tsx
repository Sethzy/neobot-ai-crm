/**
 * Server entrypoint for the login route metadata and client shell.
 * @module app/login/page
 */
import type { Metadata } from "next";

import LoginPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Sign in · NeoBot",
  description: "Sign in to your NeoBot account.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return <LoginPageClient redirect={redirect} />;
}
