"use client"

/**
 * The slow parent of the streaming status indicator.
 * Re-renders ~25×/turn on prop/state changes — not on the 50ms animation clock.
 * Owns the thinking-status state machine and random verb selection.
 *
 * Ported from cc-src/components/Spinner.tsx (SpinnerWithVerbInner, lines 82–301).
 * Stripped: swarm/teammate code, tip system, brief mode, budget text, expanded todos.
 * Kept verbatim: verb picker, thinking-status effect (2s minimum display), refs.
 *
 * @module components/chat/spinner/spinner-with-verb
 */

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { getSpinnerVerbs } from '@/lib/chat/spinner-verbs'
import type { SpinnerMode } from './types'
import { SpinnerAnimationRow } from './spinner-animation-row'

/** Pick a random element from an array (lodash `sample` equivalent). */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

interface SpinnerWithVerbProps {
  mode: SpinnerMode
  /** Ref to the current response character count — updated externally as tokens stream in. */
  responseLengthRef: React.RefObject<number>
  /** Wall-clock timestamp (ms) when the current turn started. */
  loadingStartTimeRef: React.RefObject<number>
  /** Total paused duration (ms) for the current turn (e.g. during approval waits). */
  totalPausedMsRef: React.RefObject<number>
  /** Timestamp when a pause started, null if not paused. */
  pauseStartTimeRef: React.RefObject<number | null>
  /** True when a tool is actively executing — suppresses stall detection. */
  hasActiveTools?: boolean
  /** Override the random verb (e.g. from the active task's activeForm). */
  overrideMessage?: string | null
  /** Extra text appended after the status line (e.g. connection name). */
  spinnerSuffix?: string | null
  /** Show elapsed timer and token count even before 30s. */
  verbose?: boolean
  /** If true, uses a reduced-motion fallback for all animations. */
  reducedMotion?: boolean
}

export function SpinnerWithVerb({
  mode,
  responseLengthRef,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  hasActiveTools = false,
  overrideMessage,
  spinnerSuffix,
  verbose = false,
  reducedMotion = false,
}: SpinnerWithVerbProps): React.ReactNode {
  // Use useState with initializer to pick a random verb once on mount.
  // Verbatim from cc-src/components/Spinner.tsx:166.
  const [randomVerb] = useState(() => pickRandom(getSpinnerVerbs()))
  const message = (overrideMessage ?? randomVerb) + '…'

  // Track thinking status: 'thinking' | number (duration ms) | null.
  // Shows each state for a minimum of 2s to avoid UI jank.
  // Verbatim from cc-src/components/Spinner.tsx:125–159.
  const [thinkingStatus, setThinkingStatus] = useState<'thinking' | number | null>(null)
  const thinkingStartRef = useRef<number | null>(null)

  useEffect(() => {
    let showDurationTimer: ReturnType<typeof setTimeout> | null = null
    let clearStatusTimer: ReturnType<typeof setTimeout> | null = null

    if (mode === 'thinking') {
      // Started thinking
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now()
        setThinkingStatus('thinking')
      }
    } else if (thinkingStartRef.current !== null) {
      // Stopped thinking — calculate duration and ensure 2s minimum display
      const duration = Date.now() - thinkingStartRef.current
      const remainingThinkingTime = Math.max(0, 2000 - duration)
      thinkingStartRef.current = null

      // Show "thinking" for remaining time if < 2s elapsed, then show duration
      const showDuration = (): void => {
        setThinkingStatus(duration)
        // Clear after 2s
        clearStatusTimer = setTimeout(() => setThinkingStatus(null), 2000)
      }
      if (remainingThinkingTime > 0) {
        showDurationTimer = setTimeout(showDuration, remainingThinkingTime)
      } else {
        showDuration()
      }
    }

    return () => {
      if (showDurationTimer) clearTimeout(showDurationTimer)
      if (clearStatusTimer) clearTimeout(clearStatusTimer)
    }
  }, [mode])

  return (
    <SpinnerAnimationRow
      mode={mode}
      reducedMotion={reducedMotion}
      hasActiveTools={hasActiveTools}
      responseLengthRef={responseLengthRef}
      message={message}
      loadingStartTimeRef={loadingStartTimeRef}
      totalPausedMsRef={totalPausedMsRef}
      pauseStartTimeRef={pauseStartTimeRef}
      spinnerSuffix={spinnerSuffix}
      verbose={verbose}
      thinkingStatus={thinkingStatus}
    />
  )
}
