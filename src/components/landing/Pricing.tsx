'use client';

/**
 * Pricing section with Free, Pro, and Teams tiers for Sunder.
 */
import { cn } from '@/lib/utils'
import { Button } from '@/components/landing/Button'
import { Container } from '@/components/landing/Container'
import { useScrollReveal } from '@/hooks/useScrollReveal'

function CheckIcon({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn(
        'h-6 w-6 flex-none fill-current stroke-current',
        className,
      )}
      {...props}
    >
      <path
        d="M9.307 12.248a.75.75 0 1 0-1.114 1.004l1.114-1.004ZM11 15.25l-.557.502a.75.75 0 0 0 1.15-.043L11 15.25Zm4.844-5.041a.75.75 0 0 0-1.188-.918l1.188.918Zm-7.651 3.043 2.25 2.5 1.114-1.004-2.25-2.5-1.114 1.004Zm3.4 2.457 4.25-5.5-1.187-.918-4.25 5.5 1.188.918Z"
        strokeWidth={0}
      />
      <circle
        cx={12}
        cy={12}
        r={8.25}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const plans = [
  {
    name: 'Free',
    price: 'S$0',
    description: 'See what Sunder can do.',
    features: [
      '10 messages per day',
      'All skills & integrations',
      'Full CRM access',
      'Memory that learns you',
    ],
    featured: false,
  },
  {
    name: 'Pro',
    price: 'S$99',
    description: 'Your AI sales assistant, always ready.',
    features: [
      'Unlimited messages',
      'Morning briefings & proactive follow-ups',
      'Voice notes → CRM updates, automatically',
      'Remembers every client detail',
      'Pre-built sales skills, ready to go',
      'Learns your voice and style',
      'All your tools, connected',
    ],
    featured: true,
  },
  {
    name: 'Teams',
    price: 'Custom',
    description: 'Give every rep an AI assistant. See everything.',
    features: [
      'Everything in Pro',
      'Sunder for every team member',
      'Manager dashboard & analytics',
      'Conversation monitoring',
      'Dedicated onboarding',
      'Priority support',
    ],
    featured: false,
    contactSales: true,
  },
]

const valueProps = [
  'Free plan, no credit card required',
  'Cancel anytime, no contracts',
  'Your data never used to train models',
]

export function Pricing() {
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()
  const { ref: cardsRef, isVisible: cardsVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <section
      id="pricing"
      aria-label="Pricing"
      className="bg-gradient-to-b from-parchment via-[#F7ECDA] to-parchment py-20 sm:py-24 md:py-32"
    >
      <Container>
        <div
          ref={headerRef}
          className={`mx-auto max-w-2xl text-center scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl md:text-5xl">
            10 hours back per week for less than <span className="italic text-sunder-green">a coffee a day.</span>
          </h2>
          <p className="mt-4 text-base leading-7 text-lp-muted sm:mt-6 sm:text-lg sm:leading-8">
            Free forever to start. Upgrade when you need more.
          </p>
        </div>

        <div
          ref={cardsRef}
          className={`mx-auto mt-12 grid max-w-lg grid-cols-1 gap-6 sm:mt-16 lg:max-w-none lg:grid-cols-3 scroll-reveal ${cardsVisible ? 'is-visible' : ''}`}
        >
          {plans.map((plan) => {
            const cardContent = (
              <>
                {plan.featured && (
                  <>
                    {/* Thin top stroke for tactile edge */}
                    <div className="absolute inset-x-0 top-0 h-px bg-white/60" />
                    <span className="badge-shimmer mb-3 inline-block rounded-full bg-lp-gold px-3 py-1 text-caption font-bold uppercase tracking-[0.12em] text-white">
                      Most Popular
                    </span>
                  </>
                )}
                <h3
                  className={cn(
                    'font-serif text-xl font-medium',
                    plan.featured ? 'text-white' : 'text-foreground'
                  )}
                >
                  {plan.name}
                </h3>
                <p
                  className={cn(
                    'mt-1 text-sm',
                    plan.featured ? 'text-lp-green-muted' : 'text-lp-muted'
                  )}
                >
                  {plan.description}
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  {plan.price === 'Custom' ? (
                    <span className="text-sm font-medium text-lp-muted">
                      Custom pricing for your team
                    </span>
                  ) : (
                    <>
                      <span
                        className={cn(
                          'font-serif text-4xl font-medium tracking-tight',
                          plan.featured ? 'text-white' : 'text-foreground'
                        )}
                      >
                        {plan.price}
                      </span>
                      <span
                        className={cn(
                          'text-sm',
                          plan.featured ? 'text-lp-green-muted' : 'text-lp-muted'
                        )}
                      >
                        /mo
                      </span>
                    </>
                  )}
                </div>
                <ul
                  role="list"
                  className={cn(
                    'mt-6 flex-1 space-y-3 text-sm leading-6',
                    plan.featured ? 'text-lp-green-muted' : 'text-[#4A4340]'
                  )}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-x-3">
                      <CheckIcon
                        className={cn(
                          'h-6 w-6 flex-none',
                          plan.featured ? 'text-white' : 'text-sunder-green'
                        )}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  href={plan.contactSales ? '/contact' : '/demo'}
                  className={cn(
                    'press-effect mt-6 rounded-full py-2.5 text-sm font-semibold transition-all sm:mt-8',
                    plan.featured
                      ? 'bg-white text-sunder-green hover:bg-emerald-50'
                      : 'bg-sunder-green text-white hover:bg-sunder-green-dark'
                  )}
                >
                  {plan.contactSales ? 'Contact Sales' : plan.price === 'S$0' ? 'Get started' : 'Try for free'}
                </Button>
              </>
            )

            if (plan.featured) {
              return (
                <article
                  key={plan.name}
                  className="relative flex flex-col overflow-hidden rounded-2xl bg-[#024F46] p-6 text-white lg:scale-105 sm:p-8 transition-transform duration-200 hover:-translate-y-1"
                  style={{
                    border: '1px solid rgba(255,255,255,0.6)',
                    boxShadow: '0 25px 50px -12px rgba(27, 50, 36, 0.25)',
                  }}
                >
                  {cardContent}
                </article>
              )
            }

            return (
              <article
                key={plan.name}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-lp-border-warm sm:p-8"
              >
                {cardContent}
              </article>
            )
          })}
        </div>

        <ul className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 sm:mt-12 sm:flex-row sm:justify-center sm:gap-8 lg:max-w-none">
          {valueProps.map((prop) => (
            <li key={prop} className="flex gap-x-3 text-sm text-lp-muted">
              <CheckIcon className="h-5 w-5 flex-none text-sunder-green" />
              {prop}
            </li>
          ))}
        </ul>
      </Container>

      {/* Mobile section divider */}
      <div className="mt-16 sm:hidden">
        <div className="section-divider" />
      </div>
    </section>
  )
}
