"use client"

/**
 * The hot 50ms-animation loop for the streaming status indicator.
 * This component owns useAnimationFrame(50) and derives all time-based values:
 * spinner frame, shimmer position, flash opacity, token counter, elapsed timer,
 * stall detection, and thinking shimmer.
 *
 * Ported from cc-src/components/Spinner/SpinnerAnimationRow.tsx (Ink → DOM).
 * Teammate/swarm code removed. All constants, formulas, and timing verbatim.
 *
 * The parent SpinnerWithVerb only re-renders when props/state change (~25×/turn).
 * This child re-renders at the 50ms animation clock rate (~383×/turn) — keeping
 * the expensive parent logic out of the hot path.
 *
 * @module components/chat/spinner/spinner-animation-row
 */

import type React from 'react'
import { useMemo, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { GlimmerMessage } from './glimmer-message'
import { SpinnerGlyph, CLAUDE_COLOR_STR, CLAUDE_SHIMMER_STR } from './spinner-glyph'
import type { SpinnerMode } from './types'
import { useStalledAnimation } from './use-stalled-animation'
import { interpolateColor, parseRGB, toRGBColor } from './utils'
import { useAnimationFrame } from './use-animation-frame'

// Separator width (` · ` = 3 chars). Used in progressive width gating.
const SEP_WIDTH = 3
const SHOW_TOKENS_AFTER_MS = 30_000

// Thinking shimmer constants — verbatim from SpinnerAnimationRow.tsx
const THINKING_INACTIVE = { r: 153, g: 153, b: 153 }
const THINKING_INACTIVE_SHIMMER = { r: 185, g: 185, b: 185 }
const THINKING_DELAY_MS = 3000
const THINKING_GLOW_PERIOD_S = 2

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export type SpinnerAnimationRowProps = {
  mode: SpinnerMode
  reducedMotion: boolean
  hasActiveTools: boolean
  responseLengthRef: React.RefObject<number>
  message: string
  loadingStartTimeRef: React.RefObject<number>
  totalPausedMsRef: React.RefObject<number>
  pauseStartTimeRef: React.RefObject<number | null>
  spinnerSuffix?: string | null
  verbose: boolean
  thinkingStatus: 'thinking' | number | null
}

export function SpinnerAnimationRow({
  mode,
  reducedMotion,
  hasActiveTools,
  responseLengthRef,
  message,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  spinnerSuffix,
  verbose,
  thinkingStatus,
}: SpinnerAnimationRowProps): React.ReactNode {
  const [viewportRef, time] = useAnimationFrame(reducedMotion ? null : 50)

  // === Elapsed time (wall-clock, derived from refs each frame) ===
  const now = Date.now()
  const elapsedTimeMs =
    pauseStartTimeRef.current !== null
      ? pauseStartTimeRef.current - loadingStartTimeRef.current - totalPausedMsRef.current
      : now - loadingStartTimeRef.current - totalPausedMsRef.current

  // === Animation derivations from `time` ===
  const currentResponseLength = responseLengthRef.current

  const { isStalled, stalledIntensity } = useStalledAnimation(
    time,
    currentResponseLength,
    hasActiveTools,
    reducedMotion,
  )

  const frame = reducedMotion ? 0 : Math.floor(time / 120)
  const glimmerSpeed = mode === 'requesting' ? 50 : 200
  const glimmerMessageWidth = useMemo(() => message.length, [message])
  const cycleLength = glimmerMessageWidth + 20
  const cyclePosition = Math.floor(time / glimmerSpeed)
  const glimmerIndex = reducedMotion
    ? -100
    : isStalled
      ? -100
      : mode === 'requesting'
        ? cyclePosition % cycleLength - 10
        : glimmerMessageWidth + 10 - cyclePosition % cycleLength

  const flashOpacity =
    reducedMotion
      ? 0
      : mode === 'tool-use'
        ? (Math.sin((time / 1000) * Math.PI) + 1) / 2
        : 0

  // === Token counter animation (smooth increment, driven by 50ms clock) ===
  const tokenCounterRef = useRef(currentResponseLength)
  if (reducedMotion) {
    tokenCounterRef.current = currentResponseLength
  } else {
    const gap = currentResponseLength - tokenCounterRef.current
    if (gap > 0) {
      let increment: number
      if (gap < 70) {
        increment = 3
      } else if (gap < 200) {
        increment = Math.max(8, Math.ceil(gap * 0.15))
      } else {
        increment = 50
      }
      tokenCounterRef.current = Math.min(tokenCounterRef.current + increment, currentResponseLength)
    }
  }
  const displayedResponseLength = tokenCounterRef.current
  const leaderTokens = Math.round(displayedResponseLength / 4)

  const timerText = formatDuration(elapsedTimeMs)

  // === Thinking text ===
  const thinkingText =
    thinkingStatus === 'thinking'
      ? 'thinking'
      : typeof thinkingStatus === 'number'
        ? `thought for ${Math.max(1, Math.round(thinkingStatus / 1000))}s`
        : null

  // === Progressive width gating (simplified — no column width available on web,
  //     so we always show everything. Matches CC behavior in wide terminals.) ===
  const wantsThinking = thinkingStatus !== null
  const wantsTimerAndTokens = verbose || elapsedTimeMs > SHOW_TOKENS_AFTER_MS
  const showThinking = wantsThinking
  const showTimer = wantsTimerAndTokens
  const showTokens = wantsTimerAndTokens && leaderTokens > 0
  const thinkingOnly = showThinking && thinkingStatus === 'thinking' && !spinnerSuffix && !showTimer && !showTokens

  // === Thinking shimmer color (sine-wave after 3s warmup) ===
  const thinkingElapsedSec = (time - THINKING_DELAY_MS) / 1000
  const thinkingOpacity =
    time < THINKING_DELAY_MS
      ? 0
      : (Math.sin((thinkingElapsedSec * Math.PI * 2) / THINKING_GLOW_PERIOD_S) + 1) / 2
  const thinkingShimmerColor = toRGBColor(
    interpolateColor(THINKING_INACTIVE, THINKING_INACTIVE_SHIMMER, thinkingOpacity),
  )

  const messageColorStyle = CLAUDE_COLOR_STR
  const shimmerColorStyle = CLAUDE_SHIMMER_STR

  // === Status parts (suffix · timer · tokens · thinking) ===
  const statusParts: React.ReactNode[] = []

  if (spinnerSuffix) {
    statusParts.push(
      <span key="suffix" className="text-muted-foreground text-xs">{spinnerSuffix}</span>,
    )
  }
  if (showTimer) {
    statusParts.push(
      <span key="timer" className="text-muted-foreground text-xs">{timerText}</span>,
    )
  }
  if (showTokens) {
    statusParts.push(
      <span key="tokens" className="flex items-center gap-0.5 text-muted-foreground text-xs">
        <ChevronDown className="size-3" />
        {formatNumber(leaderTokens)} tokens
      </span>,
    )
  }
  if (showThinking && thinkingText) {
    statusParts.push(
      thinkingStatus === 'thinking' && !reducedMotion ? (
        <span key="thinking" style={{ color: thinkingShimmerColor }} className="text-xs">
          {thinkingOnly ? `(${thinkingText})` : thinkingText}
        </span>
      ) : (
        <span key="thinking" className="text-muted-foreground text-xs">
          {thinkingText}
        </span>
      ),
    )
  }

  const hasStatus = statusParts.length > 0

  return (
    <div
      ref={viewportRef}
      className="mt-2 flex flex-row flex-wrap items-center gap-1"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <SpinnerGlyph
        frame={frame}
        messageColorStyle={messageColorStyle}
        stalledIntensity={stalledIntensity}
        reducedMotion={reducedMotion}
        time={time}
      />
      <GlimmerMessage
        message={message}
        mode={mode}
        messageColorStyle={messageColorStyle}
        glimmerIndex={glimmerIndex}
        flashOpacity={flashOpacity}
        shimmerColorStyle={shimmerColorStyle}
        stalledIntensity={stalledIntensity}
      />
      {hasStatus && (
        <span className="text-muted-foreground text-xs">(</span>
      )}
      {statusParts.map((part, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span className="text-muted-foreground text-xs mx-0.5">·</span>}
          {part}
        </span>
      ))}
      {hasStatus && (
        <span className="text-muted-foreground text-xs">)</span>
      )}
    </div>
  )
}
