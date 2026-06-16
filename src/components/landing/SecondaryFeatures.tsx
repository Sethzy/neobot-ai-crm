'use client';

/**
 * SecondaryFeatures showcases the product capabilities that are already included on day one.
 * The iconography uses a tighter prebuilt Tabler set instead of generic stock AI symbols.
 */
import dynamic from 'next/dynamic'
import type { LucideIcon } from 'lucide-react'
import {
  KanbanIcon,
  BotMessageSquareIcon,
  PlugIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container } from '@/components/landing/Container'
import { useMediaQuery } from '@/hooks/use-media-query'

const DocumentProcessingAnimation = dynamic(
  () => import('@/components/landing/DocumentProcessingAnimation').then(m => ({ default: m.DocumentProcessingAnimation })),
  { ssr: false }
)
import { useScrollReveal, useStaggeredReveal } from '@/hooks/useScrollReveal'

interface Feature {
  name: string
  value: string
  summary: string
  description: string
  icon: LucideIcon
}

const features: Array<Feature> = [
  {
    name: 'Built-in CRM',
    value: 'crm',
    summary: 'Leads, deals, and scheduling — handled.',
    description:
      'Contacts, follow-ups, pipelines, appointments — managed through chat. No spreadsheets, no manual entry.',
    icon: KanbanIcon,
  },
  {
    name: 'Full AI Power',
    value: 'ai',
    summary: 'Videos, slides, docs — from a message.',
    description:
      'Videos, slides, images, documents — powered by the latest AI models. Describe what you need, it delivers.',
    icon: BotMessageSquareIcon,
  },
  {
    name: 'Your Tools, Connected',
    value: 'integrations',
    summary: 'Gmail, Calendar, Notion, and more.',
    description:
      'NeoBot plugs into your existing apps. One message can check your calendar, draft an email, and update your CRM.',
    icon: PlugIcon,
  },
]

function FeatureCard({
  feature,
  isActive,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  feature: Feature
  isActive: boolean
}) {
  return (
    <div
      className={cn(className, !isActive && 'opacity-75 hover:opacity-100')}
      {...props}
    >
      <div
        className={cn(
          'flex h-12 w-14 items-center justify-center rounded-[1.1rem] border transition-colors duration-300',
          isActive
            ? 'border-[#F5EEE1]/20 bg-[#F5EEE1]/8 text-[#F5EEE1] shadow-[0_18px_40px_-26px_rgba(0,0,0,0.75)]'
            : 'border-white/10 bg-white/[0.04] text-white/45',
        )}
      >
        <feature.icon className="h-7 w-7" />
      </div>
      <h3
        className={cn(
          'mt-4 font-serif text-lg transition-colors',
          isActive ? 'text-[#F5EEE1]' : 'text-white/55',
        )}
      >
        {feature.name}
      </h3>
      <p className="mt-2 font-serif text-xl text-white">
        {feature.summary}
      </p>
      <p className="mt-4 text-sm text-white/70">{feature.description}</p>
    </div>
  )
}

function FeaturesMobile() {
  const { ref, isVisible } = useStaggeredReveal<HTMLDivElement>({
    threshold: 0.1
  })

  return (
    <div className="mt-16 lg:hidden">
      <div
        ref={ref}
        className={`flex flex-col gap-y-4 px-4 sm:px-6 stagger-children ${isVisible ? 'is-visible' : ''}`}
      >
        {features.map((feature) => (
          <FeatureCard
            key={feature.value}
            feature={feature}
            className="mx-auto max-w-2xl rounded-xl bg-white/10 backdrop-blur-sm p-4 shadow-sm ring-1 ring-white/10"
            isActive
          />
        ))}
      </div>
    </div>
  )
}

function FeaturesDesktop() {
  return (
    <div className="hidden lg:mt-20 lg:block">
      <div className="grid grid-cols-3 gap-x-8">
        {features.map((feature) => (
          <FeatureCard key={feature.value} feature={feature} isActive />
        ))}
      </div>
    </div>
  )
}

export function SecondaryFeatures() {
  const isMdUp = useMediaQuery('(min-width: 768px)')
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <div className="bg-parchment">
    <section
      id="secondary-features"
      aria-label="Skills architecture"
      className="relative overflow-hidden rounded-t-[2rem] rounded-b-[2rem] sm:rounded-t-[5rem] sm:rounded-b-[5rem] pt-20 pb-10 sm:pt-24 sm:pb-12 md:pt-32 md:pb-16"
      style={{ backgroundColor: '#024F46' }}
    >
      <Container>
        <div
          ref={headerRef}
          className={`mx-auto max-w-2xl md:text-center scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-2xl tracking-tight text-[#F5EEE1] sm:text-3xl md:text-5xl">
            Everything's <span className="italic text-white">already set up.</span>
          </h2>
          <p className="mt-4 text-base leading-7 text-white/70 sm:mt-6 sm:text-lg sm:leading-8">
            No apps to download. No dashboards to learn. Your CRM, AI tools, and integrations — ready from day one.
          </p>
        </div>
        {!isDesktop ? <FeaturesMobile /> : null}
        {isDesktop ? <FeaturesDesktop /> : null}
        {/* Animation on desktop/tablet only */}
        {isMdUp ? (
          <div className="mt-10 hidden md:block lg:mt-16 rounded-2xl overflow-hidden shadow-2xl shadow-black/20">
            <DocumentProcessingAnimation />
          </div>
        ) : null}
      </Container>

    </section>
    </div>
  )
}
