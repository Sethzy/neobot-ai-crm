"use client"

/**
 * Animated spinner glyph — cycles through ['·', '✢', '✳', '✶', '✻', '✽'] forward
 * then reverse, driven by the animation clock frame counter.
 *
 * Ported from cc-src/components/Spinner/SpinnerGlyph.tsx (Ink → DOM).
 * - Stall: when stalledIntensity > 0, interpolates glyph color toward ERROR_RED.
 * - Reduced motion: renders a slowly flashing dot (●) instead.
 *
 * @module components/chat/spinner/spinner-glyph
 */

import type React from 'react'
import { getDefaultCharacters, interpolateColor, parseRGB, toRGBColor } from './utils'

const DEFAULT_CHARACTERS = getDefaultCharacters()
const SPINNER_FRAMES = [...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()]

const REDUCED_MOTION_DOT = '●'
const REDUCED_MOTION_CYCLE_MS = 2000 // 2-second cycle: 1s visible, 1s dim

const ERROR_RED = { r: 171, g: 43, b: 63 }

// Concrete RGB values for the claude spinner color (Flexoki orange light/dark average)
// parseRGB is used on these in the stall calculation — we resolve from CSS at build-time
// by hardcoding rather than calling getComputedStyle (which is not SSR-safe).
const CLAUDE_COLOR_STR = 'rgb(188,82,21)'         // light: #BC5215
const CLAUDE_SHIMMER_STR = 'rgb(240,166,138)'     // shimmer highlight

type Props = {
  frame: number
  /** Base color of the glyph — applied in normal state. */
  messageColorStyle: string
  stalledIntensity?: number
  reducedMotion?: boolean
  time?: number
}

export function SpinnerGlyph({
  frame,
  messageColorStyle,
  stalledIntensity = 0,
  reducedMotion = false,
  time = 0,
}: Props): React.ReactNode {
  // Reduced motion: slowly flashing dot
  if (reducedMotion) {
    const isDim = Math.floor(time / (REDUCED_MOTION_CYCLE_MS / 2)) % 2 === 1
    return (
      <span
        style={{ color: messageColorStyle, opacity: isDim ? 0.4 : 1 }}
        aria-hidden="true"
      >
        {REDUCED_MOTION_DOT}
      </span>
    )
  }

  const spinnerChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]

  // Smoothly interpolate from current color to red when stalled
  if (stalledIntensity > 0) {
    const baseRGB = parseRGB(CLAUDE_COLOR_STR)
    if (baseRGB) {
      const interpolated = interpolateColor(baseRGB, ERROR_RED, stalledIntensity)
      return (
        <span style={{ color: toRGBColor(interpolated) }} aria-hidden="true">
          {spinnerChar}
        </span>
      )
    }
  }

  return (
    <span style={{ color: messageColorStyle }} aria-hidden="true">
      {spinnerChar}
    </span>
  )
}

/** Exported for use in AnimatedAsterisk and other callers. */
export { CLAUDE_COLOR_STR, CLAUDE_SHIMMER_STR }
