'use client';

/**
 * Testimonials section — dark rounded container with marquee-scrolling cards
 * and 2 green featured cards. Whisper Flow-inspired layout.
 */
import Image from 'next/image'
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
      'Neo follows up with my leads way faster than I ever could. I closed two deals last month that I definitely would have forgotten about.',
    author: { name: 'Rachel Ng', role: 'Senior Associate, PropNex Realty', avatar: '/images/avatar-rachel-ng.webp' },
  },
  {
    content:
      "I just forward everything to Neo and it handles the rest. Filing, tracking, follow-ups — I barely touch admin anymore which is great.",
    author: { name: 'Priya Sharma', role: 'Independent Insurance Broker', avatar: '/images/avatar-priya-sharma.webp' },
  },
  {
    content:
      "The morning brief is honestly my favourite part. I check WhatsApp at 7am and already know exactly what I need to do that day.",
    author: { name: 'David Lim', role: 'Director, AutoPrime SG', avatar: '/images/avatar-david-lim.webp' },
  },
  {
    content:
      "Was skeptical at first but two weeks in I couldn't go back. It just does so much of the boring stuff for you.",
    author: { name: 'Marcus Loh', role: 'Senior Financial Advisor, AIA', avatar: '/images/avatar-marcus-loh.webp' },
  },
  {
    content:
      "I manage way more clients now than I used to and I don't feel overwhelmed. Neo remembers all the details so I don't have to.",
    author: { name: 'Sarah Tan', role: 'Property Agent, ERA', avatar: '/images/avatar-sarah-tan.webp' },
  },
  {
    content:
      "I send voice notes after meetings and by the time I get home Neo's already updated everything and scheduled the follow-ups. Super useful.",
    author: { name: 'James Wong', role: 'Financial Consultant, Prudential', avatar: '/images/avatar-james-wong.webp' },
  },
  {
    content:
      "Basically stopped doing admin entirely last quarter and my numbers actually went up. Wish I'd found this earlier tbh.",
    author: { name: 'Wei Lin Chen', role: 'Senior Advisor, Great Eastern', avatar: '/images/avatar-wei-lin-chen.webp' },
  },
  {
    content:
      "My clients think I have a whole team behind me but it's literally just me and Neo. The response time alone makes a huge difference.",
    author: { name: 'Aisha Rahman', role: 'Real Estate Negotiator, Knight Frank', avatar: '/images/avatar-aisha-rahman.webp' },
  },
]

const featuredTestimonials: FeaturedTestimonial[] = [
  {
    stat: '2x conversion rate',
    tagline: 'I stopped losing leads to slow follow-ups. That alone changed everything.',
    author: { name: 'Rachel Ng', role: 'Senior Associate, PropNex Realty', avatar: '/images/avatar-rachel-ng.webp' },
  },
  {
    stat: '3 hours saved/day',
    tagline: "I actually spend my time with clients now instead of doing paperwork.",
    author: { name: 'Marcus Loh', role: 'Senior Financial Advisor, AIA', avatar: '/images/avatar-marcus-loh.webp' },
  },
]

/* ------------------------------------------------------------------ */
/*  Marquee card                                                       */
/* ------------------------------------------------------------------ */

function MarqueeCard({ testimonial }: { testimonial: MarqueeTestimonial }) {
  return (
    <figure className="w-[300px] shrink-0 rounded-2xl bg-parchment px-7 pt-8 pb-7 flex flex-col justify-end gap-4 text-center">
      <blockquote>
        <p className="text-base leading-relaxed text-lp-dark">
          {testimonial.content}
        </p>
      </blockquote>
      <figcaption className="flex items-center justify-center gap-2.5 text-sm">
        <Image
          src={testimonial.author.avatar}
          alt={testimonial.author.name}
          width={32}
          height={32}
          className="h-8 w-8 rounded-full object-cover"
        />
        <div className="text-left">
          <span className="font-semibold text-lp-dark">{testimonial.author.name}</span>
          <p className="text-xs text-[#6B6B6B]">{testimonial.author.role}</p>
        </div>
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
      <h3 className="font-serif text-3xl tracking-tight sm:text-4xl pr-10">
        {testimonial.stat}
      </h3>
      <p className="mt-2 text-base text-white/80">
        {testimonial.tagline}
      </p>
      <figcaption className="mt-auto pt-8 flex items-center gap-3">
        <Image
          src={testimonial.author.avatar}
          alt={testimonial.author.name}
          width={40}
          height={40}
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
    <div className="bg-parchment">
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
      <div className="group/marquee mt-0" role="region" aria-label="Customer testimonials">
        <div className="flex items-end gap-[6px] animate-marquee-slower group-hover/marquee:[animation-play-state:paused]" style={{ width: 'max-content' }}>
          {marqueeTestimonials.map((t, i) => (
            <MarqueeCard key={`orig-${t.author.name}-${i}`} testimonial={t} />
          ))}
          {/* Duplicate for infinite scroll — hidden from screen readers */}
          {marqueeTestimonials.map((t, i) => (
            <div key={`dup-${t.author.name}-${i}`} aria-hidden="true">
              <MarqueeCard testimonial={t} />
            </div>
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
