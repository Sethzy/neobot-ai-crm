'use client';

/**
 * Value comparison section — shows the cost of tools Neo replaces,
 * GoHighLevel-style. Positions Neo as an all-in-one platform with
 * dramatic price comparison and competitor logos.
 */
import { Container } from '@/components/landing/Container'
import { AppIcon, type AppIconName } from '@/components/icons/app-icons'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { SparkleDecoration } from '@/components/landing/SparkleDecoration'
import { cn } from '@/lib/utils'
import { useState } from 'react'

/** Small logo that falls back to a text initial on error. */
function CompetitorLogo({ name, domain }: { name: string; domain: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDE6DB] text-[10px] font-bold text-[#8B7E76]"
        title={name}
      >
        {name[0]}
      </div>
    )
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
      alt={name}
      title={name}
      className="h-6 w-6 shrink-0 rounded-full object-contain"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

interface Competitor {
  name: string
  domain: string
}

interface ToolRow {
  capability: string
  icon: AppIconName
  replaces: Competitor[]
  monthlyCost: number
  status: 'included' | 'coming-soon'
}

const tools: ToolRow[] = [
  { capability: 'CRM & Pipeline', icon: 'dashboard', replaces: [{ name: 'HubSpot', domain: 'hubspot.com' }, { name: 'Follow Up Boss', domain: 'followupboss.com' }], monthlyCost: 99, status: 'included' },
  { capability: 'Booking & Scheduling', icon: 'calendar', replaces: [{ name: 'Calendly', domain: 'calendly.com' }, { name: 'Cal.com', domain: 'cal.com' }], monthlyCost: 49, status: 'included' },
  { capability: 'Forms & Lead Capture', icon: 'form', replaces: [{ name: 'Typeform', domain: 'typeform.com' }, { name: 'Tally', domain: 'tally.so' }], monthlyCost: 49, status: 'included' },
  { capability: 'Document Hub', icon: 'folderOpen', replaces: [{ name: 'Notion', domain: 'notion.so' }, { name: 'Dropbox', domain: 'dropbox.com' }], monthlyCost: 29, status: 'included' },
  { capability: 'Voice Transcription', icon: 'microphone', replaces: [{ name: 'Otter.ai', domain: 'otter.ai' }, { name: 'Fireflies', domain: 'fireflies.ai' }], monthlyCost: 29, status: 'included' },
  { capability: 'WhatsApp Automation', icon: 'whatsapp', replaces: [{ name: 'WATI', domain: 'wati.io' }, { name: 'Respond.io', domain: 'respond.io' }], monthlyCost: 99, status: 'included' },
  { capability: 'AI Workflow Engine', icon: 'automations', replaces: [{ name: 'Zapier', domain: 'zapier.com' }, { name: 'Make', domain: 'make.com' }], monthlyCost: 69, status: 'included' },
  { capability: 'Document Processing', icon: 'document', replaces: [{ name: 'Nanonets', domain: 'nanonets.com' }, { name: 'DocParser', domain: 'docparser.com' }], monthlyCost: 99, status: 'included' },
  { capability: 'Web Scraping', icon: 'globe', replaces: [{ name: 'Apify', domain: 'apify.com' }, { name: 'PhantomBuster', domain: 'phantombuster.com' }], monthlyCost: 99, status: 'included' },
  { capability: 'Browser Automation', icon: 'browser', replaces: [{ name: 'Browserbase', domain: 'browserbase.com' }, { name: 'Selenium Grid', domain: 'selenium.dev' }], monthlyCost: 79, status: 'included' },
  { capability: 'Voice Cloning', icon: 'microphone', replaces: [{ name: 'ElevenLabs', domain: 'elevenlabs.io' }, { name: 'Resemble AI', domain: 'resemble.ai' }], monthlyCost: 49, status: 'included' },
  { capability: 'Social Media', icon: 'share', replaces: [{ name: 'Buffer', domain: 'buffer.com' }, { name: 'Hootsuite', domain: 'hootsuite.com' }], monthlyCost: 99, status: 'coming-soon' },
  { capability: 'Email Sequences', icon: 'email', replaces: [{ name: 'Mailchimp', domain: 'mailchimp.com' }, { name: 'ActiveCampaign', domain: 'activecampaign.com' }], monthlyCost: 79, status: 'coming-soon' },
  { capability: 'Link Tracking', icon: 'link', replaces: [{ name: 'Bitly', domain: 'bitly.com' }, { name: 'Short.io', domain: 'short.io' }], monthlyCost: 49, status: 'coming-soon' },
  { capability: 'Document Signing', icon: 'signature', replaces: [{ name: 'DocuSign', domain: 'docusign.com' }, { name: 'PandaDoc', domain: 'pandadoc.com' }], monthlyCost: 49, status: 'coming-soon' },
]

const totalCost = tools.reduce((sum, t) => sum + t.monthlyCost, 0)

export function Differentiator() {
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()
  const { ref: tableRef, isVisible: tableVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <section
      id="differentiator"
      aria-label="Built-in tools value comparison"
      className="bg-parchment py-20 sm:py-24 md:py-32"
    >
      <Container>
        {/* Header */}
        <div
          ref={headerRef}
          className={`mx-auto max-w-2xl md:text-center scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl md:text-5xl">
            One subscription.{' '}
            <span className="relative inline-block italic text-sunder-green whitespace-nowrap">
              Fifteen tools.
              <SparkleDecoration className="absolute -top-4 -right-10 w-12 h-12 pointer-events-none" />
            </span>
          </h2>
          <p className="mt-4 text-base leading-7 text-lp-muted sm:mt-6 sm:text-lg sm:leading-8">
            CRM, scheduling, forms, document processing, voice cloning — Neo
            runs them all behind the scenes. You just send a message.
          </p>
        </div>

        {/* Comparison table */}
        <div
          ref={tableRef}
          className={`mx-auto mt-12 max-w-3xl scroll-reveal ${tableVisible ? 'is-visible' : ''}`}
        >
          <table className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl shadow-sunder-green-dark/[0.12] ring-1 ring-black/[0.08]">
            <thead>
              <tr
                className="grid grid-cols-[1fr_70px_48px] gap-x-2 items-center px-4 py-5 sm:grid-cols-[1fr_1fr_80px_64px] sm:gap-x-4 sm:px-8 sm:py-5"
                style={{ backgroundColor: '#024F46' }}
              >
                <th scope="col" className="text-left text-[11px] font-semibold uppercase tracking-widest text-white/60 sm:text-xs">
                  Feature
                </th>
                <th scope="col" className="hidden text-left text-[11px] font-semibold uppercase tracking-widest text-white/60 sm:block sm:text-xs">
                  Replaces
                </th>
                <th scope="col" className="text-right text-[11px] font-semibold uppercase tracking-widest text-white/60 sm:text-xs">
                  Cost
                </th>
                <th scope="col" className="text-center">
                  <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-sunder-green-dark sm:text-xs">
                    Neo
                  </span>
                </th>
              </tr>
            </thead>

            <tbody>
              {tools.map((tool, i) => {
                const isComingSoon = tool.status === 'coming-soon'
                return (
                  <tr
                    key={tool.capability}
                    className={cn(
                      'group grid grid-cols-[1fr_70px_48px] gap-x-2 items-center px-4 py-2.5 transition-colors sm:grid-cols-[1fr_1fr_80px_64px] sm:gap-x-4 sm:px-8 sm:py-3',
                      i !== tools.length - 1 && 'border-b border-[#EDE6DB]/60',
                      i % 2 === 0 ? 'bg-white' : 'bg-[#FAF7F2]',
                      'hover:bg-[#F0EBE0]',
                    )}
                  >
                    {/* Feature name + icon */}
                    <td className="flex items-center gap-2.5 sm:gap-3">
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                          isComingSoon
                            ? 'bg-[#EDE6DB]/50 text-[#A89E96]'
                            : 'bg-sunder-green/[0.12] text-sunder-green group-hover:bg-sunder-green/20',
                        )}
                      >
                        <AppIcon name={tool.icon} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={cn(
                            'text-sm font-medium sm:text-[15px]',
                            isComingSoon ? 'text-[#A89E96]' : 'text-foreground',
                          )}
                        >
                          {tool.capability}
                        </div>
                        {/* Replaces — logos + names inline on mobile */}
                        <div className="mt-0.5 flex items-center gap-1.5 sm:hidden">
                          {tool.replaces.map((comp) => (
                            <CompetitorLogo key={comp.domain} name={comp.name} domain={comp.domain} />
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Replaces — desktop: logos + names */}
                    <td
                      className={cn(
                        'hidden items-center gap-2 sm:flex',
                        isComingSoon ? 'opacity-50' : '',
                      )}
                    >
                      {tool.replaces.map((comp) => (
                        <CompetitorLogo key={comp.domain} name={comp.name} domain={comp.domain} />
                      ))}
                      <span className={cn('text-sm', isComingSoon ? 'text-[#C5BBB2]' : 'text-[#8B7E76]')}>
                        {tool.replaces.map((c) => c.name).join(', ')}
                      </span>
                    </td>

                    {/* Monthly cost */}
                    <td
                      className={cn(
                        'text-right text-sm font-medium tabular-nums',
                        isComingSoon ? 'text-[#C5BBB2]' : 'text-[#8B6B55]',
                      )}
                    >
                      ${tool.monthlyCost}/mo
                    </td>

                    {/* Status */}
                    <td className="flex justify-center">
                      {tool.status === 'included' ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sunder-green text-white shadow-md shadow-sunder-green/30 sm:h-9 sm:w-9">
                          <AppIcon name="check" className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                        </div>
                      ) : (
                        <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                          Soon
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            <tfoot>
              <tr
                className="grid grid-cols-[1fr_70px_48px] gap-x-2 items-center px-4 py-6 sm:grid-cols-[1fr_1fr_80px_64px] sm:gap-x-4 sm:px-8 sm:py-7"
                style={{ backgroundColor: '#024F46' }}
              >
                <td className="text-sm font-bold uppercase tracking-wide text-white sm:text-base">
                  Total
                </td>
                <td className="hidden sm:block" />
                <td className="text-right">
                  <span className="text-sm font-bold tabular-nums text-white/40 line-through decoration-white/25 sm:text-lg">
                    ${totalCost}/mo
                  </span>
                </td>
                <td className="text-center">
                  <span className="text-sm font-bold text-white sm:text-lg">
                    S$99
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Savings callout card */}
          <div className="relative mt-8 overflow-hidden rounded-2xl border border-sunder-green/15 bg-[#013D36] px-6 py-10 sm:px-10 sm:py-12 shadow-xl shadow-sunder-green-dark/10">
            {/* Subtle glow */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(64,145,108,0.2),transparent)]" />

            <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-center sm:gap-10">
              {/* Separately */}
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 sm:text-xs">
                  If you bought them all
                </p>
                <p className="mt-2 inline-flex items-baseline justify-center whitespace-nowrap font-serif text-2xl font-bold text-white/40 line-through decoration-white/20 sm:text-3xl">
                  <span className="tabular-nums">${totalCost}</span>
                  <span className="text-base text-white/20 no-underline">/mo</span>
                </p>
              </div>

              {/* Arrow */}
              <AppIcon name="arrowRight" className="hidden h-5 w-5 text-white/30 sm:block" />
              <div className="h-px w-12 bg-white/20 sm:hidden" />

              {/* With Neo */}
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70 sm:text-xs">
                  With Neo
                </p>
                <p className="mt-2 inline-flex items-baseline justify-center whitespace-nowrap font-serif text-3xl font-bold text-white sm:text-4xl">
                  <span className="tabular-nums">S$99</span>
                  <span className="text-lg text-white/60">/mo</span>
                </p>
              </div>
            </div>

            <p className="relative mt-6 text-center text-sm text-white/60 sm:text-base">
              Neo runs them all. You just send a <span className="text-white">message</span>.
            </p>
          </div>
        </div>
      </Container>
    </section>
  )
}
