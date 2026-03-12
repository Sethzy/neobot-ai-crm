'use client'

/**
 * Landing hero identity animation that follows the reference choreography:
 * build tokens from right to left, then resolve them center-out into NEO.
 * @module components/landing/HeroIdentityAnimation
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

type SlotId = 'left' | 'middle' | 'right'
type TokenKind = 'tasks' | 'messaging' | 'contacts'
type LetterKind = 'N' | 'E' | 'O'

type SlotVisual =
  | {
      kind: 'token'
      value: TokenKind
      x: number
      y?: number
      zIndex: number
      key: string
    }
  | {
      kind: 'letter'
      value: LetterKind
      x: number
      y?: number
      zIndex: number
      key: string
    }
  | null

interface SequenceFrame {
  left: SlotVisual
  middle: SlotVisual
  right: SlotVisual
  glowOpacity: number
  glowScale: number
}

const SLOT_IDS: SlotId[] = ['left', 'middle', 'right']

/**
 * Delay between each sequence step. Step 0 is the empty lane.
 */
export const HERO_IDENTITY_STEP_DELAYS_MS = [0, 450, 300, 1000, 150, 400, 150, 400, 150] as const

const SLOT_MOUNT_TRANSITION = {
  duration: 0.35,
  ease: [0.25, 0.46, 0.45, 0.94] as const,
}

const SLOT_POSITION_TRANSITION = {
  type: 'spring' as const,
  stiffness: 160,
  damping: 24,
  mass: 1.0,
}

/** Underdamped spring for per-letter bounce entrance (pop up from below → overshoot → settle). */
const LETTER_BOUNCE_TRANSITION = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 16,
  mass: 0.7,
}

const HERO_LETTER_STYLE: React.CSSProperties = {
  fontSize: 'clamp(4rem, 8vw, 7rem)',
  fontWeight: 900,
  lineHeight: 0.88,
  letterSpacing: '-0.06em',
  textShadow: '0 12px 24px rgba(26, 26, 26, 0.06)',
}

const HERO_LETTER_CLASS = 'font-sans uppercase text-lp-dark'

const SEQUENCE: SequenceFrame[] = [
  // Frame 0: empty
  {
    left: null,
    middle: null,
    right: null,
    glowOpacity: 0.12,
    glowScale: 0.88,
  },
  // Frame 1: first avatar appears
  {
    left: null,
    middle: null,
    right: {
      kind: 'token',
      value: 'contacts',
      x: 0,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.18,
    glowScale: 0.92,
  },
  // Frame 2: second token joins
  {
    left: null,
    middle: {
      kind: 'token',
      value: 'messaging',
      x: -50,
      zIndex: 2,
      key: 'messaging',
    },
    right: {
      kind: 'token',
      value: 'contacts',
      x: 50,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.24,
    glowScale: 0.97,
  },
  // Frame 3: all three tokens at rest (linger here)
  {
    left: {
      kind: 'token',
      value: 'tasks',
      x: -100,
      zIndex: 3,
      key: 'tasks',
    },
    middle: {
      kind: 'token',
      value: 'messaging',
      x: 0,
      zIndex: 2,
      key: 'messaging',
    },
    right: {
      kind: 'token',
      value: 'contacts',
      x: 100,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.32,
    glowScale: 1,
  },
  // Frame 4: left token dips down (anticipation for N)
  {
    left: {
      kind: 'token',
      value: 'tasks',
      x: -100,
      y: 18,
      zIndex: 3,
      key: 'tasks',
    },
    middle: {
      kind: 'token',
      value: 'messaging',
      x: 0,
      zIndex: 2,
      key: 'messaging',
    },
    right: {
      kind: 'token',
      value: 'contacts',
      x: 100,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.34,
    glowScale: 0.98,
  },
  // Frame 5: N crystallizes at same x as token
  {
    left: {
      kind: 'letter',
      value: 'N',
      x: -100,
      zIndex: 4,
      key: 'N',
    },
    middle: {
      kind: 'token',
      value: 'messaging',
      x: 0,
      zIndex: 2,
      key: 'messaging',
    },
    right: {
      kind: 'token',
      value: 'contacts',
      x: 100,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.4,
    glowScale: 1.04,
  },
  // Frame 6: middle token dips down (anticipation for E)
  {
    left: {
      kind: 'letter',
      value: 'N',
      x: -100,
      zIndex: 3,
      key: 'N',
    },
    middle: {
      kind: 'token',
      value: 'messaging',
      x: 0,
      y: 18,
      zIndex: 2,
      key: 'messaging',
    },
    right: {
      kind: 'token',
      value: 'contacts',
      x: 100,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.42,
    glowScale: 1.02,
  },
  // Frame 7: E crystallizes at same x as token
  {
    left: {
      kind: 'letter',
      value: 'N',
      x: -100,
      zIndex: 3,
      key: 'N',
    },
    middle: {
      kind: 'letter',
      value: 'E',
      x: 0,
      zIndex: 4,
      key: 'E',
    },
    right: {
      kind: 'token',
      value: 'contacts',
      x: 100,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.5,
    glowScale: 1.08,
  },
  // Frame 8: right token dips down (anticipation for O)
  {
    left: {
      kind: 'letter',
      value: 'N',
      x: -100,
      zIndex: 3,
      key: 'N',
    },
    middle: {
      kind: 'letter',
      value: 'E',
      x: 0,
      zIndex: 2,
      key: 'E',
    },
    right: {
      kind: 'token',
      value: 'contacts',
      x: 100,
      y: 18,
      zIndex: 1,
      key: 'contacts',
    },
    glowOpacity: 0.52,
    glowScale: 1.06,
  },
  // Frame 9: O crystallizes — final NEO
  {
    left: {
      kind: 'letter',
      value: 'N',
      x: -100,
      zIndex: 3,
      key: 'N',
    },
    middle: {
      kind: 'letter',
      value: 'E',
      x: 0,
      zIndex: 2,
      key: 'E',
    },
    right: {
      kind: 'letter',
      value: 'O',
      x: 100,
      zIndex: 4,
      key: 'O',
    },
    glowOpacity: 0.58,
    glowScale: 1.12,
  },
]

export interface HeroIdentityAnimationProps {
  className?: string
}

function getSlotVisualName(slotVisual: SlotVisual) {
  if (!slotVisual) return 'empty'
  return slotVisual.value
}

function HeroLetter({ value }: { value: LetterKind }) {
  return (
    <span className={HERO_LETTER_CLASS} style={HERO_LETTER_STYLE}>
      {value}
    </span>
  )
}

function TokenShell({ gradient, shadow, children }: {
  gradient: string
  shadow: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex aspect-square h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-white sm:h-[4.5rem] sm:w-[4.5rem]"
      style={{ background: gradient, boxShadow: shadow }}
    >
      {children}
    </div>
  )
}

/** Schedule/automation token — green with solid calendar icon. */
function ScheduleToken() {
  return (
    <TokenShell
      gradient="linear-gradient(180deg, #9EEFD0 0%, #86DDB8 100%)"
      shadow="0 12px 30px rgba(73, 138, 108, 0.16)"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" fill="none">
        <rect x="7" y="8" width="18" height="18" rx="3" fill="#1A3A2A" />
        <rect x="7" y="8" width="18" height="7" rx="3" fill="#0F2A1E" />
        <rect x="7" y="12" width="18" height="3" fill="#0F2A1E" />
        <path d="M12 5v5" stroke="#1A3A2A" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20 5v5" stroke="#1A3A2A" strokeWidth="2.5" strokeLinecap="round" />
        <text x="16" y="23.5" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="sans-serif">15</text>
      </svg>
    </TokenShell>
  )
}

/** Messaging/follow-ups token — blue with solid chat bubble icon. */
function MessagingToken() {
  return (
    <TokenShell
      gradient="linear-gradient(180deg, #B7BEFF 0%, #A3ABFF 100%)"
      shadow="0 12px 30px rgba(83, 92, 181, 0.16)"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" fill="none">
        <path d="M7 10a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3h-3l-4 4v-4h-5a3 3 0 01-3-3v-8z" fill="#2A2A5A" />
        <circle cx="12.5" cy="14" r="1.3" fill="white" />
        <circle cx="16" cy="14" r="1.3" fill="white" />
        <circle cx="19.5" cy="14" r="1.3" fill="white" />
      </svg>
    </TokenShell>
  )
}

/** Contacts/leads token — warm amber with solid person silhouette icon. */
function ContactsToken() {
  return (
    <TokenShell
      gradient="linear-gradient(180deg, #F0C99A 0%, #E0B07A 100%)"
      shadow="0 12px 30px rgba(160, 110, 70, 0.16)"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" fill="#5C3D1E">
        <circle cx="16" cy="11.5" r="5" />
        <path d="M7 27a9 9 0 0118 0" />
      </svg>
    </TokenShell>
  )
}

function SlotVisualContent({
  slotVisual,
}: {
  slotVisual: Exclude<SlotVisual, null>
}) {
  if (slotVisual.kind === 'letter') {
    return <HeroLetter value={slotVisual.value} />
  }

  if (slotVisual.value === 'tasks') return <ScheduleToken />
  if (slotVisual.value === 'messaging') return <MessagingToken />
  return <ContactsToken />
}

/**
 * The sequence is intentionally data-driven so the choreography stays easy to
 * compare against the reference screenshots.
 */
export function HeroIdentityAnimation({
  className,
}: HeroIdentityAnimationProps) {
  const shouldReduceMotion = useReducedMotion()
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (shouldReduceMotion) return

    let totalDelay = 0
    const timeoutIds = HERO_IDENTITY_STEP_DELAYS_MS.map((delay, index) => {
      totalDelay += delay

      return window.setTimeout(() => {
        setStepIndex(index + 1)
      }, totalDelay)
    })

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
    }
  }, [shouldReduceMotion])

  const activeFrame = shouldReduceMotion ? SEQUENCE[SEQUENCE.length - 1] : SEQUENCE[stepIndex]

  return (
    <div
      aria-hidden="true"
      data-testid="hero-identity-animation"
      data-sequence-step={shouldReduceMotion ? 'reduced' : String(stepIndex)}
      className={`pointer-events-none relative flex min-h-[100px] items-center justify-center sm:min-h-[130px] ${className ?? ''}`}
    >
      <motion.div
        className="absolute h-24 w-64 rounded-full sm:h-28 sm:w-80"
        initial={false}
        animate={{
          opacity: activeFrame.glowOpacity,
          scale: activeFrame.glowScale,
        }}
        transition={{
          duration: 0.6,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(2, 79, 70, 0.22) 0%, rgba(2, 79, 70, 0.11) 40%, rgba(2, 79, 70, 0) 74%)',
          filter: 'blur(24px)',
        }}
      />

      {shouldReduceMotion ? (
        <div className="relative flex items-center justify-center">
          <span className={HERO_LETTER_CLASS} style={HERO_LETTER_STYLE}>
            NEO
          </span>
        </div>
      ) : (
        <div className="relative h-[100px] w-[340px] sm:h-[130px] sm:w-[440px]">
          {SLOT_IDS.map((slotId) => {
            const slotVisual = activeFrame[slotId]

            return (
              <div
                key={slotId}
                data-testid={`hero-slot-${slotId}`}
                data-slot-id={slotId}
                data-slot-visual={getSlotVisualName(slotVisual)}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <motion.div
                  initial={false}
                  animate={{
                    x: slotVisual?.x ?? 0,
                    y: slotVisual?.y ?? 0,
                    opacity: slotVisual ? 1 : 0,
                    scale: slotVisual ? 1 : 0.72,
                    zIndex: slotVisual?.zIndex ?? 0,
                  }}
                  transition={{
                    x: SLOT_POSITION_TRANSITION,
                    y: SLOT_POSITION_TRANSITION,
                    opacity: SLOT_MOUNT_TRANSITION,
                    scale: SLOT_MOUNT_TRANSITION,
                  }}
                >
                  <div className="relative flex h-[100px] w-[110px] items-center justify-center sm:h-[130px] sm:w-[140px]">
                    <AnimatePresence initial={false} mode="wait">
                      {slotVisual ? (
                        <motion.div
                          key={slotVisual.key}
                          initial={
                            slotVisual.kind === 'letter'
                              ? { opacity: 1, scale: 1, y: 20 }
                              : { opacity: 0, scale: 0.88, y: 5 }
                          }
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, transition: { duration: 0 } }}
                          transition={
                            slotVisual.kind === 'letter'
                              ? { opacity: { duration: 0 }, scale: { duration: 0 }, y: LETTER_BOUNCE_TRANSITION }
                              : SLOT_MOUNT_TRANSITION
                          }
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <SlotVisualContent slotVisual={slotVisual} />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
