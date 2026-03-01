/**
 * Landing page header with desktop and mobile navigation.
 * Uses ShadCN Sheet for mobile nav drawer.
 */
 'use client'

import { useState, useEffect } from 'react'
import Link from "next/link";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetClose,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Logo } from '@/components/landing/Logo'
import { NavLink } from '@/components/landing/NavLink'

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  )
}

function MobileNavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  // For hash links, scroll to element without changing URL (preserves clean back navigation)
  if (href.startsWith('#')) {
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault()
      const id = href.slice(1)
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }

    return (
      <SheetClose asChild>
        <a href={href} onClick={handleClick} className="block w-full p-2 text-foreground">
          {children}
        </a>
      </SheetClose>
    )
  }

  return (
      <SheetClose asChild>
      <Link href={href} className="block w-full p-2 text-foreground">
        {children}
      </Link>
    </SheetClose>
  )
}

function MobileNavIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 overflow-visible stroke-muted-foreground"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path
        d="M0 1H14M0 7H14M0 13H14"
        className={`origin-center transition ${open ? 'scale-90 opacity-0' : ''}`}
      />
      <path
        d="M2 2L12 12M12 2L2 12"
        className={`origin-center transition ${!open ? 'scale-90 opacity-0' : ''}`}
      />
    </svg>
  )
}

function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        className="relative z-10 flex h-8 w-8 items-center justify-center focus:outline-none"
        aria-label="Toggle Navigation"
      >
        <MobileNavIcon open={isOpen} />
      </SheetTrigger>
      <SheetContent side="top" showCloseButton={false} className="rounded-b-2xl p-4">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SheetDescription className="sr-only">Main site navigation links</SheetDescription>
        <nav className="flex flex-col text-lg tracking-tight text-foreground">
          <MobileNavLink href="#features">Features</MobileNavLink>
          <MobileNavLink href="#testimonials">Testimonials</MobileNavLink>
          <MobileNavLink href="#pricing">Pricing</MobileNavLink>
          <hr className="m-2 border-border/40" />
          <MobileNavLink href="/login">Sign in</MobileNavLink>
        </nav>
      </SheetContent>
    </Sheet>
  )
}

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    let rafId = 0

    const updateScrollState = () => {
      rafId = 0
      const nextScrolled = window.scrollY > 50
      setIsScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled))
    }

    const handleScroll = () => {
      if (rafId !== 0) return
      rafId = window.requestAnimationFrame(updateScrollState)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId)
      }
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-0 py-0 sm:px-6 sm:py-3">
      {/* Outer wrapper — always centered, controls the width transition (desktop only) */}
      <div
        className={`mx-auto w-full transition-[max-width] duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
          isScrolled ? 'sm:max-w-xl md:max-w-2xl' : 'sm:max-w-4xl md:max-w-5xl'
        }`}
      >
        {/* Inner nav — handles visual treatment (bg, border, shadow) */}
        <nav
          className={`flex w-full items-center justify-between px-4 py-3 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] sm:rounded-full sm:px-6 sm:py-2.5 ${
            isScrolled
              ? 'border-b border-zinc-200/80 bg-[#F5EEE1]/90 backdrop-blur-xl sm:border sm:bg-[#F5EEE1]/85 sm:shadow-lg sm:shadow-zinc-900/[0.04] sm:ring-1 sm:ring-zinc-900/[0.06]'
              : 'bg-transparent'
          }`}
        >
          {/* Left group: Logo + nav links */}
          <div className="flex items-center gap-x-6 sm:gap-x-8">
            <Link href="/" aria-label="NeoBot Home" className="transition-opacity hover:opacity-80">
              <Logo className="h-6 w-auto sm:h-7" />
            </Link>

            {/* Desktop nav links */}
            <div className="hidden items-center gap-x-6 md:flex">
              <NavLink href="#features">Features</NavLink>
              <NavLink href="#testimonials">Testimonials</NavLink>
              <NavLink href="#pricing">Pricing</NavLink>
            </div>
          </div>

          {/* Right group: Sign in + CTA + hamburger */}
          <div className="flex items-center gap-x-3 sm:gap-x-4">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-zinc-600 transition hover:text-sunder-green md:block"
            >
              Sign in
            </Link>
            <a
              href="https://wa.me/6597990493?text=Hi!%20Interested%20in%20NeoBot%20for%20my%20business"
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-attention flex items-center justify-center gap-1.5 rounded-full bg-sunder-green px-2.5 py-2 text-sm font-medium text-white transition hover:scale-[1.02] active:scale-[0.98] sm:gap-2 sm:px-4 sm:py-1.5"
              aria-label="Chat with Neo"
            >
              <WhatsAppIcon />
              <span className="hidden sm:inline">Chat with Neo</span>
            </a>
            <div className="md:hidden">
              <MobileNavigation />
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
