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
    author: { name: 'Rachel Ng', role: 'Senior Associate, PropNex Realty', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&crop=face' },
  },
  {
    content:
      "I used to spend 3 hours a day on paperwork. Neo handles all of that now. I'm meeting 40% more clients every week instead of doing admin.",
    author: { name: 'Priya Sharma', role: 'Independent Insurance Broker', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=face' },
  },
  {
    content:
      "The morning brief changed everything. I wake up knowing exactly who to call, what's overdue, and where my pipeline stands. No more scrambling.",
    author: { name: 'David Lim', role: 'Director, AutoPrime SG', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face' },
  },
  {
    content:
      "Can't live without it.",
    author: { name: 'Marcus Loh', role: 'Senior Financial Advisor, AIA', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&h=80&fit=crop&crop=face' },
  },
  {
    content:
      "I handle 3x the clients I used to — all by myself. Neo remembers every conversation and every deadline so I don't have to.",
    author: { name: 'Sarah Tan', role: 'Property Agent, ERA', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&crop=face' },
  },
  {
    content:
      "Best AI product I've used since ChatGPT.",
    author: { name: 'James Wong', role: 'Financial Consultant, Prudential', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face' },
  },
  {
    content:
      'My admin time went from 3 hours a day to 20 minutes. The rest is client-facing work. My income went up 40% in two months.',
    author: { name: 'Wei Lin Chen', role: 'Senior Advisor, Great Eastern', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&h=80&fit=crop&crop=face' },
  },
  {
    content:
      "It's like having an assistant who never sleeps, never forgets, and works entirely through WhatsApp. I can't imagine going back.",
    author: { name: 'Aisha Rahman', role: 'Real Estate Negotiator, Knight Frank', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face' },
  },
]

const featuredTestimonials: FeaturedTestimonial[] = [
  {
    stat: '2x conversion rate',
    tagline: 'The "never miss a lead" assistant.',
    author: { name: 'Rachel Ng', role: 'Senior Associate, PropNex Realty', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&crop=face' },
  },
  {
    stat: '3 hours saved/day',
    tagline: "Before Neo, admin was my second job. Now it's handled.",
    author: { name: 'Marcus Loh', role: 'Senior Financial Advisor, AIA', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&h=80&fit=crop&crop=face' },
  },
]

/* ------------------------------------------------------------------ */
/*  Marquee card                                                       */
/* ------------------------------------------------------------------ */

function MarqueeCard({ testimonial }: { testimonial: MarqueeTestimonial }) {
  return (
    <figure className="w-[300px] shrink-0 rounded-2xl bg-[#FAF7F2] px-7 pt-8 pb-7 flex flex-col justify-end gap-4 text-center">
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
    <div style={{ backgroundColor: '#FAF7F2' }}>
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
        <h2 className="relative font-serif text-4xl tracking-tight text-[#FAF7F2] sm:text-5xl lg:text-6xl" style={{ transform: 'rotate(-4deg)' }}>
          Kind words
          <br />
          <span className="italic text-[#FAF7F2]/70">from our users.</span>
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
