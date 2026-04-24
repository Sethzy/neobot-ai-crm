import Link from "next/link";
import { Container } from '@/components/landing/Container'
import { AppIcon } from '@/components/icons/app-icons'
import { Logo } from '@/components/landing/Logo'
import { NavLink } from '@/components/landing/NavLink'
import { siteBrand } from '@/lib/branding/site'

export function Footer() {
  return (
    <footer className="relative py-24 overflow-hidden bg-[#1A1A1A]">
      <Container className="relative z-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* Brand & Contact */}
          <div className="space-y-6">
            <Link href="/" aria-label="Home" className="group inline-block transition-transform hover:scale-105">
              <Logo className="text-white" iconClassName="text-white" />
            </Link>
            <p className="text-sm text-[#999]">
              The advisory sales autopilot, one message away.
            </p>
            <div className="space-y-3 text-sm text-[#999]">
              <a
                href="https://maps.google.com/?q=109+North+Bridge+Road+Funan+Singapore+179097"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 hover:text-white transition-colors"
              >
                <AppIcon name="mapPin" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>109 North Bridge Road, Funan,<br />Singapore 179097</span>
              </a>
              <a
                href={`mailto:${siteBrand.supportEmail}`}
                className="flex items-center gap-3 hover:text-white transition-colors"
              >
                <AppIcon name="email" className="h-4 w-4 shrink-0" />
                <span>{siteBrand.supportEmail}</span>
              </a>
              <a
                href="https://wa.me/6597990493"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:text-white transition-colors"
              >
                <AppIcon name="phone" className="h-4 w-4 shrink-0" />
                <span>+65 9799 0493</span>
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div className="lg:col-span-2 flex flex-col lg:flex-row lg:justify-end gap-8 lg:gap-12 lg:pt-2">
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 tracking-wide">Plans</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <NavLink href="#pricing" className="text-[#999] hover:text-white transition-colors">Pro</NavLink>
                <NavLink href="#pricing" className="text-[#999] hover:text-white transition-colors">Teams</NavLink>
                <NavLink href="#pricing" className="text-[#999] hover:text-white transition-colors">Talk to Sales</NavLink>
              </nav>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 tracking-wide">Product</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <NavLink href="#features" className="text-[#999] hover:text-white transition-colors">Features</NavLink>
                <NavLink href="#pricing" className="text-[#999] hover:text-white transition-colors">Pricing</NavLink>
                <NavLink href="#faq" className="text-[#999] hover:text-white transition-colors">FAQ</NavLink>
              </nav>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 tracking-wide">Company</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <NavLink href="#testimonials" className="text-[#999] hover:text-white transition-colors">Testimonials</NavLink>
                <Link href="/login" className="text-[#999] hover:text-white transition-colors">Book a Call</Link>
              </nav>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 tracking-wide">Market Data</h3>
              <nav className="flex flex-col gap-3 text-sm">
                <Link href="/market/agents" className="text-[#999] hover:text-white transition-colors">Agent Profiles</Link>
                <Link href="/market/properties" className="text-[#999] hover:text-white transition-colors">Private Properties</Link>
                <Link href="/market/hdb" className="text-[#999] hover:text-white transition-colors">HDB Resale</Link>
                <Link href="/market/agencies" className="text-[#999] hover:text-white transition-colors">Agencies</Link>
                <Link href="/market/areas" className="text-[#999] hover:text-white transition-colors">Areas</Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 text-center text-sm text-[#666]">
          <p>
            &copy; {new Date().getFullYear()} {siteBrand.name}. All rights reserved.
          </p>
          <p className="mt-2 text-xs text-[#444]">
            Built by University of Cambridge &amp; Airwallex alumni
          </p>
        </div>
      </Container>
    </footer>
  )
}
