/**
 * Server entrypoint for the demo page metadata and client shell.
 * @module app/demo/page
 */
import type { Metadata } from "next";

import { siteBrand } from "@/lib/branding/site";

import DemoPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Book a NeoBot demo",
  description: "See how NeoBot runs your CRM, follow-ups, and meeting prep on autopilot.",
  openGraph: {
    title: "Book a NeoBot demo",
    description: "See how NeoBot runs your CRM, follow-ups, and meeting prep on autopilot.",
    url: `${siteBrand.siteUrl}/demo`,
    images: [siteBrand.ogImageUrl],
  },
  alternates: {
    canonical: `${siteBrand.siteUrl}/demo`,
  },
};

export default function DemoPage() {
  return <DemoPageClient />;
}
