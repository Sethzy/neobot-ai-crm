"use client"

/**
 * Calculates the shimmer highlight position (glimmerIndex) for GlimmerMessage.
 *
 * Copied verbatim from cc-src/components/Spinner/useShimmerAnimation.ts, with
 * one change: stringWidth() replaced by a simple .length (Unicode multi-byte
 * chars in verb text are ASCII-only so this is safe; no Ink dependency needed).
 *
 * Returns [ref, glimmerIndex]:
 * - ref: attach to the animated element for viewport-pause
 * - glimmerIndex: which character column the shimmer highlight is at
 *
 * @module components/chat/spinner/use-shimmer-animation
 */

import { useMemo } from 'react'
import type { SpinnerMode } from './types'
import { useAnimationFrame } from './use-animation-frame'

export function useShimmerAnimation(
  mode: SpinnerMode,
  message: string,
  isStalled: boolean,
): [ref: (element: HTMLElement | null) => void, glimmerIndex: number] {
  const glimmerSpeed = mode === 'requesting' ? 50 : 200
  // Pass null when stalled to unsubscribe from the clock — otherwise the
  // interval keeps firing at 20fps even when the shimmer isn't visible.
  const [ref, time] = useAnimationFrame(isStalled ? null : glimmerSpeed)
  const messageWidth = useMemo(() => message.length, [message])

  if (isStalled) {
    return [ref, -100]
  }

  const cyclePosition = Math.floor(time / glimmerSpeed)
  const cycleLength = messageWidth + 20

  if (mode === 'requesting') {
    return [ref, (cyclePosition % cycleLength) - 10]
  }
  return [ref, messageWidth + 10 - (cyclePosition % cycleLength)]
}
