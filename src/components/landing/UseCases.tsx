'use client';

/**
 * Tabbed workflow showcase — displays concrete use-case cards across business
 * categories to communicate the breadth of what Neo can do for B2C salespeople.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Container } from '@/components/landing/Container'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import {
  Heart,
  Briefcase,
  BarChart3,
  Megaphone,
  Sparkles,
  UserRound,
  Users,
  ListChecks,
  FileText,
  FolderOpen,
  ShieldCheck,
  Calculator,
  Receipt,
  Bell,
  Search,
  Eye,
  Newspaper,
  TrendingDown,
  QrCode,
  MapPin,
  Mic,
  Globe,
  Scale,
  MousePointerClick,
  ScanLine,
} from 'lucide-react'
import {
  SiWhatsapp,
  SiGooglecalendar,
  SiGmail,
  SiLinkedin,
  SiInstagram,
  SiMeta,
  SiGooglesheets,
} from 'react-icons/si'
import type { IconType } from 'react-icons'
import type { LucideProps } from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type AnyIcon = React.ComponentType<LucideProps> | IconType

interface WorkflowCard {
  title: string
  description: string
  icons: AnyIcon[]
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
        icons: [SiWhatsapp, UserRound],
      },
      {
        title: 'Lead scraping',
        description:
          'Scrape listing sites and databases daily for matching prospects, then add them to my pipeline automatically.',
        icons: [Globe, Users],
      },
      {
        title: 'Lead research',
        description:
          'New lead added? Pull their LinkedIn, company site, and public records. Get me a full brief before my first call.',
        icons: [Search, UserRound],
      },
      {
        title: 'Daily LinkedIn',
        description:
          'Every day, engage with people in my market and repost relevant industry content on LinkedIn.',
        icons: [SiLinkedin, Sparkles],
      },
      {
        title: 'Referral timing',
        description:
          'Client just closed and sentiment is high. Draft a warm referral ask and send it at the right moment.',
        icons: [Sparkles, SiWhatsapp],
      },
      {
        title: 'Ad lead capture',
        description:
          'Someone clicks my ad and lands on the page — Neo qualifies them, tags the source, and books a call.',
        icons: [SiInstagram, SiWhatsapp],
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
        icons: [SiWhatsapp, UserRound],
      },
      {
        title: 'Reply nudges',
        description:
          "If a client messages me and I don't respond within 30 minutes, send me a reminder with context so nothing slips.",
        icons: [SiWhatsapp, Bell],
      },
      {
        title: 'Birthday messages',
        description:
          'Draft personalized birthday wishes for every client celebrating this week and send them a message.',
        icons: [SiGooglecalendar, SiWhatsapp],
      },
      {
        title: 'Client outings',
        description:
          "Find high-value clients I haven't reached out to in a while and events nearby to invite them to.",
        icons: [Users, MapPin],
      },
      {
        title: 'Event planning',
        description:
          'Plan my client event this weekend — create sign-up forms, schedule reminders, and prep talking points.',
        icons: [QrCode, SiGooglecalendar],
      },
      {
        title: 'Milestone reminders',
        description:
          "Client's anniversary is coming up. Remind me a week early and draft a personal note to send.",
        icons: [SiGooglecalendar, SiWhatsapp],
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
        icons: [SiGooglecalendar, UserRound],
      },
      {
        title: 'Meeting recaps',
        description:
          "Just finished a client meeting. Here's my voice note — log key takeaways and create follow-up tasks.",
        icons: [Mic, ListChecks],
      },
      {
        title: 'Deal comparison',
        description:
          'Upload competing offers or quotes. Neo extracts key terms — price, conditions, timeline — into a side-by-side table.',
        icons: [Scale, FileText],
      },
      {
        title: 'Form filling',
        description:
          'Neo opens the submission portal, fills the application from your deal file, and screenshots each step for your review.',
        icons: [MousePointerClick, FileText],
      },
      {
        title: 'Weekly pipeline review',
        description:
          'Every Monday: deals in progress, tasks overdue, pipeline value, and areas that need my attention.',
        icons: [BarChart3, Newspaper],
      },
      {
        title: 'Due diligence',
        description:
          'Pull transaction history, public filings, and background records from online databases. Get a summary before you commit.',
        icons: [Search, ShieldCheck],
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
        icons: [Eye, Bell],
      },
      {
        title: 'Market research',
        description:
          "When I tag an email 'research', deep dive the topic and reply with a summary I can use with clients.",
        icons: [Search, SiGmail],
      },
      {
        title: 'Industry monitoring',
        description:
          'Monitor industry podcasts and news for discussions relevant to my market and email me a summary.',
        icons: [Newspaper, SiGmail],
      },
      {
        title: 'Lead gen audit',
        description:
          "Review all my lead gen subscriptions — which sources are actually converting? Cut what's not working.",
        icons: [TrendingDown, Calculator],
      },
      {
        title: 'Auto-post wins',
        description:
          'When I close a deal or hit a milestone, auto-generate a social post and schedule it across my channels.',
        icons: [SiInstagram, SiMeta],
      },
      {
        title: 'Email tracking',
        description:
          'Track opens on my outbound emails. When a prospect opens, research them and draft a personalized follow-up.',
        icons: [SiGmail, SiWhatsapp],
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
        icons: [FileText, ShieldCheck],
      },
      {
        title: 'Document routing',
        description:
          "Sort today's incoming docs — classify each by type, tag the right deal, and file them automatically.",
        icons: [FileText, FolderOpen],
      },
      {
        title: 'Financial docs',
        description:
          'Upload bank statements, invoices, or commission slips. Neo extracts amounts, dates, and parties into a clean spreadsheet.',
        icons: [Calculator, Receipt],
      },
      {
        title: 'Expense receipts',
        description:
          'Forward receipts from email or photos — client dinners, mileage, subscriptions — Neo categorizes everything for tax time.',
        icons: [Receipt, SiGooglesheets],
      },
      {
        title: 'Compliance check',
        description:
          'Run a compliance check on the transaction file before submission. Neo flags missing items and inconsistencies.',
        icons: [ShieldCheck, FileText],
      },
      {
        title: 'Receipt scanning',
        description:
          'Snap a photo of any receipt. Neo reads it, categorizes the expense, and logs it to your tracker.',
        icons: [ScanLine, Receipt],
      },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/*                              Icon renderer                                 */
/* -------------------------------------------------------------------------- */

/** Renders a single icon — always white for use inside the solid green badge. */
function WorkflowIcon({ icon: Icon }: { icon: AnyIcon }) {
  return <Icon className="h-5 w-5 shrink-0 text-white" />
}

/* -------------------------------------------------------------------------- */
/*                                Component                                   */
/* -------------------------------------------------------------------------- */

export function UseCases() {
  const [activeIndex, setActiveIndex] = useState(0)
  const { ref: sectionRef, isVisible } = useScrollReveal<HTMLElement>()
  const active = categories[activeIndex]

  /** Scroll the tapped tab into the visible center of the pill bar. */
  const handleTabClick = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    setActiveIndex(i)
    const btn = e.currentTarget
    btn.scrollIntoView({ inline: 'center', behavior: 'auto', block: 'nearest' })
  }

  return (
    <section
      id="use-cases"
      ref={sectionRef}
      aria-label="Use cases"
      className="relative overflow-hidden py-20 sm:py-24 md:py-32"
      style={{
        background:
          'radial-gradient(ellipse 160% 140% at 50% 30%, #0A2818 0%, #040F08 100%)',
      }}
    >
      {/* Ambient neon glow behind content */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[800px]"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(34,197,94,0.18) 0%, transparent 100%)',
        }}
      />

      <Container className="relative">
        {/* ---- Header ---- */}
        <div
          className={`mx-auto max-w-2xl text-center scroll-reveal ${isVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-2xl tracking-tight text-white sm:text-3xl md:text-5xl">
            What will your assistant do?
          </h2>
          <p className="mt-4 text-base text-white/70 sm:mt-6 sm:text-lg sm:leading-relaxed">
            From customer support to closing deals — one message is all it
            takes.
          </p>
        </div>

        {/* ---- Tabs — icon-only inactive on mobile, all labels on desktop ---- */}
        <div
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
                    onClick={(e) => handleTabClick(i, e)}
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
          {active.cards.map((card) => (
            <div
              key={card.title}
              className="group relative rounded-2xl bg-white p-4 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.14)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.20)]"
            >
              {/* Icon + title: inline on mobile, stacked on sm+ */}
              <div className="flex items-center gap-3 sm:block">
                <div className="h-8 w-8 shrink-0 sm:mb-4 sm:h-10 sm:w-10 flex items-center justify-center rounded-full bg-[#2D6A4F] shadow-sm shadow-black/10">
                  <WorkflowIcon icon={card.icons[0]} />
                </div>
                <h3 className="text-[15px] font-semibold leading-snug text-zinc-900">
                  {card.title}
                </h3>
              </div>

              {/* Description */}
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
