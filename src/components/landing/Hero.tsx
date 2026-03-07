/**
 * Hero section with headline, CTA button, and promo video.
 */
import Link from "next/link";
import Image from "next/image";
import { Container } from '@/components/landing/Container'
import { PromoVideo } from '@/components/landing/PromoVideo'

export function Hero() {
  return (
    <div
      className="relative overflow-hidden pt-28 pb-0 sm:pt-36"
      style={{
        background: 'linear-gradient(180deg, #EDE4D3 0%, #F5EEE1 35%, #F5EEE1 100%)',
      }}
    >
      {/* Watercolor cloud texture — single image, responsive mask via CSS */}
      <div
        className="hero-watercolor pointer-events-none absolute inset-x-0 top-0 h-[780px]"
        style={{
          background: 'radial-gradient(ellipse 90% 60% at 50% 16%, rgba(195, 182, 160, 0.6), rgba(235, 225, 205, 0.4) 55%, transparent 100%)',
        }}
      >
        <Image
          src="/exports/hero-watercolor.webp"
          alt=""
          aria-hidden
          priority
          unoptimized
          fetchPriority="high"
          decoding="sync"
          fill
          sizes="100vw"
          className="object-cover object-top"
        />
      </div>

      <Container className="relative">
        <div className="flex flex-col items-center text-center">
          {/* Badge — gold accent dot + shimmer sweep */}
          <div className="badge-shimmer inline-flex items-center gap-2.5 rounded-full bg-parchment/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-lp-dark ring-1 ring-lp-gold/40 shadow-sm shadow-lp-gold/10 mb-5 sm:px-6 sm:py-2 sm:text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lp-gold opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lp-gold"></span>
            </span>
            The cheat code for top producers
          </div>

          {/* Headline with soft green glow behind it */}
          <div className="relative">
            <div
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background: 'radial-gradient(ellipse 700px 300px at 50% 55%, rgba(45, 106, 79, 0.13), transparent)',
                filter: 'blur(50px)',
              }}
            />
            <h1 className="font-serif text-[9.5vw] font-semibold leading-[1.15] tracking-[-0.035em] text-lp-dark sm:text-5xl md:text-[3.5rem] lg:text-6xl">
              <span className="sm:hidden">Acts before you ask.<br /></span>
              <span className="hidden sm:inline">Your AI rep acts before you ask.{' '}</span>
              <br className="hidden sm:inline" />
              <em className="text-sunder-green" style={{ textShadow: '0 2px 30px rgba(2, 79, 70, 0.15)' }}>Work already done.</em>
            </h1>
          </div>

          <p className="mt-6 max-w-xl text-base leading-7 text-lp-muted px-2 sm:mt-6 sm:max-w-2xl sm:text-lg sm:leading-8 sm:px-0">
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
