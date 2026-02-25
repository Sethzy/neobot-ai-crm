import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";

/** Below-fold sections — lazy-loaded to cut initial module count */
const UseCases = dynamic(() => import("@/components/landing/UseCases").then(m => ({ default: m.UseCases })));
const PrimaryFeatures = dynamic(() => import("@/components/landing/PrimaryFeatures").then(m => ({ default: m.PrimaryFeatures })));
const SecondaryFeatures = dynamic(() => import("@/components/landing/SecondaryFeatures").then(m => ({ default: m.SecondaryFeatures })));
const ProductShowcase = dynamic(() => import("@/components/landing/ProductShowcase").then(m => ({ default: m.ProductShowcase })));
const Differentiator = dynamic(() => import("@/components/landing/Differentiator").then(m => ({ default: m.Differentiator })));
const CallToAction = dynamic(() => import("@/components/landing/CallToAction").then(m => ({ default: m.CallToAction })));
const Testimonials = dynamic(() => import("@/components/landing/Testimonials").then(m => ({ default: m.Testimonials })));
const Pricing = dynamic(() => import("@/components/landing/Pricing").then(m => ({ default: m.Pricing })));
const Faqs = dynamic(() => import("@/components/landing/Faqs").then(m => ({ default: m.Faqs })));
const Footer = dynamic(() => import("@/components/landing/Footer").then(m => ({ default: m.Footer })));

export const metadata: Metadata = {
  title: "NeoBot - WhatsApp Your AI Assistant. Get Answers. Get Things Done.",
  description:
    "NeoBot gives you back two hours every day by handling your inbox, meetings, and calendar — so you can focus on the work that moves the needle.",
  openGraph: {
    title: "NeoBot - WhatsApp Your AI Assistant. Get Answers. Get Things Done.",
    description:
      "NeoBot gives you back two hours every day by handling your inbox, meetings, and calendar — so you can focus on the work that moves the needle.",
    images: ["https://www.neobot.com/exports/og-image.png"],
    url: "https://www.neobot.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeoBot - WhatsApp Your AI Assistant. Get Answers. Get Things Done.",
    description:
      "NeoBot gives you back two hours every day by handling your inbox, meetings, and calendar — so you can focus on the work that moves the needle.",
    images: ["https://www.neobot.com/exports/og-image.png"],
  },
  alternates: {
    canonical: "https://www.neobot.com/",
  },
};

export default function LandingPage() {
  return (
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
          <ProductShowcase />
        </div>
        <div className="lp-deferred-section">
          <Differentiator />
        </div>
        <div className="lp-deferred-section">
          <CallToAction />
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
  );
}
