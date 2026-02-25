'use client';

/**
 * Testimonials section with 3-column grid of customer quotes.
 * Mobile: horizontal carousel with active indicators. Desktop: 3-column grid.
 */
import { useState, useEffect, useRef } from 'react'
import { Container } from '@/components/landing/Container'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { useMediaQuery } from '@/hooks/use-media-query'

/** Type for a single testimonial */
interface Testimonial {
  content: string
  stats: { value: string; label: string }[]
  author: { name: string; role: string }
}

/**
 * Animated stat that counts up from 0 when triggered.
 * Works on both mobile and desktop.
 * Uses ease-out timing for smooth deceleration.
 */
function AnimatedStat({ value, isActive, isVisible, hasAnimated, onAnimated }: {
  value: string
  isActive: boolean
  isVisible: boolean
  hasAnimated: boolean
  onAnimated: () => void
}) {
  const [displayValue, setDisplayValue] = useState('0')
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    // Skip if already animated, not visible, or not active
    if (hasAnimated || !isVisible || !isActive) return

    // Parse numeric part and suffix (e.g., "90%" → 90, "%")
    const match = value.match(/^(\d+)(.*)$/)
    if (!match) {
      // Non-numeric values just show immediately
      setDisplayValue(value)
      onAnimated()
      return
    }

    const targetNum = parseInt(match[1], 10)
    const suffix = match[2] || ''

    // Start from 0 for dramatic count-up
    const startNum = 0
    const duration = 1200
    const startTime = performance.now()

    setIsAnimating(true)

    // Ease-out quart: starts fast, slows down dramatically at end
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutQuart(progress)

      const currentNum = Math.round(startNum + (targetNum - startNum) * easedProgress)
      setDisplayValue(`${currentNum}${suffix}`)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
        onAnimated()
      }
    }

    requestAnimationFrame(animate)
  }, [isActive, isVisible, hasAnimated, value, onAnimated])

  return (
    <span
      className={`inline-block transition-transform duration-300 ${
        isAnimating ? 'scale-110 text-sunder-green' : 'scale-100'
      }`}
    >
      {displayValue}
    </span>
  )
}

/**
 * Desktop testimonial card with scroll-triggered stat animations.
 * Uses IntersectionObserver to animate stats when the card enters viewport.
 */
function DesktopTestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const cardRef = useRef<HTMLLIElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3, rootMargin: '0px 0px -50px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <li ref={cardRef}>
      <figure className="relative rounded-2xl bg-white p-6 shadow-sm ring-1 ring-lp-border-warm transition-all hover:shadow-[0_6px_24px_rgba(45,106,79,0.05)]">
        <blockquote className="relative">
          <p className="font-serif text-base tracking-tight text-foreground">
            &ldquo;{testimonial.content}&rdquo;
          </p>
        </blockquote>
        <div className="mt-4 flex justify-around border-t border-zinc-100 pt-4">
          {testimonial.stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-xl font-bold tracking-tight text-foreground">
                <AnimatedStat
                  value={stat.value}
                  isActive={true}
                  isVisible={isVisible}
                  hasAnimated={hasAnimated}
                  onAnimated={() => setHasAnimated(true)}
                />
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
        <figcaption className="mt-4 border-t border-zinc-100 pt-4">
          <div className="text-sm font-semibold text-foreground">
            {testimonial.author.name}
          </div>
          <div className="text-xs text-muted-foreground font-medium">
            {testimonial.author.role}
          </div>
        </figcaption>
      </figure>
    </li>
  )
}

const testimonials = [
  [
    {
      content:
        "I was losing leads because I couldn't follow up fast enough. Now Neo sends personalized follow-ups the moment a lead comes in and reminds me who to call. My conversion rate doubled in the first month.",
      stats: [
        { value: '2x', label: 'Conversion Rate' },
        { value: '0', label: 'Missed Leads' },
      ],
      author: {
        name: 'Rachel Ng',
        role: 'Senior Associate, PropNex Realty',
      },
    },
  ],
  [
    {
      content:
        "I used to spend 3 hours a day on paperwork — policy renewals, client updates, follow-up messages. Neo handles all of that now. I'm meeting 40% more clients every week instead of doing admin.",
      stats: [
        { value: '40%', label: 'More Client Meetings' },
        { value: '3', label: 'Hours Saved/Day' },
      ],
      author: {
        name: 'Marcus Loh',
        role: 'Senior Financial Advisor, AIA',
      },
    },
  ],
  [
    {
      content:
        "End-of-month used to mean 2 days buried in invoices and receipts. Neo processes everything, matches payments, and sends me a summary. I just review and approve.",
      stats: [
        { value: '2', label: 'Days Saved/Month' },
        { value: '90%', label: 'Faster Close' },
      ],
      author: {
        name: 'David Lim',
        role: 'Director, AutoPrime SG (8 employees)',
      },
    },
  ],
]

// Flatten for mobile carousel
const allTestimonials = testimonials.flat()

export function Testimonials() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()
  const { ref: cardsRef, isVisible: cardsVisible } = useScrollReveal<HTMLDivElement>({
    threshold: 0.05
  })

  // Track active carousel item for indicators
  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isDesktop) return
    const carousel = carouselRef.current
    if (!carousel) return

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft
      const cardWidth = carousel.offsetWidth * 0.85 + 16 // 85vw + gap
      const index = Math.round(scrollLeft / cardWidth)
      setActiveIndex(Math.min(index, allTestimonials.length - 1))
    }

    carousel.addEventListener('scroll', handleScroll, { passive: true })
    return () => carousel.removeEventListener('scroll', handleScroll)
  }, [isDesktop])

  return (
    <section
      id="testimonials"
      aria-label="What our customers are saying"
      className="bg-white py-24 sm:py-32"
    >
      <Container>
        <div
          ref={headerRef}
          className={`mx-auto max-w-2xl md:text-center scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-5xl">
            Loved by <span className="italic text-sunder-green">sales teams.</span>
          </h2>
          <p className="mt-6 text-lg tracking-tight text-muted-foreground">
            Join them, and boost sales and productivity by up to 300%.
          </p>
        </div>

        {/* Mobile carousel */}
        {!isDesktop ? (
          <div
            ref={cardsRef}
            className={`lg:hidden scroll-reveal ${cardsVisible ? 'is-visible' : ''}`}
          >
            <div ref={carouselRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-4 -mx-4 py-4 mt-12">
              {allTestimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className="snap-center shrink-0 w-[85vw] max-w-sm"
                >
                  <figure className="relative rounded-2xl bg-white p-6 shadow-md ring-1 ring-lp-border-warm min-h-[280px] flex flex-col">
                    <blockquote className="relative flex-1">
                      <p className="font-serif text-base tracking-tight text-foreground">
                        &ldquo;{testimonial.content}&rdquo;
                      </p>
                    </blockquote>
                    <div className="mt-4 flex justify-around border-t border-zinc-100 pt-4">
                      {testimonial.stats.map((stat) => (
                        <div key={stat.label} className="text-center">
                          <div className="text-xl font-bold tracking-tight text-foreground">
                            {stat.value}
                          </div>
                          <div className="text-xs font-medium text-muted-foreground">
                            {stat.label}
                          </div>
                        </div>
                      ))}
                    </div>
                    <figcaption className="mt-4 border-t border-zinc-100 pt-4">
                      <div className="text-sm font-semibold text-foreground">
                        {testimonial.author.name}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium">
                        {testimonial.author.role}
                      </div>
                    </figcaption>
                  </figure>
                </div>
              ))}
            </div>
            {/* Scroll indicators */}
            <div className="flex justify-center gap-1.5 mt-4">
              {allTestimonials.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === activeIndex
                      ? 'w-4 bg-sunder-green'
                      : 'w-1.5 bg-zinc-300'
                  }`}
                />
              ))}
            </div>
            <p className="text-center text-xs text-zinc-400 mt-2">
              Swipe to see more
            </p>
          </div>
        ) : null}

        {/* Desktop grid with animated stats */}
        {isDesktop ? (
          <ul
            role="list"
            className="hidden lg:grid mx-auto mt-16 max-w-2xl grid-cols-1 gap-6 sm:gap-8 lg:mt-20 lg:max-w-none lg:grid-cols-3"
          >
            {testimonials.map((column, colIdx) => (
              <li key={colIdx}>
                <ul role="list" className="flex flex-col gap-y-6 sm:gap-y-8">
                  {column.map((testimonial) => (
                    <DesktopTestimonialCard
                      key={testimonial.author.name}
                      testimonial={testimonial}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
      </Container>
    </section>
  )
}
