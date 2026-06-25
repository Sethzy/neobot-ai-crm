import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { SmoothScrollShell } from "@/components/landing/SmoothScrollShell";
import { siteBrand } from "@/lib/branding/site";

/** Below-fold sections — lazy-loaded to cut initial module count */
const UseCases = dynamic(() => import("@/components/landing/UseCases").then(m => ({ default: m.UseCases })));
const PrimaryFeatures = dynamic(() => import("@/components/landing/PrimaryFeatures").then(m => ({ default: m.PrimaryFeatures })));
const SecondaryFeatures = dynamic(() => import("@/components/landing/SecondaryFeatures").then(m => ({ default: m.SecondaryFeatures })));
const Differentiator = dynamic(() => import("@/components/landing/Differentiator").then(m => ({ default: m.Differentiator })));
const Testimonials = dynamic(() => import("@/components/landing/Testimonials").then(m => ({ default: m.Testimonials })));
const Pricing = dynamic(() => import("@/components/landing/Pricing").then(m => ({ default: m.Pricing })));
const Faqs = dynamic(() => import("@/components/landing/Faqs").then(m => ({ default: m.Faqs })));
const Footer = dynamic(() => import("@/components/landing/Footer").then(m => ({ default: m.Footer })));

export const metadata: Metadata = {
  title: siteBrand.marketingTitle,
  description: siteBrand.marketingDescription,
  openGraph: {
    title: siteBrand.marketingTitle,
    description: siteBrand.marketingDescription,
    images: [siteBrand.ogImageUrl],
    url: siteBrand.siteUrl,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteBrand.marketingTitle,
    description: siteBrand.marketingDescription,
    images: [siteBrand.ogImageUrl],
  },
  alternates: {
    canonical: siteBrand.siteUrl,
  },
};

export default function LandingPage() {
  return (
    <SmoothScrollShell>
      <div className="landing-page min-h-screen selection:bg-lp-lavender selection:text-lp-ink">
        <Header />
        <main>
          <Hero />
          <div className="lp-deferred-section">
            <UseCases />
          </div>
          <div className="lp-deferred-section">
            <PrimaryFeatures />
          </div>
          <div className="lp-deferred-section">
            <SecondaryFeatures />
          </div>
          <div className="lp-deferred-section">
            <Differentiator />
          </div>
          <div className="lp-deferred-section">
            <Testimonials />
          </div>
          <div className="lp-deferred-section">
            <Pricing />
          </div>
          <div className="lp-deferred-section">
            <Faqs />
          </div>
        </main>
        <Footer />
      </div>
    </SmoothScrollShell>
  );
}
