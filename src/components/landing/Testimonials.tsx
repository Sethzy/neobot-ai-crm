'use client';

/**
 * Testimonials section — dark rounded container with marquee-scrolling cards
 * and 2 green featured cards. Whisper Flow-inspired layout.
 */
import { ArrowUpRight } from 'lucide-react'
import { useScrollReveal, useStaggeredReveal } from '@/hooks/useScrollReveal'

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface MarqueeTestimonial {
  content: string
  author: { name: string; role: string; avatar: string }
}

interface FeaturedTestimonial {
  stat: string
  tagline: string
  author: { name: string; role: string; avatar: string }
}

const marqueeTestimonials: MarqueeTestimonial[] = [
  {
    content:
      'Neo follows up with my leads within seconds. I close deals I used to lose.',
    author: { name: 'Rachel Ng', role: 'Senior Associate, PropNex Realty', avatar: '/images/avatar-rachel-ng.webp' },
  },
  {
    content:
      "I used to spend 3 hours a day on paperwork. Neo handles all of that now. I'm meeting 40% more clients every week instead of doing admin.",
    author: { name: 'Priya Sharma', role: 'Independent Insurance Broker', avatar: '/images/avatar-rachel-ng.webp' },
  },
  {
    content:
      "The morning brief changed everything. I wake up knowing exactly who to call, what's overdue, and where my pipeline stands. No more scrambling.",
    author: { name: 'David Lim', role: 'Director, AutoPrime SG', avatar: '/images/avatar-marcus-loh.webp' },
  },
  {
    content:
      "Can't live without it.",
    author: { name: 'Marcus Loh', role: 'Senior Financial Advisor, AIA', avatar: '/images/avatar-marcus-loh.webp' },
  },
  {
    content:
      "I handle 3x the clients I used to — all by myself. Neo remembers every conversation and every deadline so I don't have to.",
    author: { name: 'Sarah Tan', role: 'Property Agent, ERA', avatar: '/images/avatar-rachel-ng.webp' },
  },
  {
    content:
      "Best AI product I've used since ChatGPT.",
    author: { name: 'James Wong', role: 'Financial Consultant, Prudential', avatar: '/images/avatar-marcus-loh.webp' },
  },
  {
    content:
      'My admin time went from 3 hours a day to 20 minutes. The rest is client-facing work. My income went up 40% in two months.',
    author: { name: 'Wei Lin Chen', role: 'Senior Advisor, Great Eastern', avatar: '/images/avatar-marcus-loh.webp' },
  },
  {
    content:
      "It's like having an assistant who never sleeps, never forgets, and works entirely through WhatsApp. I can't imagine going back.",
    author: { name: 'Aisha Rahman', role: 'Real Estate Negotiator, Knight Frank', avatar: '/images/avatar-rachel-ng.webp' },
  },
]

const featuredTestimonials: FeaturedTestimonial[] = [
  {
    stat: '2x conversion rate',
    tagline: 'The "never miss a lead" assistant.',
    author: { name: 'Rachel Ng', role: 'Senior Associate, PropNex Realty', avatar: '/images/avatar-rachel-ng.webp' },
  },
  {
    stat: '3 hours saved/day',
    tagline: "Before Neo, admin was my second job. Now it's handled.",
    author: { name: 'Marcus Loh', role: 'Senior Financial Advisor, AIA', avatar: '/images/avatar-marcus-loh.webp' },
  },
]

/* ------------------------------------------------------------------ */
/*  Marquee card                                                       */
/* ------------------------------------------------------------------ */

function MarqueeCard({ testimonial }: { testimonial: MarqueeTestimonial }) {
  return (
    <figure className="w-[300px] shrink-0 rounded-2xl bg-[#F5EEE1] px-7 pt-8 pb-7 flex flex-col justify-end gap-4 text-center">
      <blockquote>
        <p className="text-base leading-relaxed text-[#1A1A1A]">
          {testimonial.content}
        </p>
      </blockquote>
      <figcaption className="text-sm">
        <span className="font-semibold text-[#1A1A1A]">{testimonial.author.name}</span>
        <span className="text-[#6B6B6B]">, {testimonial.author.role}</span>
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/*  Featured card                                                      */
/* ------------------------------------------------------------------ */

function FeaturedCard({ testimonial }: { testimonial: FeaturedTestimonial }) {
  return (
    <figure className="relative flex-1 rounded-2xl bg-sunder-green px-8 pt-6 pb-6 sm:px-10 sm:pt-7 sm:pb-7 text-white flex flex-col">
      <ArrowUpRight className="absolute top-6 right-6 h-7 w-7 text-white/50 sm:top-7 sm:right-8" />
      <h3 className="font-serif text-3xl tracking-tight sm:text-4xl pr-10 whitespace-nowrap">
        {testimonial.stat}
      </h3>
      <p className="mt-2 text-base text-white/80">
        {testimonial.tagline}
      </p>
      <figcaption className="mt-auto pt-8 flex items-center gap-3">
        <img
          src={testimonial.author.avatar}
          alt={testimonial.author.name}
          className="h-10 w-10 rounded-full object-cover"
        />
        <div className="text-sm">
          <div className="font-semibold text-white">{testimonial.author.name}</div>
          <div className="text-white/70">{testimonial.author.role}</div>
        </div>
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/*  Section                                                            */
/* ------------------------------------------------------------------ */

export function Testimonials() {
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()
  const { ref: featuredRef, isVisible: featuredVisible } = useStaggeredReveal<HTMLDivElement>()

  return (
    <div style={{ backgroundColor: '#F5EEE1' }}>
    <section
      id="testimonials"
      aria-label="What our customers are saying"
      className="relative rounded-t-[2rem] rounded-b-[2rem] sm:rounded-t-[5rem] sm:rounded-b-[5rem] pt-16 pb-10 sm:pt-24 sm:pb-14 overflow-x-clip"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      {/* Header */}
      <div
        ref={headerRef}
        className={`relative mx-auto max-w-3xl text-center px-6 pb-12 sm:pb-16 scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
      >
        <h2 className="relative font-serif text-4xl tracking-tight text-[#F5EEE1] sm:text-5xl lg:text-6xl" style={{ transform: 'rotate(-4deg)' }}>
          Kind words
          <br />
          <span className="italic text-[#F5EEE1]/70">from our users.</span>
        </h2>
      </div>

      {/* Marquee */}
      <div className="mt-0">
        <div className="flex items-end gap-[6px] animate-marquee-slower" style={{ width: 'max-content' }}>
          {[...marqueeTestimonials, ...marqueeTestimonials].map((t, i) => (
            <MarqueeCard key={i} testimonial={t} />
          ))}
        </div>
      </div>

      {/* Featured cards */}
      <div
        ref={featuredRef}
        className={`mx-auto mt-8 max-w-5xl px-6 flex flex-col gap-3 sm:flex-row sm:mt-10 stagger-children ${featuredVisible ? 'is-visible' : ''}`}
      >
        {featuredTestimonials.map((t) => (
          <FeaturedCard key={t.stat} testimonial={t} />
        ))}
      </div>
    </section>
    </div>
  )
}
