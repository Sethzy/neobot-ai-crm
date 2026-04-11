"use client"

/**
 * Hook for synchronized animations that pause when scrolled offscreen.
 *
 * Ported verbatim from cc-src/ink/hooks/use-animation-frame.ts with one change:
 * useTerminalViewport() → useInViewport() (IntersectionObserver).
 *
 * Returns [ref, time]:
 * - ref: attach to the animated element so it pauses when offscreen
 * - time: milliseconds elapsed since the shared clock started
 *
 * Pass null to pause — unsubscribes from the clock, time freezes.
 *
 * @module components/chat/spinner/use-animation-frame
 */

import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ClockContext } from './clock-context'

/** Watches an element's intersection with the viewport using IntersectionObserver. */
function useInViewport(): [
  setRef: (el: HTMLElement | null) => void,
  state: { isVisible: boolean },
] {
  const [isVisible, setIsVisible] = useState(true)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const setRef = useCallback((el: HTMLElement | null) => {
    observerRef.current?.disconnect()
    if (!el) return
    observerRef.current = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? true),
      { threshold: 0 },
    )
    observerRef.current.observe(el)
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return [setRef, { isVisible }]
}

/**
 * Subscribe to the shared animation clock at a given interval.
 *
 * @param intervalMs - How often to fire (ms), or null to pause.
 * @returns [ref, time] — ref to attach to the animated element; elapsed time in ms.
 *
 * @example
 * function Spinner() {
 *   const [ref, time] = useAnimationFrame(120)
 *   const frame = Math.floor(time / 120) % FRAMES.length
 *   return <div ref={ref}>{FRAMES[frame]}</div>
 * }
 */
export function useAnimationFrame(
  intervalMs: number | null = 16,
): [ref: (element: HTMLElement | null) => void, time: number] {
  const clock = useContext(ClockContext)
  const [viewportRef, { isVisible }] = useInViewport()
  const [time, setTime] = useState(() => clock?.now() ?? 0)

  const active = isVisible && intervalMs !== null

  useEffect(() => {
    if (!clock || !active) return

    let lastUpdate = clock.now()

    const onChange = (): void => {
      const now = clock.now()
      if (now - lastUpdate >= intervalMs!) {
        lastUpdate = now
        setTime(now)
      }
    }

    // keepAlive: true — visible animations drive the clock
    return clock.subscribe(onChange, true)
  }, [clock, intervalMs, active])

  return [viewportRef, time]
}
