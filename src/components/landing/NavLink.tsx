'use client';

import Link from "next/link";
import { cn } from '@/lib/utils'

export function NavLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
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
      <a
        href={href}
        onClick={handleClick}
        className={cn(
          'inline-block text-sm font-medium text-lp-muted transition-colors hover:text-sunder-green',
          className,
        )}
      >
        {children}
      </a>
    )
  }

  return (
    <Link
      href={href}
      className={cn(
        'inline-block text-sm font-medium text-lp-muted transition-colors hover:text-sunder-green',
        className,
      )}
    >
      {children}
    </Link>
  )
}
