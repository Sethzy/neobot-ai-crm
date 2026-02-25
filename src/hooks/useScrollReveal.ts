'use client';

/**
 * Lightweight scroll-reveal hook for mobile-friendly animations.
 * Uses Intersection Observer for performant scroll-triggered reveals.
 */
import { useEffect, useRef, useState } from 'react'

interface UseScrollRevealOptions {
  /** Threshold for triggering (0-1). Default 0.1 */
  threshold?: number
  /** Root margin for early/late triggering. Default '0px 0px -50px 0px' */
  rootMargin?: string
  /** Only trigger once. Default true */
  triggerOnce?: boolean
}

/**
 * Hook that returns a ref and visibility state for scroll-triggered animations.
 * Optimized for mobile performance with minimal re-renders.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollRevealOptions = {}
) {
  const {
    threshold = 0.1,
    rootMargin = '0px 0px -50px 0px',
    triggerOnce = true
  } = options

  const ref = useRef<T>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Scroll reveal classes only animate on mobile; skip observers elsewhere.
    const isMobileViewport = window.matchMedia('(max-width: 639px)').matches
    if (!isMobileViewport) {
      setIsVisible(true)
      return
    }

    // Skip animation if user prefers reduced motion.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (triggerOnce) {
            observer.unobserve(element)
          }
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [threshold, rootMargin, triggerOnce])

  return { ref, isVisible }
}

/**
 * Hook for staggered children animations.
 * Returns the parent ref and a function to get delay classes.
 */
export function useStaggeredReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollRevealOptions & { staggerDelay?: number } = {}
) {
  const { staggerDelay = 100, ...scrollOptions } = options
  const { ref, isVisible } = useScrollReveal<T>(scrollOptions)

  const getStaggerDelay = (index: number) => ({
    transitionDelay: `${index * staggerDelay}ms`,
    animationDelay: `${index * staggerDelay}ms`,
  })

  return { ref, isVisible, getStaggerDelay }
}
