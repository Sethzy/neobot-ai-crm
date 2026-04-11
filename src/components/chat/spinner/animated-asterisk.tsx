"use client"

/**
 * The animated ✻ asterisk — performs a 3s HSL hue sweep then settles to grey.
 * Used on idle/welcome screens.
 *
 * Ported from cc-src/components/LogoV2/AnimatedAsterisk.tsx (Ink → DOM).
 * The animation is a 360° hue sweep at s=0.7, l=0.6 over two 1500ms passes.
 *
 * @module components/chat/spinner/animated-asterisk
 */

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { TEARDROP_ASTERISK } from '@/lib/chat/spinner-figures'
import { hueToRgb, toRGBColor } from './utils'
import { useAnimationFrame } from './use-animation-frame'

const SWEEP_DURATION_MS = 1500
const SWEEP_COUNT = 2
const TOTAL_ANIMATION_MS = SWEEP_DURATION_MS * SWEEP_COUNT
const SETTLED_GREY = 'rgb(153,153,153)'

interface AnimatedAsteriskProps {
  char?: string
  /** If true, skips animation and renders static grey immediately. */
  reducedMotion?: boolean
}

export function AnimatedAsterisk({
  char = TEARDROP_ASTERISK,
  reducedMotion = false,
}: AnimatedAsteriskProps): React.ReactNode {
  const [done, setDone] = useState(reducedMotion)
  // Capture our start offset so the sweep always begins at hue 0
  // regardless of when we mount (shared clock may already be running).
  const startTimeRef = useRef<number | null>(null)

  const [ref, time] = useAnimationFrame(done ? null : 50)

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setDone(true), TOTAL_ANIMATION_MS)
    return () => clearTimeout(t)
  }, [done])

  if (done) {
    return (
      <span ref={ref} style={{ color: SETTLED_GREY }} aria-hidden="true">
        {char}
      </span>
    )
  }

  if (startTimeRef.current === null) {
    startTimeRef.current = time
  }
  const elapsed = time - startTimeRef.current
  const hue = (elapsed / SWEEP_DURATION_MS) * 360 % 360

  return (
    <span
      ref={ref}
      style={{ color: toRGBColor(hueToRgb(hue)) }}
      aria-hidden="true"
    >
      {char}
    </span>
  )
}
