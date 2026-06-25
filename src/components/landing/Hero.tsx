/**
 * Hero section with headline, CTA button, and promo video.
 */
import Link from "next/link";
import { Container } from '@/components/landing/Container'
import { HeroIdentityAnimationShell } from '@/components/landing/HeroIdentityAnimationShell'
import { PromoVideo } from '@/components/landing/PromoVideo'

export function Hero() {
  return (
    <div
      className="relative overflow-hidden bg-lp-canvas pt-32 pb-0 sm:pt-44"
    >
      <Container className="relative">
        <div className="flex flex-col items-center text-center">
          <HeroIdentityAnimationShell className="mb-8 sm:mb-10" />

          <h1 className="max-w-4xl px-2 font-serif text-balance text-5xl font-medium leading-[0.92] tracking-[-0.035em] text-lp-dark sm:px-0 sm:text-6xl md:text-7xl">
            <span className="sm:hidden">Acts before you ask.<br /></span>
            <span className="hidden sm:inline">Your AI rep acts before you ask.{' '}</span>
            <br className="hidden sm:inline" />
            <span className="text-lp-ink-muted">Work already done.</span>
          </h1>

          <p className="measure-copy mt-5 max-w-lg px-2 text-body text-lp-dark/80 sm:mt-6 sm:max-w-2xl sm:px-0 sm:text-subhead">
            Runs your pipeline while you sleep. No setup needed — always on, 24/7.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-4 sm:mt-10">
            <Link
              href="/register"
              className="press-effect rounded-full bg-lp-black px-8 py-3 text-sm font-semibold text-lp-cream shadow-sm transition hover:scale-[1.02] hover:bg-lp-lavender hover:text-lp-ink active:scale-[0.98] sm:px-10 sm:py-3.5 sm:text-base"
            >
              Try for free
            </Link>
          </div>

          {/* Promo video - scales with hero width */}
          <div className="mt-16 w-full pb-16 sm:mt-20 sm:pb-24 lg:mt-24">
            <PromoVideo />
          </div>
        </div>
      </Container>
    </div>
  )
}
