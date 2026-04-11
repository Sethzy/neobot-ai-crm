"use client"

/**
 * Shared animation clock — a single setInterval that all animated spinner
 * components subscribe to. All subscribers in the same tick see the same
 * `tickTime` value, keeping animations perfectly synchronized.
 *
 * Ported verbatim from cc-src/ink/components/ClockContext.tsx with two changes:
 * 1. useTerminalFocus() → useTabVisible() (document.visibilityState)
 * 2. FRAME_INTERVAL_MS hardcoded to 50 (was imported from cc-src/ink/constants.ts)
 *
 * @module components/chat/spinner/clock-context
 */

import React, {
  createContext,
  useEffect,
  useState,
} from 'react'

const FRAME_INTERVAL_MS = 50
const BLURRED_TICK_INTERVAL_MS = FRAME_INTERVAL_MS * 2

export interface Clock {
  subscribe: (onChange: () => void, keepAlive: boolean) => () => void
  now: () => number
  setTickInterval: (ms: number) => void
}

export function createClock(tickIntervalMs: number): Clock {
  const subscribers = new Map<() => void, boolean>()
  let interval: ReturnType<typeof setInterval> | null = null
  let currentTickIntervalMs = tickIntervalMs
  let startTime = 0
  // Snapshot of the current tick's time, ensuring all subscribers in the same
  // tick see the same value (keeps animations synchronized)
  let tickTime = 0

  function tick(): void {
    tickTime = Date.now() - startTime
    for (const onChange of subscribers.keys()) {
      onChange()
    }
  }

  function updateInterval(): void {
    const anyKeepAlive = [...subscribers.values()].some(Boolean)

    if (anyKeepAlive) {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
      if (startTime === 0) {
        startTime = Date.now()
      }
      interval = setInterval(tick, currentTickIntervalMs)
    } else if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  return {
    subscribe(onChange, keepAlive) {
      subscribers.set(onChange, keepAlive)
      updateInterval()
      return () => {
        subscribers.delete(onChange)
        updateInterval()
      }
    },

    now() {
      if (startTime === 0) {
        startTime = Date.now()
      }
      // When the clock interval is running, return the synchronized tickTime
      // so all subscribers in the same tick see the same value.
      // When paused (no keepAlive subscribers), return real-time to avoid
      // returning a stale tickTime from the last tick before the pause.
      if (interval && tickTime) {
        return tickTime
      }
      return Date.now() - startTime
    },

    setTickInterval(ms) {
      if (ms === currentTickIntervalMs) return
      currentTickIntervalMs = ms
      updateInterval()
    },
  }
}

export const ClockContext = createContext<Clock | null>(null)

/** Returns true when the browser tab is visible, false when hidden. */
function useTabVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden,
  )
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/**
 * Mount once at the top of the chat layout. Provides the shared clock to all
 * spinner components. Slows the tick to 100ms when the tab is hidden.
 */
export function ClockProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const [clock] = useState(() => createClock(FRAME_INTERVAL_MS))
  const tabVisible = useTabVisible()

  useEffect(() => {
    clock.setTickInterval(tabVisible ? FRAME_INTERVAL_MS : BLURRED_TICK_INTERVAL_MS)
  }, [clock, tabVisible])

  return (
    <ClockContext.Provider value={clock}>
      {children}
    </ClockContext.Provider>
  )
}
