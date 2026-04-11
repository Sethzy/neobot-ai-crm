"use client"

/**
 * The verb text with sweeping shimmer highlight.
 * Handles three visual branches:
 *   1. Stalled (stalledIntensity > 0): entire message fades to red.
 *   2. tool-use mode: full message pulses via flashOpacity (sine wave).
 *   3. Default: single-character shimmer sweeps through the text.
 *
 * Ported from cc-src/components/Spinner/GlimmerMessage.tsx (Ink → DOM).
 * The shimmer is rendered by splitting the message string into three spans:
 * before, highlighted (shimmerColor), after.
 *
 * @module components/chat/spinner/glimmer-message
 */

import type React from 'react'
import { interpolateColor, parseRGB, toRGBColor } from './utils'
import type { SpinnerMode } from './types'

const ERROR_RED = { r: 171, g: 43, b: 63 }

// Hardcoded RGB values matching the CSS variables --color-claude and --color-claude-shimmer.
// Using hardcoded values (same approach as CC) avoids SSR issues with getComputedStyle.
const CLAUDE_COLOR_STR = 'rgb(188,82,21)'
const CLAUDE_SHIMMER_STR = 'rgb(240,166,138)'

type Props = {
  message: string
  mode: SpinnerMode
  /** CSS color string for the verb text. */
  messageColorStyle: string
  glimmerIndex: number
  /** [0,1] opacity for tool-use full-message flash. */
  flashOpacity: number
  shimmerColorStyle: string
  stalledIntensity?: number
}

export function GlimmerMessage({
  message,
  mode,
  messageColorStyle,
  glimmerIndex,
  flashOpacity,
  shimmerColorStyle,
  stalledIntensity = 0,
}: Props): React.ReactNode {
  if (!message) return null

  // Stall path: entire message shifts toward red
  if (stalledIntensity > 0) {
    const baseRGB = parseRGB(CLAUDE_COLOR_STR)
    if (baseRGB) {
      const interpolated = interpolateColor(baseRGB, ERROR_RED, stalledIntensity)
      const color = toRGBColor(interpolated)
      return (
        <>
          <span style={{ color }}>{message}</span>
          <span style={{ color }}> </span>
        </>
      )
    }
    const color = stalledIntensity > 0.5 ? toRGBColor(ERROR_RED) : messageColorStyle
    return (
      <>
        <span style={{ color }}>{message}</span>
        <span style={{ color }}> </span>
      </>
    )
  }

  // Tool-use path: whole message pulses between messageColor and shimmerColor
  if (mode === 'tool-use') {
    const baseRGB = parseRGB(CLAUDE_COLOR_STR)
    const shimmerRGB = parseRGB(CLAUDE_SHIMMER_STR)
    if (baseRGB && shimmerRGB) {
      const interpolated = interpolateColor(baseRGB, shimmerRGB, flashOpacity)
      return (
        <>
          <span style={{ color: toRGBColor(interpolated) }}>{message}</span>
          <span style={{ color: messageColorStyle }}> </span>
        </>
      )
    }
    const color = flashOpacity > 0.5 ? shimmerColorStyle : messageColorStyle
    return (
      <>
        <span style={{ color }}>{message}</span>
        <span style={{ color: messageColorStyle }}> </span>
      </>
    )
  }

  // Default path: single-character shimmer sweep
  const messageWidth = message.length
  const shimmerStart = glimmerIndex - 1
  const shimmerEnd = glimmerIndex + 1

  // Shimmer is fully offscreen — render as plain text
  if (shimmerStart >= messageWidth || shimmerEnd < 0) {
    return (
      <>
        <span style={{ color: messageColorStyle }}>{message}</span>
        <span style={{ color: messageColorStyle }}> </span>
      </>
    )
  }

  const clampedStart = Math.max(0, shimmerStart)
  const before = message.slice(0, clampedStart)
  const shim = message.slice(clampedStart, shimmerEnd + 1)
  const after = message.slice(shimmerEnd + 1)

  return (
    <>
      {before && <span style={{ color: messageColorStyle }}>{before}</span>}
      <span style={{ color: shimmerColorStyle }}>{shim}</span>
      {after && <span style={{ color: messageColorStyle }}>{after}</span>}
      <span style={{ color: messageColorStyle }}> </span>
    </>
  )
}
