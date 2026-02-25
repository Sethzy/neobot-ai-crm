/**
 * Demo booking page with Calendly embed.
 * Matching landing page aesthetic with NeoBot branding.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Header } from '@/components/landing/Header'
import { Footer } from '@/components/landing/Footer'
import { Container } from '@/components/landing/Container'

export const Route = createFileRoute('/demo')({
  head: () => ({
    meta: [
      {
        title: "Book a Demo | NeoBot",
      },
      {
        name: "description",
        content: "See NeoBot in action. Get a personalized walkthrough and see how your AI assistant handles your real workflows.",
      },
      {
        property: "og:title",
        content: "Book a Demo | NeoBot",
      },
      {
        property: "og:description",
        content: "See NeoBot in action. Get a personalized walkthrough and see how your AI assistant handles your real workflows.",
      },
      {
        property: "og:image",
        content: "https://www.trysunder.com/exports/og-image.png",
      },
      {
        property: "og:url",
        content: "https://www.trysunder.com/demo",
      },
      {
        property: "twitter:card",
        content: "summary_large_image",
      },
      {
        property: "og:type",
        content: "website",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://www.trysunder.com/demo",
      },
    ],
  }),
  component: DemoPage,
})

function DemoPage() {
  const [isCalendlyLoaded, setIsCalendlyLoaded] = useState(false)

  useEffect(() => {
    // Load Calendly widget script
    const script = document.createElement('script')
    script.src = 'https://assets.calendly.com/assets/external/widget.js'
    script.async = true
    script.onload = () => {
      // Give Calendly a moment to render after script loads
      setTimeout(() => setIsCalendlyLoaded(true), 500)
    }
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <div className="landing-page min-h-screen bg-white font-sans selection:bg-sunder-green-light/30 selection:text-sunder-green-dark">
      <Header />
      
      <main className="py-24 sm:py-32">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Text Column - Left for better narrative flow */}
            <div className="flex flex-col justify-center order-2 lg:order-1">
              <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
                See NeoBot Handle{' '}
                <span className="text-sunder-green italic">Your Workflows</span>
              </h1>
              <p className="mt-6 text-lg text-zinc-600 leading-relaxed">
                Get a personalized walkthrough with your real use cases. See how
                your AI assistant saves you hours every day.
              </p>

              <ul className="mt-10 space-y-8">
                {[
                  {
                    title: "See It Work on Your Tasks",
                    desc: "Watch Neo handle your actual follow-ups, scheduling, and client comms live"
                  },
                  {
                    title: "Get Your Time Back",
                    desc: "See exactly how many hours per week you'll reclaim with your specific workflows"
                  },
                  {
                    title: "One-Click Setup",
                    desc: "Walk out with a clear plan to get your AI assistant running the same day"
                  }
                ].map((item, i) => (
                  <li key={i} className="flex gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sunder-green/10">
                      <CheckIcon className="h-5 w-5 text-sunder-green" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 text-lg">
                        {item.title}
                      </p>
                      <p className="mt-1 text-zinc-500">
                        {item.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Calendly Column - Right */}
            <div className="relative order-1 lg:order-2">
              {/* Glow Effect */}
              <div className="absolute -inset-4 bg-gradient-to-r from-sunder-green to-sunder-green-light opacity-20 blur-3xl rounded-[3rem] -z-10" />
              
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl shadow-zinc-200/50 lg:p-6">
                {/* Fixed height container to prevent layout shift */}
                <div className="relative" style={{ minHeight: '660px' }}>
                  {/* Loading skeleton - absolutely positioned overlay */}
                  {!isCalendlyLoaded && (
                    <div className="absolute inset-0 animate-pulse space-y-4 p-4">
                      <div className="h-8 w-3/4 rounded bg-zinc-100" />
                      <div className="h-4 w-1/2 rounded bg-zinc-100" />
                      <div className="mt-8 h-full rounded-lg bg-zinc-50" />
                    </div>
                  )}
                  {/* Calendly widget */}
                  <div
                    className={`calendly-inline-widget transition-opacity duration-500 ${!isCalendlyLoaded ? 'opacity-0' : 'opacity-100'}`}
                    data-url="https://calendly.com/limzheyi1996/30min?hide_gdpr_banner=1&background_color=ffffff&primary_color=508E86"
                    style={{ minWidth: '300px', height: '660px' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}
