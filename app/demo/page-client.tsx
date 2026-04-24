"use client";

/**
 * Demo booking page with Calendly embed.
 * @module app/demo/page-client
 */
import { useEffect, useState } from "react";

import { Container } from "@/components/landing/Container";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";

export default function DemoPageClient() {
  const [isCalendlyLoaded, setIsCalendlyLoaded] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    script.onload = () => {
      setTimeout(() => setIsCalendlyLoaded(true), 500);
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="landing-page min-h-screen bg-white font-sans selection:bg-sunder-green-light/30 selection:text-sunder-green-dark">
      <Header />
      <main className="py-24 sm:py-32">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 flex flex-col justify-center lg:order-1">
              <h1 className="font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
                See Sunder Handle{" "}
                <span className="text-sunder-green italic">Your Workflows</span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-zinc-600">
                Get a personalized walkthrough with your real use cases. See how
                your AI assistant saves you hours every day.
              </p>
              <ul className="mt-10 space-y-8">
                {[
                  {
                    title: "See It Work on Your Tasks",
                    desc: "Watch Sunder handle your actual follow-ups, scheduling, and client comms live",
                  },
                  {
                    title: "Get Your Time Back",
                    desc: "See exactly how many hours per week you'll reclaim with your specific workflows",
                  },
                  {
                    title: "One-Click Setup",
                    desc: "Walk out with a clear plan to get your AI assistant running the same day",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sunder-green/10">
                      <CheckIcon className="h-5 w-5 text-sunder-green" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-zinc-900">
                        {item.title}
                      </p>
                      <p className="mt-1 text-zinc-500">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative order-1 lg:order-2">
              <div className="absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-r from-sunder-green to-sunder-green-light opacity-20 blur-3xl" />
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl shadow-zinc-200/50 lg:p-6">
                <div className="relative" style={{ minHeight: "660px" }}>
                  {!isCalendlyLoaded ? (
                    <div className="absolute inset-0 animate-pulse space-y-4 p-4">
                      <div className="h-8 w-3/4 rounded bg-zinc-100" />
                      <div className="h-4 w-1/2 rounded bg-zinc-100" />
                      <div className="mt-8 h-full rounded-lg bg-zinc-50" />
                    </div>
                  ) : null}
                  <div
                    className={`calendly-inline-widget transition-opacity duration-500 ${
                      !isCalendlyLoaded ? "opacity-0" : "opacity-100"
                    }`}
                    data-url="https://calendly.com/limzheyi1996/30min?hide_gdpr_banner=1&background_color=ffffff&primary_color=508E86"
                    style={{ minWidth: "300px", height: "660px" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
