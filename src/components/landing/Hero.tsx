/**
 * Hero section with headline, CTA button, and promo video.
 */
import Link from "next/link";
import { Container } from '@/components/landing/Container'
import { PromoVideo } from '@/components/landing/PromoVideo'

export function Hero() {
  return (
    <div
      className="relative overflow-hidden pt-28 pb-0 sm:pt-36 bg-[#FAF7F2]"
    >
      {/* Watercolor cloud texture — masked Unsplash image (same technique as Tailark) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[680px] opacity-[0.82]"
        style={{
          maskImage: 'radial-gradient(ellipse 100% 70% at 50% 25%, black 20%, rgba(0,0,0,0.5) 38%, transparent 58%)',
          WebkitMaskImage: 'radial-gradient(ellipse 100% 70% at 50% 25%, black 20%, rgba(0,0,0,0.5) 38%, transparent 58%)',
          background: 'radial-gradient(ellipse 80% 50% at 50% 18%, rgba(210, 202, 186, 0.5), rgba(250, 247, 242, 0.35) 60%, transparent 100%)',
        }}
      >
        <img
          src="/exports/hero-watercolor.webp"
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          className="size-full object-cover object-top"
        />
      </div>

      <Container className="relative">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2.5 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#2A1F17] ring-1 ring-black/[0.14] mb-5 sm:px-6 sm:py-2 sm:text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sunder-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sunder-green"></span>
            </span>
            The cheat code for B2C sales
          </div>

          {/* Headline with soft green glow behind it */}
          <div className="relative">
            <div
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background: 'radial-gradient(ellipse 600px 250px at 50% 50%, rgba(45, 106, 79, 0.07), transparent)',
                filter: 'blur(40px)',
              }}
            />
            <h1 className="font-serif text-[9.5vw] font-semibold leading-[1.15] tracking-[-0.035em] text-[#2A1F17] sm:text-5xl md:text-[3.5rem] lg:text-6xl">
              <span className="sm:hidden">Acts before you ask.<br /></span>
              <span className="hidden sm:inline">Your AI rep acts before you ask.{' '}</span>
              <br className="hidden sm:inline" />
              <em className="text-sunder-green">Work already done.</em>
            </h1>
          </div>

          <p className="mt-6 max-w-xl text-base leading-7 text-[#6B5E54] px-2 sm:mt-6 sm:max-w-2xl sm:text-lg sm:leading-8 sm:px-0">
            Runs your pipeline while you sleep. Review, approve, done.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-4 sm:mt-10">
            <Link
              href="/demo"
              className="press-effect rounded-full bg-sunder-green px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-sunder-green/25 transition hover:shadow-sunder-green/35 hover:scale-[1.02] active:scale-[0.98] sm:px-10 sm:py-4 sm:text-base"
            >
              Try for free
            </Link>
          </div>
          <p className="mt-4 text-sm text-[#9C8E82]">No setup headaches &bull; AI assistants running 24/7</p>

          {/* Promo video - scales with hero width */}
          <div className="mt-16 w-full pb-16 sm:mt-20 sm:pb-24 lg:mt-24">
            <PromoVideo />
          </div>
        </div>
      </Container>
    </div>
  )
}
