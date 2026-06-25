'use client';

/**
 * FAQ section with 3-column grid layout.
 * Mobile: collapsible accordion. Desktop: 3-column grid.
 */
import { useState } from 'react'
import { AppIcon } from '@/components/icons/app-icons'
import { Container } from '@/components/landing/Container'
import { useScrollReveal } from '@/hooks/useScrollReveal'

const faqs = [
  {
    question: 'What is NeoBot?',
    answer:
      'An AI assistant that works for you. Tell it what to do, and it does it — follow-ups, scheduling, admin, all of it.',
  },
  {
    question: 'How is this different from ChatGPT?',
    answer:
      'ChatGPT answers questions. NeoBot takes action. It does not suggest a follow-up — it sends the follow-up.',
  },
  {
    question: 'How long does setup take?',
    answer:
      'One click. No technical setup, no integrations to configure. You\'re up and running in minutes.',
  },
  {
    question: 'How do I talk to NeoBot?',
    answer:
      'Just message NeoBot. In a meeting, on the MRT, wherever — it is always available.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. Dedicated infrastructure, encrypted end-to-end. We never use your data to train models.',
  },
  {
    question: 'What if NeoBot makes a mistake?',
    answer:
      'It learns. Correct it once and it remembers. After a couple of weeks, it adapts to how you work.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. No contracts, no lock-in. Your data is yours.',
  },
  {
    question: 'What\'s the difference between Pro and Teams?',
    answer:
      'Pro gives you full access to NeoBot 24/7 with all skills. Teams adds a manager dashboard, conversation monitoring, and dedicated onboarding for your whole team.',
  },
]

function FaqAccordion({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="divide-y divide-lp-border">
      {faqs.map((faq, index) => (
        <div key={index} className="py-4">
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            aria-expanded={openIndex === index}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="font-medium text-lp-dark">{faq.question}</span>
            <AppIcon
              name="chevronDown"
              className={`h-5 w-5 text-lp-ink-muted transition-transform ${
                openIndex === index ? 'rotate-180' : ''
              }`}
            />
          </button>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${
              openIndex === index ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0">
              <p className="pt-3 text-sm text-lp-ink-muted">{faq.answer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Faqs() {
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()
  const { ref: faqsRef, isVisible: faqsVisible } = useScrollReveal<HTMLDivElement>()

  // Generate FAQPage JSON-LD schema for Google rich results
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <section
      id="faq"
      aria-labelledby="faq-title"
      className="relative overflow-hidden bg-lp-canvas py-20 sm:py-24 md:py-32"
    >
      <Container className="relative">
        <div
          ref={headerRef}
          className={`mx-auto max-w-2xl lg:mx-0 scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
        >
          <h2
            id="faq-title"
            className="font-serif text-balance text-4xl font-medium leading-[0.98] tracking-[-0.03em] text-foreground sm:text-5xl md:text-6xl"
          >
            Frequently asked <span className="text-lp-ink">questions.</span>
          </h2>
          <p className="mt-4 text-base leading-7 text-lp-ink-muted sm:mt-6 sm:text-lg sm:leading-8">
            Everything you need to know about NeoBot.
          </p>
        </div>

        {/* Mobile: Accordion */}
        <div
          ref={faqsRef}
          className={`mt-10 lg:hidden scroll-reveal ${faqsVisible ? 'is-visible' : ''}`}
        >
          <FaqAccordion faqs={faqs} />
        </div>

        {/* Desktop: 3-column grid - unchanged from original */}
        <dl className="hidden lg:mx-auto lg:mt-16 lg:grid lg:max-w-2xl lg:grid-cols-1 lg:gap-x-8 lg:gap-y-10 lg:max-w-none lg:grid-cols-3">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="text-lg font-semibold leading-7 text-foreground">
                {faq.question}
              </dt>
              <dd className="mt-4 text-sm leading-6 text-lp-ink-muted">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
    </>
  )
}
