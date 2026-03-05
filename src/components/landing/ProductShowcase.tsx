'use client';

/**
 * ProductShowcase section — bento-style collage of dark CRM screenshots
 * with a blurred workspace background visible in the gaps.
 * Desktop (lg+): centered text + bento collage. Mobile: header + WhatsApp mockup.
 */
import { useRef } from 'react'
import Image from 'next/image'
import { Container } from '@/components/landing/Container'
import { WhatsAppPhoneMockup } from '@/components/landing/WhatsAppPhoneMockup'
import { Iphone } from '@/components/ui/iphone'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import {
  Check,
  Home,
  Users,
  LayoutDashboard,
  Calendar,
  Settings,
  Flame,
  KeyRound,
  Clock3,
} from 'lucide-react'

const benefits = [
  'Auto-sorts leads by priority & deal size',
  'Follow-ups scheduled while you sleep',
  'Every contact, conversation & task in one view',
]

const springTransition = { type: 'spring' as const, stiffness: 35, damping: 14, mass: 2.4 }

/* ------------------------------------------------------------------ */
/*  Dark dashboard — unified app window (sidebar + pipeline)           */
/* ------------------------------------------------------------------ */

const navItems = [
  { icon: Home, label: 'Dashboard', active: false },
  { icon: Users, label: 'Contacts', active: true },
  { icon: LayoutDashboard, label: 'Pipeline', active: false },
  { icon: Calendar, label: 'Calendar', active: false },
  { icon: Settings, label: 'Settings', active: false },
]

const pipelineColumns = [
  {
    title: 'HOT LEADS',
    color: '#E56A6A',
    icon: Flame,
    cards: [
      { name: 'Sarah Chen', company: 'Maple Realty', value: '$1.2M', status: 'Demo booked', initials: 'SC', bg: '#8B5CF6' },
      { name: 'James Lim', company: 'PropNex', value: '$850K', status: 'Viewing set', initials: 'JL', bg: '#3B82F6' },
      { name: 'Rachel Tan', company: 'ERA Singapore', value: '$2.1M', status: 'Active chat', initials: 'RT', bg: '#EC4899' },
    ],
  },
  {
    title: 'ACTIVE',
    color: '#4CAE80',
    icon: KeyRound,
    cards: [
      { name: 'David Lee', company: 'OrangeTee', value: '$1.5M', status: 'Contract sent', initials: 'DL', bg: '#10B981' },
      { name: 'Emily Ng', company: 'Knight Frank', value: '$920K', status: 'Negotiating', initials: 'EN', bg: '#06B6D4' },
      { name: 'Andrew Koh', company: 'CBRE', value: '$3.2M', status: 'Closing', initials: 'AK', bg: '#EF4444' },
    ],
  },
  {
    title: 'FOLLOW UP',
    color: '#D8A139',
    icon: Clock3,
    cards: [
      { name: 'Ryan Teo', company: 'Savills', value: '$1.1M', status: 'Callback', initials: 'RT', bg: '#8B5CF6' },
      { name: 'Michelle L.', company: 'Colliers', value: '$400K', status: '2 weeks ago', initials: 'ML', bg: '#3B82F6' },
      { name: 'Kevin Pang', company: 'EdgeProp', value: '$560K', status: 'Re-engaged', initials: 'KP', bg: '#10B981' },
    ],
  },
]

function DarkDashboard() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1A1A1A]">
      {/* Render at 900px wide, scale to fit container */}
      <div
        className="flex origin-top-left"
        style={{ width: 900, height: 700 }}
      >
        {/* Sidebar */}
        <div className="flex w-[200px] shrink-0 flex-col border-r border-white/[0.06] px-4 py-5">
          <div className="mb-8 flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[12px] font-bold text-black">
              N
            </div>
            <span className="text-[14px] font-semibold text-white">NeoBot</span>
          </div>

          <nav className="space-y-1">
            {navItems.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] ${
                  active
                    ? 'bg-white/[0.08] font-medium text-white'
                    : 'text-white/50'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                {label}
              </div>
            ))}
          </nav>

          <div className="mt-auto border-t border-white/[0.06] pt-4">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/25">
              Favorites
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] text-white/50">
              <span className="text-[11px]">🔥</span> Hot leads
            </div>
            <div className="mt-0.5 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-white/50">
              <span className="text-[11px]">✅</span> My tasks
            </div>
          </div>
        </div>

        {/* Main content — pipeline */}
        <div className="flex-1 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-white">Pipeline</h3>
              <p className="mt-0.5 text-[11px] text-white/30">12 deals · $8.4M total</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/50">
                Filter
              </span>
              <span className="rounded-md bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/50">
                Sort
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {pipelineColumns.map((col) => {
              const Icon = col.icon
              return (
                <div key={col.title}>
                  <div className="mb-3 flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" style={{ color: col.color }} strokeWidth={2} />
                    <span
                      className="text-[10px] font-bold tracking-[0.1em]"
                      style={{ color: col.color }}
                    >
                      {col.title}
                    </span>
                    <span className="ml-auto text-[10px] text-white/20">{col.cards.length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {col.cards.map((card) => (
                      <div
                        key={card.name}
                        className="rounded-lg bg-[#242424] p-3 ring-1 ring-white/[0.04]"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] text-white/40">
                            {card.status}
                          </span>
                          <span className="text-[12px] font-semibold tabular-nums text-white/70">
                            {card.value}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                            style={{ backgroundColor: card.bg }}
                          >
                            {card.initials}
                          </div>
                          <div>
                            <p className="text-[12px] font-medium leading-tight text-white/80">
                              {card.name}
                            </p>
                            <p className="text-[10px] text-white/30">{card.company}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dark mobile chat mockup                                            */
/* ------------------------------------------------------------------ */

function DarkMobileChat() {
  return (
    <div className="relative flex h-full flex-col bg-[#1A1A1A]">
      {/* Status bar */}
      <div className="flex items-end justify-between px-5 pb-0.5 pt-10 text-[9px] font-medium text-white/60">
        <span>11:42</span>
        <div className="flex items-center gap-1">
          <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor">
            <rect x="0" y="7" width="2" height="3" rx="0.5" />
            <rect x="3" y="5" width="2" height="5" rx="0.5" />
            <rect x="6" y="3" width="2" height="7" rx="0.5" />
            <rect x="9" y="0" width="2" height="10" rx="0.5" />
          </svg>
          <svg width="18" height="10" viewBox="0 0 18 10" fill="currentColor">
            <rect x="0" y="1" width="15" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
            <rect x="1.5" y="2.5" width="11" height="5" rx="0.5" fill="currentColor" />
            <rect x="15" y="3" width="2" height="4" rx="0.5" />
          </svg>
        </div>
      </div>

      {/* Chat header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 pb-2.5 pt-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#024F46] text-[9px] font-bold text-white">
          N
        </div>
        <div>
          <p className="text-[11px] font-semibold leading-none text-white">Neo</p>
          <p className="mt-0.5 text-[8px] text-white/30">AI Assistant</p>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 space-y-2.5 overflow-hidden px-3 py-3">
        <div className="ml-6 rounded-2xl rounded-br-sm bg-[#024F46] px-3 py-2">
          <p className="text-[10px] leading-relaxed text-white">
            Schedule follow-ups for all hot leads this week
          </p>
        </div>

        <div className="mr-6 rounded-2xl rounded-bl-sm bg-[#242424] px-3 py-2">
          <p className="text-[10px] leading-relaxed text-white/70">
            Done! 4 follow-ups scheduled:
          </p>
          <div className="mt-1.5 space-y-0.5 text-[9px] text-white/40">
            <p>✓ Sarah Chen — Tomorrow 10am</p>
            <p>✓ James Lim — Wed 2pm</p>
            <p>✓ Rachel Tan — Thu 11am</p>
            <p>✓ Michael Wong — Fri 3pm</p>
          </div>
        </div>

        <div className="ml-6 rounded-2xl rounded-br-sm bg-[#024F46] px-3 py-2">
          <p className="text-[10px] leading-relaxed text-white">
            Draft a proposal for Sarah&apos;s $1.2M deal
          </p>
        </div>

        <div className="mr-6 rounded-2xl rounded-bl-sm bg-[#242424] px-3 py-2">
          <p className="text-[10px] leading-relaxed text-white/70">
            Drafting proposal for Maple Realty — 3BR at Orchard Road, $1.2M. Including comps and viewing history.
          </p>
        </div>

        <div className="ml-6 rounded-2xl rounded-br-sm bg-[#024F46] px-3 py-2">
          <p className="text-[10px] leading-relaxed text-white">
            Send it to her WhatsApp when done
          </p>
        </div>

        <div className="mr-6 rounded-2xl rounded-bl-sm bg-[#242424] px-3 py-2">
          <p className="text-[10px] leading-relaxed text-white/70">
            Will do. I&apos;ll send the PDF to Sarah via WhatsApp once it&apos;s ready.
          </p>
        </div>
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
        <div className="flex flex-1 items-center rounded-full bg-[#242424] px-3 py-2 ring-1 ring-white/[0.04]">
          <span className="text-[9px] text-white/20">Message Neo...</span>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#024F46]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Home indicator */}
      <div className="flex justify-center pb-2 pt-1">
        <div className="h-[4px] w-[90px] rounded-full bg-white/15" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Blurred workspace background                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Section                                                            */
/* ------------------------------------------------------------------ */

export function ProductShowcase() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const shouldReduceMotion = useReducedMotion()
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()
  const sectionRef = useRef<HTMLElement>(null)
  const sectionInView = useInView(sectionRef, { once: true })

  return (
    <section
      id="product-showcase"
      ref={sectionRef}
      aria-label="Product demonstration"
      className="pt-16 pb-10 sm:pt-20 sm:pb-12 md:pt-28 md:pb-16 bg-parchment"
    >
      {/* ---- Mobile / Tablet ---- */}
      {!isDesktop ? (
        <div className="lg:hidden">
          <Container>
            <div
              ref={headerRef}
              className={`mx-auto max-w-2xl text-center scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
            >
              <h2 className="font-serif text-2xl leading-tight tracking-tight text-gray-900 sm:text-3xl md:text-4xl">
                Your second brain,
                <br />
                <span className="italic text-sunder-green">one message away.</span>
              </h2>
              <p className="mt-4 text-base leading-relaxed text-lp-muted sm:text-lg">
                Assign tasks before bed. Wake up to completed work. Your AI
                employee works overnight — all from one app.
              </p>
            </div>
          </Container>
          <div className="mt-10 flex justify-center">
            <WhatsAppPhoneMockup isVisible />
          </div>
          <Container>
            <div className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2">
              {benefits.map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-sunder-green" strokeWidth={2.5} />
                  <span className="text-xs text-lp-muted">{b}</span>
                </div>
              ))}
            </div>
          </Container>
        </div>
      ) : null}

      {/* ---- Desktop: side-by-side (text left, bento right) ---- */}
      {isDesktop ? (
        <Container className="hidden lg:block">
          <div className="grid grid-cols-12 items-center gap-8">
            {/* Text — left column */}
            <motion.div
              className="col-span-6"
              initial={shouldReduceMotion ? false : { y: 50, opacity: 0 }}
              animate={shouldReduceMotion || sectionInView ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : sectionInView ? { ...springTransition, delay: 0.05 } : { duration: 0 }}
            >
              <h2 className="font-serif text-4xl leading-tight tracking-tight text-gray-900 lg:text-5xl">
                Your second brain,
                <br />
                <span className="italic text-sunder-green">one message away.</span>
              </h2>
              <p className="mt-5 max-w-sm text-base leading-relaxed text-lp-muted lg:text-lg">
                Assign tasks before bed. Wake up to completed work. Your AI
                employee works overnight — all from one app.
              </p>
              <div className="mt-8 space-y-3">
                {benefits.map((b) => (
                  <div key={b} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunder-green/10">
                      <Check className="h-3 w-3 text-sunder-green" strokeWidth={2.5} />
                    </div>
                    <span className="text-sm text-lp-muted">{b}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Bento collage — right column */}
            <div className="col-span-6">
              <div className="relative mb-16">
                {/* Main bento frame — blurred photo bg with rounded corners */}
                <motion.div
                  className="relative h-[647px] overflow-hidden rounded-[1.75rem]"
                  initial={shouldReduceMotion ? false : { y: 40, opacity: 0 }}
                  animate={shouldReduceMotion || sectionInView ? { y: 0, opacity: 1 } : { y: 40, opacity: 0 }}
                  transition={shouldReduceMotion ? { duration: 0 } : sectionInView ? { ...springTransition, delay: 0.1 } : { duration: 0 }}
                >
                  <Image
                    src="/images/bento-bg.webp"
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover"
                    style={{ filter: 'blur(4px)', transform: 'scale(1.02)' }}
                  />

                  {/* Dashboard — shifted right, clipped on right edge */}
                  <motion.div
                    className="absolute bottom-[10%] left-[12%] top-[10%] rounded-[1.25rem] bg-[#D9D0C3] p-[3px] shadow-2xl shadow-black/30"
                    style={{ right: '-8%' }}
                    initial={shouldReduceMotion ? false : { y: 50, opacity: 0 }}
                    animate={shouldReduceMotion || sectionInView ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
                    transition={shouldReduceMotion ? { duration: 0 } : sectionInView ? { ...springTransition, delay: 0.25 } : { duration: 0 }}
                  >
                    <div className="h-full overflow-hidden rounded-[1.1rem]">
                      <DarkDashboard />
                    </div>
                  </motion.div>
                </motion.div>

                {/* Phone — real iPhone frame, smaller & overlapping bottom-left */}
                <motion.div
                  className="absolute left-[5%] top-[48%] w-[33%]"
                  style={{ filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.3)) drop-shadow(0 12px 20px rgba(0,0,0,0.15))' }}
                  initial={shouldReduceMotion ? false : { y: 60, opacity: 0 }}
                  animate={shouldReduceMotion || sectionInView ? { y: 0, opacity: 1 } : { y: 60, opacity: 0 }}
                  transition={shouldReduceMotion ? { duration: 0 } : sectionInView ? { ...springTransition, delay: 0.45 } : { duration: 0 }}
                >
                  <Iphone>
                    <DarkMobileChat />
                  </Iphone>
                </motion.div>
              </div>
            </div>
          </div>
        </Container>
      ) : null}
    </section>
  )
}
