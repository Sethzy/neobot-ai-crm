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
        className="relative z-10 flex h-11 w-11 items-center justify-center focus:outline-none"
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
              ? 'border-b border-lp-border bg-lp-panel/95 sm:border sm:bg-lp-panel sm:shadow-sm'
              : 'bg-transparent'
          }`}
        >
          {/* Left group: Logo + nav links */}
          <div className="flex items-center gap-x-6 sm:gap-x-8">
            <Link href="/" aria-label="NeoBot home" className="transition-opacity hover:opacity-80">
              <Logo className="h-6 w-auto sm:h-7" />
            </Link>

            {/* Desktop nav links */}
            <div className="hidden items-center gap-x-6 md:flex">
              <NavLink href="#features">Features</NavLink>
              <NavLink href="#testimonials">Testimonials</NavLink>
              <NavLink href="#pricing">Pricing</NavLink>
            </div>
          </div>

          {/* Right group: Sign in + hamburger */}
          <div className="flex items-center gap-x-3 sm:gap-x-4">
            <Link
              href="/login"
              className="hidden rounded-full bg-sunder-green px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 md:block"
            >
              Sign in
            </Link>
            <div className="md:hidden">
              <MobileNavigation />
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
