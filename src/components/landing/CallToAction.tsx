'use client';

/**
 * Call-to-action section with paper texture background.
 */
import { Button } from '@/components/landing/Button'
import { Container } from '@/components/landing/Container'
import { useScrollReveal } from '@/hooks/useScrollReveal'

export function CallToAction() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <section
      id="get-started-today"
      className="relative overflow-hidden py-20 sm:py-24 md:py-32"
      style={{ background: 'radial-gradient(ellipse 160% 140% at 50% 30%, #0A2818 0%, #040F08 100%)' }}
    >
      <div className="lp-cta-glow absolute inset-0" />

      <Container className="relative z-10">
        <div
          ref={ref}
          className={`mx-auto max-w-lg text-center scroll-reveal ${isVisible ? 'is-visible' : ''}`}
        >
          <h2 className="font-serif text-2xl tracking-tight text-white sm:text-3xl md:text-4xl">
            Everything you'd expect from a great <span className="italic">employee.</span>
          </h2>
          <p className="mt-4 text-base tracking-tight text-lp-green-muted sm:mt-6 sm:text-lg">
            Join thousands of professionals who let AI run their work. 7 days free. Set up in 60 seconds. Get 2 hours back every day.
          </p>
          <Button
            href="/demo"
            className="press-effect mt-8 rounded-full bg-[#FAF7F2] px-8 py-3.5 text-sm font-semibold text-sunder-green-dark transition hover:bg-white shadow-xl shadow-black/10 sm:mt-10 sm:px-10 sm:py-4"
          >
            Try for free
          </Button>
        </div>
      </Container>
    </section>
  )
}
