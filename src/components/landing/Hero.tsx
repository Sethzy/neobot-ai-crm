/**
 * Hero section with headline, CTA button, and promo video.
 */
import Link from "next/link";
import { Container } from '@/components/landing/Container'
import { HeroIdentityAnimation } from '@/components/landing/HeroIdentityAnimation'
import { PromoVideo } from '@/components/landing/PromoVideo'

export function Hero() {
  return (
    <div
      className="relative overflow-hidden bg-parchment pt-32 pb-0 sm:pt-44"
    >
      <Container className="relative">
        <div className="flex flex-col items-center text-center">
          <HeroIdentityAnimation className="mb-8 sm:mb-10" />

          <h1 className="font-serif text-[6vw] font-normal leading-[1.25] tracking-[-0.02em] text-lp-dark sm:text-[2rem] md:text-[2.25rem] lg:text-[2.5rem]">
            <span className="sm:hidden">Acts before you ask.<br /></span>
            <span className="hidden sm:inline">Your AI rep acts before you ask.{' '}</span>
            <br className="hidden sm:inline" />
            <em className="text-sunder-green">Work already done.</em>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-7 text-lp-muted px-2 sm:mt-6 sm:max-w-2xl sm:text-xl sm:leading-9 sm:px-0">
            Runs your pipeline while you sleep. No setup needed — always on, 24/7.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-4 sm:mt-10">
            <Link
              href="/register"
              className="press-effect rounded-full bg-sunder-green px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-sunder-green/20 transition hover:shadow-sunder-green/35 hover:scale-[1.02] active:scale-[0.98] sm:px-10 sm:py-3.5 sm:text-base"
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
