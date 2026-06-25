'use client';

/**
 * Tabbed workflow showcase — displays concrete use-case cards across business
 * categories to communicate the breadth of what NeoBot can do for B2C salespeople.
 */
import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { AppIcon, type AppIconName } from '@/components/icons/app-icons'
import { Container } from '@/components/landing/Container'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { motion, useInView, useReducedMotion } from 'framer-motion'

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
  tabIcon: AppIconName
  cards: WorkflowCard[]
}

/* -------------------------------------------------------------------------- */
/*                                   Data                                     */
/* -------------------------------------------------------------------------- */

const categories: Category[] = [
  {
    label: 'Lead Gen',
    tabIcon: 'leadGen',
    cards: [
      {
        title: 'Lead qualification',
        description:
          "Qualify new inquiries, then message me when a lead is ready for handoff.",
        logos: ['/logos/whatsapp-icon.svg', '/logos/phone.svg'],
      },
      {
        title: 'Lead scraping',
        description:
          'Scrape listing sites for matching prospects and add them to my pipeline daily.',
        logos: ['/logos/firecrawl.svg', '/logos/chrome.svg', '/logos/google-sheets.svg'],
      },
      {
        title: 'Lead research',
        description:
          'Pull LinkedIn, company sites, and public records into a brief before my first call.',
        logos: ['/logos/linkedin.svg', '/logos/firecrawl.svg'],
      },
      {
        title: 'Daily LinkedIn',
        description:
          'Engage people in my market and repost relevant industry content every day.',
        logos: ['/logos/linkedin.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Referral timing',
        description:
          'After a happy close, draft a warm referral ask and send it at the right moment.',
        logos: ['/logos/whatsapp-icon.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Ad lead capture',
        description:
          'Qualify ad leads, tag the source, and book the call from one landing-page visit.',
        logos: ['/logos/instagram-icon.svg', '/logos/meta.svg', '/logos/whatsapp-icon.svg'],
      },
    ],
  },
  {
    label: 'Client Care',
    tabIcon: 'clientCare',
    cards: [
      {
        title: 'Client support',
        description:
          'Answer timeline, paperwork, and next-step questions. Escalate anything tricky.',
        logos: ['/logos/whatsapp-icon.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Reply nudges',
        description:
          "If I miss a client message for 30 minutes, remind me with context.",
        logos: ['/logos/phone.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Birthday messages',
        description:
          'Draft birthday wishes for clients celebrating this week and send the message.',
        logos: ['/logos/google-calendar.svg', '/logos/phone.svg'],
      },
      {
        title: 'Client outings',
        description:
          "Find high-value clients I haven't reached lately and suggest nearby events.",
        logos: ['/logos/googleMaps.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Event planning',
        description:
          'Create sign-up forms, schedule reminders, and prep talking points for my event.',
        logos: ['/logos/google-calendar.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Milestone reminders',
        description:
          "Remind me before client milestones and draft a personal note to send.",
        logos: ['/logos/desktop.svg', '/logos/n8n.svg'],
      },
    ],
  },
  {
    label: 'Deal Pipeline',
    tabIcon: 'agency',
    cards: [
      {
        title: 'Meeting briefing',
        description:
          'Research the prospect and prep a brief before each booked appointment.',
        logos: ['/logos/google-calendar.svg', '/logos/firecrawl.svg'],
      },
      {
        title: 'Meeting recaps',
        description:
          'Turn my post-meeting voice note into takeaways and follow-up tasks.',
        logos: ['/logos/phone.svg', '/logos/google-docs.svg'],
      },
      {
        title: 'Deal comparison',
        description:
          'Extract price, conditions, and timelines from competing offers into a table.',
        logos: ['/logos/google-sheets.svg', '/logos/drive.svg'],
      },
      {
        title: 'Form filling',
        description:
          'Fill submission portals from the deal file and screenshot each step for review.',
        logos: ['/logos/desktop.svg', '/logos/chrome.svg'],
      },
      {
        title: 'Weekly pipeline review',
        description:
          'Every Monday: active deals, overdue tasks, pipeline value, and risks.',
        logos: ['/logos/google-sheets.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Due diligence',
        description:
          'Pull records from online databases and summarize the risk before I commit.',
        logos: ['/logos/firecrawl.svg', '/logos/google.svg'],
      },
    ],
  },
  {
    label: 'Insights',
    tabIcon: 'insights',
    cards: [
      {
        title: 'Competitor monitoring',
        description:
          'Monitor competitor pricing and marketing. Alert me when my territory changes.',
        logos: ['/logos/firecrawl.svg', '/logos/google.svg'],
      },
      {
        title: 'Market research',
        description:
          "When I tag an email 'research', reply with a client-ready summary.",
        logos: ['/logos/gmail.svg', '/logos/firecrawl.svg'],
      },
      {
        title: 'Industry monitoring',
        description:
          'Track relevant podcasts and news, then email me the useful takeaways.',
        logos: ['/logos/spotify.svg', '/logos/gmail.svg'],
      },
      {
        title: 'Lead gen audit',
        description:
          "Review lead sources, show what's converting, and cut what isn't working.",
        logos: ['/logos/google-sheets.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Auto-post wins',
        description:
          'Turn closed deals and milestones into scheduled social posts.',
        logos: ['/logos/instagram-icon.svg', '/logos/linkedin.svg'],
      },
      {
        title: 'Email tracking',
        description:
          'Track opens, research warm prospects, and draft personalized follow-ups.',
        logos: ['/logos/gmail.svg', '/logos/desktop.svg'],
      },
    ],
  },
  {
    label: 'Documents',
    tabIcon: 'document',
    cards: [
      {
        title: 'Contract review',
        description:
          'Review agreements, track deadlines, and flag anything before I sign.',
        logos: ['/logos/google-docs.svg', '/logos/drive.svg'],
      },
      {
        title: 'Document routing',
        description:
          "Classify today's docs, tag the right deal, and file them automatically.",
        logos: ['/logos/drive.svg', '/logos/n8n.svg'],
      },
      {
        title: 'Financial docs',
        description:
          'Extract amounts, dates, and parties from financial docs into a spreadsheet.',
        logos: ['/logos/google-sheets.svg', '/logos/drive.svg'],
      },
      {
        title: 'Expense receipts',
        description:
          'Forward receipts from email or photos and categorize them for tax time.',
        logos: ['/logos/gmail.svg', '/logos/google-sheets.svg'],
      },
      {
        title: 'Compliance check',
        description:
          'Check the transaction file before submission and flag missing items.',
        logos: ['/logos/google-docs.svg', '/logos/desktop.svg'],
      },
      {
        title: 'Receipt scanning',
        description:
          'Read receipt photos, categorize the expense, and log it to your tracker.',
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
  const [hasAnimatedCards, setHasAnimatedCards] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const { ref: sectionRef, isVisible } = useScrollReveal<HTMLElement>()
  const active = categories[activeIndex]

  /** Trigger when the tabs bar is visible — cards animate after user reads the heading. */
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabsInView = useInView(tabsRef, { once: true })

  const handleTabSwitch = (i: number, e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
    setActiveIndex(i)
    ;(e.currentTarget as HTMLElement).scrollIntoView({ inline: 'center', behavior: 'auto', block: 'nearest' })
  }

  /** Keyboard navigation for tabs — arrow keys cycle through tabs */
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const count = categories.length
    let next = i
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      next = (i + 1) % count
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      next = (i - 1 + count) % count
    } else if (e.key === 'Home') {
      e.preventDefault()
      next = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      next = count - 1
    } else {
      return
    }
    setActiveIndex(next)
    // Focus the newly active tab
    const tablist = e.currentTarget.parentElement
    const buttons = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }

  /** Spring transition — low stiffness = heavy/weighted, low damping = more settle time */
  const springTransition = { type: 'spring' as const, stiffness: 35, damping: 14, mass: 2.4 }
  const shouldAnimateCards = !hasAnimatedCards && !shouldReduceMotion

  return (
    <div className="bg-lp-canvas">
    <section
      id="use-cases"
      ref={sectionRef}
      aria-label="Use cases"
      className="relative overflow-hidden bg-lp-black py-20 sm:py-24 md:py-32"
    >

      <Container className="relative">
        {/* ---- Header ---- */}
        <div
          className={`mx-auto max-w-2xl text-center scroll-reveal ${isVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-balance text-4xl font-medium leading-[0.98] tracking-[-0.03em] text-lp-cream sm:text-5xl md:text-6xl">
            <span>What will your sales assistant do?</span>
          </h2>
          <p className="mt-4 text-base text-lp-cream-muted sm:mt-6 sm:text-lg sm:leading-relaxed">
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
            <div role="tablist" aria-label="Use case categories" className="flex items-center gap-1 rounded-full border border-lp-cream/35 bg-lp-cream/[0.06] p-1">
              {categories.map((cat, i) => {
                const isActive = i === activeIndex
                const panelId = `usecase-panel-${cat.label.toLowerCase().replace(/\s/g, '-')}`
                return (
                  <button
                    key={cat.label}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={panelId}
                    tabIndex={isActive ? 0 : -1}
                    onClick={(e) => handleTabSwitch(i, e)}
                    onKeyDown={(e) => handleTabKeyDown(e, i)}
                    className={cn(
                      'flex shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-cream',
                      // Mobile: icon-only for inactive, icon+label for active — 44px min touch target
                      isActive
                        ? 'gap-1.5 bg-lp-cream text-lp-ink shadow-sm px-3.5 py-2 sm:gap-2 sm:px-4 sm:py-2.5'
                        : 'text-lp-cream-muted hover:text-lp-cream min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 sm:gap-2',
                    )}
                  >
                    <AppIcon name={cat.tabIcon} className="h-4 w-4 shrink-0" />
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
          role="tabpanel"
          id={`usecase-panel-${active.label.toLowerCase().replace(/\s/g, '-')}`}
          aria-label={`${active.label} use cases`}
          className="mx-auto mt-10 grid max-w-5xl auto-rows-fr grid-cols-1 gap-3 sm:mt-14 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
        >
          {active.cards.map((card, i) => {
            /** First reveal: spring in from below. After that: instant. */
            return (
            <motion.div
              key={card.title}
              initial={shouldAnimateCards ? { y: 80, opacity: 0, scale: 0.95 } : false}
              animate={
                !shouldAnimateCards || tabsInView
                  ? { y: 0, opacity: 1, scale: 1 }
                  : { y: 80, opacity: 0, scale: 0.95 }
              }
              transition={
                !shouldAnimateCards || !tabsInView
                  ? { duration: 0 }
                  : { ...springTransition, delay: i * 0.08 }
              }
              onAnimationComplete={
                shouldAnimateCards && tabsInView && i === active.cards.length - 1
                  ? () => setHasAnimatedCards(true)
                  : undefined
              }
              className="group flex h-full min-h-[10.75rem] flex-col rounded-xl bg-lp-panel px-5 pt-5 pb-5 sm:min-h-[12rem] sm:px-7 sm:pt-6 sm:pb-6 lg:min-h-[11.5rem]"
            >
              {/* Logos + title */}
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-body font-semibold leading-snug text-lp-dark">
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
              <p className="mt-3 text-sm leading-relaxed text-lp-ink-muted">
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
