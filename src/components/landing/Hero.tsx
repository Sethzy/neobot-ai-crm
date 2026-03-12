/**
 * Hero section with headline, CTA button, and promo video.
 */
import Link from "next/link";
import { Container } from '@/components/landing/Container'
import { HeroIdentityAnimation } from '@/components/landing/HeroIdentityAnimation'
import { PromoVideo } from '@/components/landing/PromoVideo'

export function Hero() {
  return (
    <div className="relative overflow-hidden bg-[#F7F4ED] pt-28 pb-0 sm:pt-36">
      <Container className="relative">
        <div className="flex flex-col items-center text-center">
          <HeroIdentityAnimation className="mb-8 sm:mb-10" />

          <h1 className="max-w-[13ch] px-2 font-sans text-[clamp(3.1rem,9vw,5.75rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-lp-dark sm:px-0">
            <span className="sm:hidden">Acts before you ask.</span>
            <span className="hidden sm:inline">Your AI rep acts before you ask.</span>
            <span className="block text-sunder-green">Work already done.</span>
          </h1>

          <p className="mt-6 max-w-[36rem] px-4 text-[1.02rem] leading-[1.45] text-[#766E66] sm:max-w-[38rem] sm:px-0 sm:text-[1.15rem]">
            Runs your pipeline while you sleep. Review, approve, done.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-4 sm:mt-10">
            <Link
              href="/register"
              className="press-effect rounded-full bg-sunder-green px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-sunder-green/30 transition hover:shadow-sunder-green/45 hover:scale-[1.02] active:scale-[0.98] sm:px-12 sm:py-4.5 sm:text-base"
            >
              Try for free
            </Link>
          </div>
          <p className="mt-4 text-sm text-[#7A6D63]">No setup needed &bull; Your AI assistant, running 24/7</p>

          {/* Promo video - scales with hero width */}
          <div className="mt-16 w-full pb-16 sm:mt-20 sm:pb-24 lg:mt-24">
            <PromoVideo />
          </div>
        </div>
      </Container>
    </div>
  )
}
