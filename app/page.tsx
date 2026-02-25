import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { PrimaryFeatures } from "@/components/landing/PrimaryFeatures";
import { UseCases } from "@/components/landing/UseCases";
import { SecondaryFeatures } from "@/components/landing/SecondaryFeatures";
import { Differentiator } from "@/components/landing/Differentiator";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { CallToAction } from "@/components/landing/CallToAction";
import { Testimonials } from "@/components/landing/Testimonials";
import { Pricing } from "@/components/landing/Pricing";
import { Faqs } from "@/components/landing/Faqs";
import { Footer } from "@/components/landing/Footer";

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
