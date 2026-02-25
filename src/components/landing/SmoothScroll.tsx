'use client'

/**
 * Lenis smooth-scroll wrapper — adds weighted inertia to page scroll.
 * Only mount on marketing pages; dashboard has its own scroll contexts.
 */
import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

interface SmoothScrollProps {
  children: React.ReactNode
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    /** Desktop only — mobile already has native inertia. */
    if (window.matchMedia('(max-width: 1023px)').matches) return
    /** Respect reduced-motion. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      lerp: 0.28,
      smoothWheel: true,
      syncTouch: false,
    })
    lenisRef.current = lenis

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  return <>{children}</>
}
