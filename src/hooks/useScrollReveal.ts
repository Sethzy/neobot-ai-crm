'use client';

/**
 * Lightweight scroll-reveal hook for mobile-friendly animations.
 * Uses a singleton IntersectionObserver to avoid creating 12+ instances.
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

/* -------------------------------------------------------------------------- */
/*                        Singleton observer pool                             */
/* -------------------------------------------------------------------------- */

type ObserverCallback = (isIntersecting: boolean) => void

/** Key = "threshold|rootMargin" to reuse observers with identical options. */
const observers = new Map<string, {
  observer: IntersectionObserver
  callbacks: Map<Element, ObserverCallback>
}>()

function getObserverKey(threshold: number, rootMargin: string) {
  return `${threshold}|${rootMargin}`
}

function observe(
  element: Element,
  callback: ObserverCallback,
  threshold: number,
  rootMargin: string,
) {
  const key = getObserverKey(threshold, rootMargin)
  let entry = observers.get(key)

  if (!entry) {
    const callbacks = new Map<Element, ObserverCallback>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const cb = callbacks.get(e.target)
          if (cb) cb(e.isIntersecting)
        }
      },
      { threshold, rootMargin },
    )
    entry = { observer, callbacks }
    observers.set(key, entry)
  }

  entry.callbacks.set(element, callback)
  entry.observer.observe(element)

  return () => {
    entry!.callbacks.delete(element)
    entry!.observer.unobserve(element)
    // Clean up empty observers
    if (entry!.callbacks.size === 0) {
      entry!.observer.disconnect()
      observers.delete(key)
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Hooks                                     */
/* -------------------------------------------------------------------------- */

/**
 * Hook that returns a ref and visibility state for scroll-triggered animations.
 * Shares a singleton IntersectionObserver across all instances with the same options.
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true)
      return
    }

    const unobserve = observe(
      element,
      (isIntersecting) => {
        if (isIntersecting) {
          setIsVisible(true)
          if (triggerOnce) unobserve()
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      threshold,
      rootMargin,
    )

    return unobserve
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
