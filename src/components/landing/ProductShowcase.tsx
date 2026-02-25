'use client';

/**
 * ProductShowcase section with document sorting animation:
 * - Desktop (lg+): Two-column layout with DocumentSplitAnimation
 * - Mobile/Tablet: Centered header + WhatsApp phone mockup
 */
import { Container } from '@/components/landing/Container'
import { DocumentSplitAnimation } from '@/components/landing/DocumentSplitAnimation'
import { WhatsAppPhoneMockup } from '@/components/landing/WhatsAppPhoneMockup'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useScrollReveal } from '@/hooks/useScrollReveal'

export function ProductShowcase() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { ref: headerRef, isVisible: headerVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <section
      id="product-showcase"
      aria-label="Product demonstration"
      className="py-12 sm:py-16 md:py-28 bg-white"
    >
      {/* Mobile/Tablet: Centered header + WhatsApp phone mockup */}
      {!isDesktop ? (
        <div className="lg:hidden">
          <Container>
            <div
              ref={headerRef}
              className={`mx-auto max-w-2xl text-center scroll-reveal ${headerVisible ? 'is-visible' : ''}`}
            >
              <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl text-gray-900 leading-tight tracking-tight">
                Your second brain,
                <br />
                <span className="italic text-sunder-green">one message away.</span>
              </h2>
              <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
                Assign tasks before bed. Wake up to completed work. Your AI employee works overnight — all from one app.
              </p>
            </div>
          </Container>

          <div className="mt-12 flex justify-center">
            <WhatsAppPhoneMockup isVisible />
          </div>
        </div>
      ) : null}

      {/* Desktop: Two-column grid */}
      {isDesktop ? (
        <Container className="hidden lg:block">
          <div className="grid grid-cols-12 gap-8 items-center">
            {/* Text — left column */}
            <div className="col-span-5">
              <h2 className="font-serif text-4xl lg:text-5xl text-gray-900 leading-tight tracking-tight">
                Your second brain,
                <br />
                <span className="italic text-sunder-green">one message away.</span>
              </h2>
              <p className="mt-4 text-base lg:text-lg text-muted-foreground leading-relaxed">
                Assign tasks before bed. Wake up to completed work. Your AI employee works overnight — all from one app.
              </p>
            </div>

            {/* Document animation — right column */}
            <div className="col-span-7">
              <DocumentSplitAnimation />
            </div>
          </div>
        </Container>
      ) : null}
    </section>
  )
}
