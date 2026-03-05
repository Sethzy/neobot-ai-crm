'use client';

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/landing/Container";
import { WhatsAppCard, type Message } from "@/components/landing/WhatsAppCard";
import { WhatsAppPhoneMockup } from "@/components/landing/WhatsAppPhoneMockup";
import { SunburstDecoration } from "@/components/landing/SunburstDecoration";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { Send, FileSpreadsheet, Bell, Link2 } from "lucide-react";

/** Mobile messages per feature — each feature gets a static WhatsApp card on mobile */
const featureMobileMessages: (Message[] | null)[] = [
  // Feature 0: "Ask it to schedule. Ask it anything else."
  [
    {
      sender: "assistant",
      text: "You've got a clash on Wednesday — Tan meeting overlaps your prospect block. Want me to move Tan to Thursday and find 3 slots for prospect calls?",
      time: "9:15 AM",
    },
    {
      sender: "user",
      text: "Yes, do it",
      time: "9:15 AM",
    },
    {
      sender: "assistant",
      text: "Done. Tan moved to Thu 2pm, invite updated. Booked your top 3 prospects — Mon 11am, Tue 4pm, Wed 10am.",
      time: "9:16 AM",
    },
    {
      sender: "assistant",
      text: "Each prospect gets a confirmation with your calendar link. I'll prep a brief 30 min before each call.",
      time: "9:16 AM",
    },
  ],
  // Feature 1: "Built to do, not just talk."
  [
    {
      sender: "assistant",
      text: "The Henderson lease just landed. Want me to review it and fill the submission form on the portal?",
      time: "3:20 PM",
    },
    {
      sender: "user",
      text: "Yes — flag anything unusual",
      time: "3:20 PM",
    },
    {
      sender: "assistant",
      text: "Flagged an unusual 18-month non-compete in section 4.2. Rest looks standard. Form filled, screenshots attached.",
      time: "3:21 PM",
    },
    {
      sender: "user",
      text: "Submit it and send the client a voice note confirming",
      time: "3:22 PM",
    },
  ],
  // Feature 2: "Remembers everything that's said."
  [
    {
      sender: "assistant",
      text: "Just off your call with Sarah — she needs the first unit by April 1, wants another showflat visit, and her lawyer is reviewing clause 7.",
      time: "11:00 AM",
    },
    {
      sender: "user",
      text: "Book the showflat and remind me when her lawyer responds",
      time: "11:01 AM",
    },
    {
      sender: "assistant",
      text: "Showflat booked Friday 3pm, invite sent to Sarah. I'll watch for her lawyer's email and ping you the moment it lands.",
      time: "11:01 AM",
    },
  ],
  // Feature 3: "It messages you first."
  [
    {
      sender: "assistant",
      text: "Morning — Sarah's lawyer approved clause 7, 2 new leads qualified overnight, and your Jan commission report is ready.",
      time: "7:30 AM",
    },
    {
      sender: "assistant",
      text: "Want me to draft Sarah's contract and email the report to your accountant?",
      time: "7:30 AM",
    },
    { sender: "user", text: "Yes to both", time: "8:10 AM" },
    {
      sender: "assistant",
      text: "Contract sent to Sarah for e-signature. Report emailed to your accountant.",
      time: "8:10 AM",
    },
  ],
];

const features = [
  {
    title: "Ask it to schedule. Ask it anything else.",
    value: "outreach",
    description:
      "Neo finds the right time, sends the invite, and handles the back-and-forth — so you don't have to.",
    icon: Send,
  },
  {
    title: "Built to do, not just talk.",
    value: "documents",
    description:
      "Contract review, lead enrichment, commission tracking, content generation — real skills, not just conversation. Tell it what you need and it executes.",
    icon: FileSpreadsheet,
  },
  {
    title: "Remembers everything that's said.",
    value: "briefings",
    description:
      "Transcripts, meeting notes, action items — Neo captures it all and turns conversations into follow-ups automatically.",
    icon: Bell,
  },
  {
    title: "It messages you first.",
    value: "followup",
    description:
      "Neo creates tasks overnight, messages you with a plan, and executes the moment you approve. You wake up to work already done.",
    icon: Link2,
  },
];

export function PrimaryFeatures() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { ref: headerRef, isVisible: headerVisible } =
    useScrollReveal<HTMLDivElement>();
  const { ref: featuresRef, isVisible: featuresVisible } =
    useScrollReveal<HTMLDivElement>();
  const shouldReduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "center center"],
  });

  /** Heavy spring config — low stiffness + moderate damping = weighted inertia */
  const springConfig = { stiffness: 50, damping: 20 };
  const rawY = useTransform(scrollYProgress, [0, 0.7, 1], [200, 20, 0]);
  const rawOpacity = useTransform(scrollYProgress, [0, 0.4, 0.8], [0, 0.6, 1]);
  const rawScale = useTransform(scrollYProgress, [0, 0.7, 1], [0.95, 0.99, 1]);

  const y = useSpring(rawY, springConfig);
  const opacity = useSpring(rawOpacity, springConfig);
  const scale = useSpring(rawScale, springConfig);

  return (
    <section
      id="features"
      ref={sectionRef}
      aria-label="Features for AI employee"
      className="relative overflow-hidden bg-background py-20 sm:py-24 md:py-32"
    >
      <Container className="relative">
        <div
          ref={headerRef}
          className={`max-w-2xl md:mx-auto md:text-center xl:max-w-none scroll-reveal ${headerVisible ? "is-visible" : ""}`}
        >
          <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl md:text-5xl">
            The AI assistant that actually{" "}
            <span className="relative w-max inline-block text-foreground z-10">
              <SunburstDecoration className="absolute -left-[5%] top-[85%] w-[110%] pointer-events-none -z-10" />
              works.
            </span>
          </h2>
          <p className="mt-4 text-base tracking-tight text-muted-foreground sm:mt-6 sm:text-lg">
            Neo already knows 30+ sales skills — from reviewing contracts
            to generating leads. No setup. Just ask.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 items-center gap-y-8 sm:mt-16 sm:gap-y-12 md:mt-20 lg:mx-auto lg:max-w-[68rem] lg:grid-cols-12 lg:gap-x-4 lg:pl-12">
          <div
            ref={featuresRef}
            className={`lg:col-span-5 flex flex-col scroll-reveal ${featuresVisible ? "is-visible" : ""}`}
          >
            {features.map((feature, featureIndex) => (
              <div
                key={feature.title}
                tabIndex={0}
                role="button"
                onMouseEnter={() => setSelectedIndex(featureIndex)}
                onClick={() => setSelectedIndex(featureIndex)}
                onFocus={() => setSelectedIndex(featureIndex)}
                className={cn(
                  "group relative py-5 text-left transition-all duration-300 select-none sm:py-6",
                  // Dashed divider for all except the last item
                  featureIndex !== features.length - 1 &&
                    "border-b border-dashed border-zinc-200",
                  // Cursor pointer on desktop only
                  "md:cursor-pointer",
                  // Focus indicator
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunder-green rounded-lg",
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center transition-colors",
                      // Mobile: always active color
                      "text-sunder-green",
                      // Desktop: color based on hover state
                      selectedIndex !== featureIndex &&
                        "md:text-zinc-400 md:group-hover:text-zinc-500",
                    )}
                  >
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3
                    className={cn(
                      "font-serif text-lg transition-colors sm:text-xl",
                      // Mobile: always active color
                      "text-foreground",
                      // Desktop: color based on hover state
                      selectedIndex !== featureIndex &&
                        "md:text-zinc-400 md:group-hover:text-zinc-600",
                    )}
                  >
                    {feature.title}
                  </h3>
                </div>

                <div
                  className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    // Mobile: always expanded
                    "grid-rows-[1fr]",
                    // Desktop: expand/collapse based on hover
                    selectedIndex !== featureIndex && "md:grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p
                      className={cn(
                        "pl-[3.5rem] text-base leading-6 text-muted-foreground pt-4 transition-opacity duration-300",
                        // Mobile: always visible
                        "opacity-100",
                        // Desktop: fade based on hover
                        selectedIndex !== featureIndex && "md:opacity-0",
                      )}
                    >
                      {feature.description}
                    </p>
                  </div>
                </div>

                {/* Mobile per-feature visual — outside overflow-hidden so animations work */}
                {!isDesktop && featureMobileMessages[featureIndex] && (
                  <div className="mt-6 lg:hidden">
                    <div className="mx-auto max-w-sm rounded-2xl overflow-hidden shadow-lg shadow-black/10 ring-1 ring-black/5">
                      <WhatsAppCard
                        messages={featureMobileMessages[featureIndex]!}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: full phone mockup */}
          {isDesktop ? (
            <motion.div style={shouldReduceMotion ? {} : { y, opacity, scale }} className="hidden lg:block lg:col-span-7 lg:-mr-8">
              <div className="w-full flex justify-end">
                <WhatsAppPhoneMockup isVisible />
              </div>
            </motion.div>
          ) : null}
        </div>
      </Container>

      {/* Mobile section divider */}
      <div className="mt-16 sm:hidden">
        <div className="section-divider" />
      </div>
    </section>
  );
}
