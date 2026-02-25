/**
 * Landing page route - home page with marketing content.
 * Auth redirect handled by __root.tsx beforeLoad.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Header } from '@/components/landing/Header'
import { Hero } from '@/components/landing/Hero'
import { PrimaryFeatures } from '@/components/landing/PrimaryFeatures'
import { UseCases } from '@/components/landing/UseCases'
import { SecondaryFeatures } from '@/components/landing/SecondaryFeatures'
import { Differentiator } from '@/components/landing/Differentiator'
import { ProductShowcase } from '@/components/landing/ProductShowcase'
import { CallToAction } from '@/components/landing/CallToAction'
import { Testimonials } from '@/components/landing/Testimonials'
import { Pricing } from '@/components/landing/Pricing'
import { Faqs } from '@/components/landing/Faqs'
import { Footer } from '@/components/landing/Footer'

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "NeoBot - WhatsApp Your AI Assistant. Get Answers. Get Things Done.",
      },
      {
        name: "description",
        content: "NeoBot gives you back two hours every day by handling your inbox, meetings, and calendar — so you can focus on the work that moves the needle.",
      },
      {
        property: "og:title",
        content: "NeoBot - WhatsApp Your AI Assistant. Get Answers. Get Things Done.",
      },
      {
        property: "og:description",
        content: "NeoBot gives you back two hours every day by handling your inbox, meetings, and calendar — so you can focus on the work that moves the needle.",
      },
      {
        property: "og:image",
        content: "https://www.neobot.com/exports/og-image.png",
      },
      {
        property: "og:url",
        content: "https://www.neobot.com/",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "twitter:card",
        content: "summary_large_image",
      },
      {
        property: "twitter:title",
        content: "NeoBot - WhatsApp Your AI Assistant. Get Answers. Get Things Done.",
      },
      {
        property: "twitter:description",
        content: "NeoBot gives you back two hours every day by handling your inbox, meetings, and calendar — so you can focus on the work that moves the needle.",
      },
      {
        property: "twitter:image",
        content: "https://www.neobot.com/exports/og-image.png",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://www.neobot.com/",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
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
  )
}
