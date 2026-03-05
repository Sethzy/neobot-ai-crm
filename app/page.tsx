import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { SmoothScroll } from "@/components/landing/SmoothScroll";

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
  title: "NeoBot - Your AI Sales Assistant. Get Things Done via Chat.",
  description:
    "NeoBot runs your pipeline while you sleep — follow-ups, CRM updates, scheduling, and admin handled automatically. Built for B2C salespeople.",
  openGraph: {
    title: "NeoBot - Your AI Sales Assistant. Get Things Done via Chat.",
    description:
      "NeoBot runs your pipeline while you sleep — follow-ups, CRM updates, scheduling, and admin handled automatically. Built for B2C salespeople.",
    images: ["https://www.neobot.com/exports/og-image.png"],
    url: "https://www.neobot.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeoBot - Your AI Sales Assistant. Get Things Done via Chat.",
    description:
      "NeoBot runs your pipeline while you sleep — follow-ups, CRM updates, scheduling, and admin handled automatically. Built for B2C salespeople.",
    images: ["https://www.neobot.com/exports/og-image.png"],
  },
  alternates: {
    canonical: "https://www.neobot.com/",
  },
};

export default function LandingPage() {
  return (
    <SmoothScroll>
    <div className="landing-page min-h-screen selection:bg-indigo-100 selection:text-indigo-900">
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
    </SmoothScroll>
  );
}
