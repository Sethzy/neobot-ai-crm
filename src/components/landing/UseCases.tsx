'use client';

/**
 * Tabbed workflow showcase — displays concrete use-case cards across business
 * categories to communicate the breadth of what Neo can do for B2C salespeople.
 */
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Container } from '@/components/landing/Container'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { motion, useInView } from 'framer-motion'
import {
  Heart,
  Briefcase,
  BarChart3,
  Megaphone,
  FileText,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

interface WorkflowCard {
  title: string
  description: string
  /** Paths to SVG logos in /public/logos/ */
  logos: string[]
}

interface Category {
  label: string
  tabIcon: React.ComponentType<LucideProps>
  cards: WorkflowCard[]
}

/* -------------------------------------------------------------------------- */
/*                                   Data                                     */
/* -------------------------------------------------------------------------- */

const categories: Category[] = [
  {
    label: 'Lead Gen',
    tabIcon: Megaphone,
    cards: [
      {
        title: 'Lead qualification',
        description:
          "Handle initial inquiries until they're qualified, then message me when it's ready for hand off.",
        logos: ['/logos/whatsapp-icon.svg', '/logos/phone.svg'],
      },
      {
        title: 'Lead scraping',
        description:
          'Scrape listing sites and databases daily for matching prospects, then add them to my pipeline automatically.',
        logos: ['/logos/firecrawl.svg', '/logos/chrome.svg', '/logos/google-sheets.svg'],
      },
      {
        title: 'Lead research',
        description:
          'New lead added? Pull their LinkedIn, company site, and public records. Get me a full brief before my first call.',
        logos: ['/logos/linkedin.svg', '/logos/firecrawl.svg'],
      },
      {
        title: 'Daily LinkedIn',
        description:
          'Every day, engage with people in my market and repost relevant industry content on LinkedIn.',
        logos: ['/logos/linkedin.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Referral timing',
        description:
          'Client just closed and sentiment is high. Draft a warm referral ask and send it at the right moment.',
        logos: ['/logos/whatsapp-icon.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Ad lead capture',
        description:
          'Someone clicks my ad and lands on the page — Neo qualifies them, tags the source, and books a call.',
        logos: ['/logos/instagram-icon.svg', '/logos/meta.svg', '/logos/whatsapp-icon.svg'],
      },
    ],
  },
  {
    label: 'Client Care',
    tabIcon: Heart,
    cards: [
      {
        title: 'Client support',
        description:
          'Triage incoming client questions about timelines, paperwork, and next steps — draft responses and escalate anything complex.',
        logos: ['/logos/whatsapp-icon.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Reply nudges',
        description:
          "If a client messages me and I don't respond within 30 minutes, send me a reminder with context so nothing slips.",
        logos: ['/logos/phone.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Birthday messages',
        description:
          'Draft personalized birthday wishes for every client celebrating this week and send them a message.',
        logos: ['/logos/google-calendar.svg', '/logos/phone.svg'],
      },
      {
        title: 'Client outings',
        description:
          "Find high-value clients I haven't reached out to in a while and events nearby to invite them to.",
        logos: ['/logos/googleMaps.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Event planning',
        description:
          'Plan my client event this weekend — create sign-up forms, schedule reminders, and prep talking points.',
        logos: ['/logos/google-calendar.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Milestone reminders',
        description:
          "Client's anniversary is coming up. Remind me a week early and draft a personal note to send.",
        logos: ['/logos/desktop.svg', '/logos/n8n.svg'],
      },
    ],
  },
  {
    label: 'Deal Pipeline',
    tabIcon: Briefcase,
    cards: [
      {
        title: 'Meeting briefing',
        description:
          'New appointment booked — research the prospect, pull relevant context, and prep me a brief before I walk in.',
        logos: ['/logos/google-calendar.svg', '/logos/firecrawl.svg'],
      },
      {
        title: 'Meeting recaps',
        description:
          "Just finished a client meeting. Here's my voice note — log key takeaways and create follow-up tasks.",
        logos: ['/logos/phone.svg', '/logos/google-docs.svg'],
      },
      {
        title: 'Deal comparison',
        description:
          'Upload competing offers or quotes. Neo extracts key terms — price, conditions, timeline — into a side-by-side table.',
        logos: ['/logos/google-sheets.svg', '/logos/drive.svg'],
      },
      {
        title: 'Form filling',
        description:
          'Neo opens the submission portal, fills the application from your deal file, and screenshots each step for your review.',
        logos: ['/logos/desktop.svg', '/logos/chrome.svg'],
      },
      {
        title: 'Weekly pipeline review',
        description:
          'Every Monday: deals in progress, tasks overdue, pipeline value, and areas that need my attention.',
        logos: ['/logos/google-sheets.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Due diligence',
        description:
          'Pull transaction history, public filings, and background records from online databases. Get a summary before committing.',
        logos: ['/logos/firecrawl.svg', '/logos/google.svg'],
      },
    ],
  },
  {
    label: 'Insights',
    tabIcon: BarChart3,
    cards: [
      {
        title: 'Competitor monitoring',
        description:
          "Monitor competitors' pricing and marketing — alert me the moment anything changes in my territory.",
        logos: ['/logos/firecrawl.svg', '/logos/google.svg'],
      },
      {
        title: 'Market research',
        description:
          "When I tag an email 'research', deep dive the topic and reply with a summary I can use with clients.",
        logos: ['/logos/gmail.svg', '/logos/firecrawl.svg'],
      },
      {
        title: 'Industry monitoring',
        description:
          'Monitor industry podcasts and news for discussions relevant to my market and email me a summary.',
        logos: ['/logos/spotify.svg', '/logos/gmail.svg'],
      },
      {
        title: 'Lead gen audit',
        description:
          "Review all my lead gen subscriptions — which sources are actually converting? Cut what's not working.",
        logos: ['/logos/google-sheets.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Auto-post wins',
        description:
          'When I close a deal or hit a milestone, auto-generate a social post and schedule it across my channels.',
        logos: ['/logos/instagram-icon.svg', '/logos/linkedin.svg'],
      },
      {
        title: 'Email tracking',
        description:
          'Track opens on my outbound emails. When a prospect opens, research them and draft a personalized follow-up.',
        logos: ['/logos/gmail.svg', '/logos/desktop.svg'],
      },
    ],
  },
  {
    label: 'Documents',
    tabIcon: FileText,
    cards: [
      {
        title: 'Contract review',
        description:
          'Review this agreement for unusual terms, track all deadlines, and flag anything that needs attention before I sign.',
        logos: ['/logos/google-docs.svg', '/logos/drive.svg'],
      },
      {
        title: 'Document routing',
        description:
          "Sort today's incoming docs — classify each by type, tag the right deal, and file them automatically.",
        logos: ['/logos/drive.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Financial docs',
        description:
          'Upload bank statements, invoices, or commission slips. Neo extracts amounts, dates, and parties into a spreadsheet.',
        logos: ['/logos/google-sheets.svg', '/logos/drive.svg'],
      },
      {
        title: 'Expense receipts',
        description:
          'Forward receipts from email or photos — client dinners, mileage, subscriptions — Neo categorizes everything for tax time.',
        logos: ['/logos/gmail.svg', '/logos/google-sheets.svg'],
      },
      {
        title: 'Compliance check',
        description:
          'Run a compliance check on the transaction file before submission. Neo flags missing items and inconsistencies.',
        logos: ['/logos/google-docs.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Receipt scanning',
        description:
          'Snap a photo of any receipt. Neo reads it, categorizes the expense, and logs it to your tracker.',
        logos: ['/logos/phone.svg', '/logos/google-sheets.svg'],
      },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/*                                Component                                   */
/* -------------------------------------------------------------------------- */

export function UseCases() {
  const [activeIndex, setActiveIndex] = useState(0)
  const { ref: sectionRef, isVisible } = useScrollReveal<HTMLElement>()
  const active = categories[activeIndex]

  /** Trigger when the tabs bar is visible — cards animate after user reads the heading. */
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabsInView = useInView(tabsRef, { once: true })

  /** Mark revealed AFTER the first animated render so tab switches skip animation. */
  const hasRevealedRef = useRef(false)
  useEffect(() => {
    if (tabsInView) hasRevealedRef.current = true
  }, [tabsInView])

  const handleTabSwitch = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    setActiveIndex(i)
    e.currentTarget.scrollIntoView({ inline: 'center', behavior: 'auto', block: 'nearest' })
  }

  /** Spring transition — low stiffness = heavy/weighted, low damping = more settle time */
  const springTransition = { type: 'spring' as const, stiffness: 35, damping: 14, mass: 2.4 }

  return (
    <div style={{ backgroundColor: '#F5EEE1' }}>
    <section
      id="use-cases"
      ref={sectionRef}
      aria-label="Use cases"
      className="relative overflow-hidden rounded-t-[2rem] rounded-b-[2rem] sm:rounded-t-[5rem] sm:rounded-b-[5rem] py-20 sm:py-24 md:py-32"
      style={{ backgroundColor: '#1A1A1A' }}
    >

      <Container className="relative">
        {/* ---- Header ---- */}
        <div
          className={`mx-auto max-w-2xl text-center scroll-reveal ${isVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-2xl tracking-tight text-white sm:text-3xl md:text-5xl">
            <span style={{ color: '#FBF7F3' }}>What will your sales assistant do?</span>
          </h2>
          <p className="mt-4 text-base text-white/70 sm:mt-6 sm:text-lg sm:leading-relaxed">
            From customer support to closing deals — one message is all it
            takes.
          </p>
        </div>

        {/* ---- Tabs — icon-only inactive on mobile, all labels on desktop ---- */}
        <div
          ref={tabsRef}
          className={`mt-6 sm:mt-8 scroll-reveal ${isVisible ? 'is-visible' : ''}`}
        >
          <div className="flex justify-center">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-1 backdrop-blur-sm">
              {categories.map((cat, i) => {
                const Icon = cat.tabIcon
                const isActive = i === activeIndex
                return (
                  <button
                    key={cat.label}
                    onClick={(e) => handleTabSwitch(i, e)}
                    className={cn(
                      'flex shrink-0 items-center justify-center rounded-full',
                      // Mobile: icon-only for inactive, icon+label for active
                      isActive
                        ? 'gap-1.5 bg-white text-sunder-green-dark shadow-lg shadow-black/10 px-3.5 py-2 sm:gap-2 sm:px-4 sm:py-2.5'
                        : 'text-white/40 hover:text-white/70 w-9 h-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 sm:gap-2',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {/* Mobile: only show label for active tab. Desktop: always show. */}
                    <span className={cn(
                      'text-sm font-medium whitespace-nowrap',
                      isActive ? 'w-auto opacity-100' : 'hidden sm:inline sm:w-auto sm:opacity-100',
                    )}>
                      {cat.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ---- Card grid ---- */}
        <div
          className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-3 sm:mt-14 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
        >
          {active.cards.map((card, i) => {
            /** First reveal: spring in from below. After that: instant. */
            const skipAnimation = hasRevealedRef.current
            return (
            <motion.div
              key={card.title}
              initial={skipAnimation ? false : { y: 80, opacity: 0, scale: 0.95 }}
              animate={
                skipAnimation || tabsInView
                  ? { y: 0, opacity: 1, scale: 1 }
                  : { y: 80, opacity: 0, scale: 0.95 }
              }
              transition={
                skipAnimation || !tabsInView
                  ? { duration: 0 }
                  : { ...springTransition, delay: i * 0.08 }
              }
              className="group rounded-2xl bg-[#F5EEE1] px-5 pt-5 pb-5 sm:px-7 sm:pt-6 sm:pb-6"
            >
              {/* Logos + title */}
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-[15px] font-semibold leading-snug text-zinc-900">
                  {card.title}
                </h3>
                <div className="flex items-center gap-3 shrink-0">
                  {card.logos.map((logo) => (
                    <img
                      key={logo}
                      src={logo}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0"
                    />
                  ))}
                </div>
              </div>

              {/* Description */}
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                {card.description}
              </p>
            </motion.div>
            )
          })}
        </div>
      </Container>
    </section>
    </div>
  )
}
