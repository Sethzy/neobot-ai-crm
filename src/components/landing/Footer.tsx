import Link from "next/link";
import { Container } from '@/components/landing/Container'
import { AppIcon } from '@/components/icons/app-icons'
import { Logo } from '@/components/landing/Logo'
import { NavLink } from '@/components/landing/NavLink'
import { siteBrand } from '@/lib/branding/site'

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-lp-canvas py-24">
      <Container className="relative z-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* Brand & Contact */}
          <div className="space-y-6">
            <Link href="/" aria-label="Home" className="group inline-block transition-transform hover:scale-105">
              <Logo />
            </Link>
            <p className="text-sm text-lp-ink-muted">
              The advisory sales autopilot, one message away.
            </p>
            <div className="space-y-3 text-sm text-lp-ink-muted">
              <a
                href="https://maps.google.com/?q=109+North+Bridge+Road+Funan+Singapore+179097"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 transition-colors hover:text-lp-ink"
              >
                <AppIcon name="mapPin" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>109 North Bridge Road, Funan,<br />Singapore 179097</span>
              </a>
              <a
                href={`mailto:${siteBrand.supportEmail}`}
                className="flex items-center gap-3 transition-colors hover:text-lp-ink"
              >
                <AppIcon name="email" className="h-4 w-4 shrink-0" />
                <span>{siteBrand.supportEmail}</span>
              </a>
              <a
                href="https://wa.me/6597990493"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 transition-colors hover:text-lp-ink"
              >
                <AppIcon name="phone" className="h-4 w-4 shrink-0" />
                <span>+65 9799 0493</span>
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div className="lg:col-span-2 flex flex-col lg:flex-row lg:justify-end gap-8 lg:gap-12 lg:pt-2">
            <div>
              <h3 className="mb-4 text-sm font-semibold tracking-wide text-lp-ink">Plans</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <NavLink href="#pricing" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Pro</NavLink>
                <NavLink href="#pricing" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Teams</NavLink>
                <NavLink href="#pricing" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Talk to Sales</NavLink>
              </nav>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold tracking-wide text-lp-ink">Product</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <NavLink href="#features" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Features</NavLink>
                <NavLink href="#pricing" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Pricing</NavLink>
                <NavLink href="#faq" className="text-lp-ink-muted transition-colors hover:text-lp-ink">FAQ</NavLink>
              </nav>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold tracking-wide text-lp-ink">Company</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <NavLink href="#testimonials" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Testimonials</NavLink>
                <Link href="/login" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Book a Call</Link>
              </nav>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold tracking-wide text-lp-ink">Market Data</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <Link href="/market/agents" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Agent Profiles</Link>
                <Link href="/market/properties" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Private Properties</Link>
                <Link href="/market/hdb" className="text-lp-ink-muted transition-colors hover:text-lp-ink">HDB Resale</Link>
                <Link href="/market/agencies" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Agencies</Link>
                <Link href="/market/areas" className="text-lp-ink-muted transition-colors hover:text-lp-ink">Areas</Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-lp-border pt-8 text-center text-sm text-lp-ink-muted">
          <p>
            &copy; {new Date().getFullYear()} {siteBrand.name}. All rights reserved.
          </p>
          <p className="mt-2 text-xs text-lp-ink-muted">
            Built by University of Cambridge &amp; Airwallex alumni
          </p>
        </div>
      </Container>
    </footer>
  )
}
