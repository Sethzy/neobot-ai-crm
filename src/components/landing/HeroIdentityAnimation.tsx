'use client'

/**
 * Landing hero identity animation that follows the reference choreography:
 * build tokens from right to left, then resolve them center-out into NEO.
 * @module components/landing/HeroIdentityAnimation
 */
import Image, { type StaticImageData } from 'next/image'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import avatarImage from '@/assets/landing/avatars/avatar-1.png'

type SlotId = 'left' | 'middle' | 'right'
type TokenKind = 'ai-green' | 'ai-blue' | 'avatar'
type LetterKind = 'N' | 'E' | 'O'

type SlotVisual =
  | {
      kind: 'token'
      value: TokenKind
      x: number
      zIndex: number
      key: string
    }
  | {
      kind: 'letter'
      value: LetterKind
      x: number
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
export const HERO_IDENTITY_STEP_DELAYS_MS = [0, 450, 300, 1000, 450, 400] as const

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
  stiffness: 220,
  damping: 14,
  mass: 0.7,
}

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
      value: 'avatar',
      x: 0,
      zIndex: 1,
      key: 'avatar',
    },
    glowOpacity: 0.18,
    glowScale: 0.92,
  },
  // Frame 2: second token joins
  {
    left: null,
    middle: {
      kind: 'token',
      value: 'ai-blue',
      x: -40,
      zIndex: 2,
      key: 'ai-blue',
    },
    right: {
      kind: 'token',
      value: 'avatar',
      x: 40,
      zIndex: 1,
      key: 'avatar',
    },
    glowOpacity: 0.24,
    glowScale: 0.97,
  },
  // Frame 3: all three tokens at rest (linger here)
  {
    left: {
      kind: 'token',
      value: 'ai-green',
      x: -80,
      zIndex: 3,
      key: 'ai-green',
    },
    middle: {
      kind: 'token',
      value: 'ai-blue',
      x: 0,
      zIndex: 2,
      key: 'ai-blue',
    },
    right: {
      kind: 'token',
      value: 'avatar',
      x: 80,
      zIndex: 1,
      key: 'avatar',
    },
    glowOpacity: 0.32,
    glowScale: 1,
  },
  // Frame 4: E crystallizes (center-out, middle first)
  {
    left: {
      kind: 'token',
      value: 'ai-green',
      x: -95,
      zIndex: 1,
      key: 'ai-green',
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
      value: 'avatar',
      x: 95,
      zIndex: 2,
      key: 'avatar',
    },
    glowOpacity: 0.4,
    glowScale: 1.04,
  },
  // Frame 5: O crystallizes
  {
    left: {
      kind: 'token',
      value: 'ai-green',
      x: -105,
      zIndex: 1,
      key: 'ai-green',
    },
    middle: {
      kind: 'letter',
      value: 'E',
      x: -2,
      zIndex: 3,
      key: 'E',
    },
    right: {
      kind: 'letter',
      value: 'O',
      x: 100,
      zIndex: 4,
      key: 'O',
    },
    glowOpacity: 0.5,
    glowScale: 1.08,
  },
  // Frame 6: N crystallizes — final NEO
  {
    left: {
      kind: 'letter',
      value: 'N',
      x: -110,
      zIndex: 4,
      key: 'N',
    },
    middle: {
      kind: 'letter',
      value: 'E',
      x: -2,
      zIndex: 3,
      key: 'E',
    },
    right: {
      kind: 'letter',
      value: 'O',
      x: 108,
      zIndex: 2,
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
    <span
      className="font-sans uppercase text-lp-dark"
      style={{
        fontSize: 'clamp(4rem, 8vw, 7rem)',
        fontWeight: 900,
        lineHeight: 0.88,
        letterSpacing: '-0.06em',
        textShadow: '0 12px 24px rgba(26, 26, 26, 0.06)',
      }}
    >
      {value}
    </span>
  )
}

function AvatarToken({
  image,
}: {
  image: StaticImageData
}) {
  return (
    <div className="relative aspect-square h-16 w-16 shrink-0 overflow-hidden rounded-full border-[3px] border-white bg-[#D8C3A5] shadow-[0_10px_24px_rgba(32,24,18,0.13)] sm:h-[4.5rem] sm:w-[4.5rem]">
      <Image
        src={image}
        alt=""
        fill
        sizes="64px"
        className="object-cover"
      />
    </div>
  )
}

function AiToken({
  tone,
}: {
  tone: 'green' | 'blue'
}) {
  const palette = tone === 'green'
    ? {
        background: 'linear-gradient(180deg, #9EEFD0 0%, #92E8C8 100%)',
        shadow: '0 12px 30px rgba(73, 138, 108, 0.16)',
      }
    : {
        background: 'linear-gradient(180deg, #B7BEFF 0%, #A8B0FF 100%)',
        shadow: '0 12px 30px rgba(83, 92, 181, 0.16)',
      }

  return (
    <div
      className="flex aspect-square h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-white sm:h-[4.5rem] sm:w-[4.5rem]"
      style={{
        background: palette.background,
        boxShadow: palette.shadow,
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="h-7 w-7 sm:h-8 sm:w-8"
      >
        <path d="M12 10v4" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20 10v4" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M16 12v7" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M10.5 22c1.8 1.7 9.2 1.7 11 0" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="13" cy="19" r="1.4" fill="#111111" />
      </svg>
    </div>
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

  if (slotVisual.value === 'avatar') {
    return <AvatarToken image={avatarImage} />
  }

  return <AiToken tone={slotVisual.value === 'ai-green' ? 'green' : 'blue'} />
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
          <span
            className="font-sans uppercase text-lp-dark"
            style={{
              fontSize: 'clamp(4rem, 8vw, 7rem)',
              fontWeight: 900,
              lineHeight: 0.88,
              letterSpacing: '-0.06em',
              textShadow: '0 12px 24px rgba(26, 26, 26, 0.06)',
            }}
          >
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
                    opacity: slotVisual ? 1 : 0,
                    scale: slotVisual ? 1 : 0.72,
                    zIndex: slotVisual?.zIndex ?? 0,
                  }}
                  transition={{
                    x: SLOT_POSITION_TRANSITION,
                    opacity: SLOT_MOUNT_TRANSITION,
                    scale: SLOT_MOUNT_TRANSITION,
                  }}
                >
                  <div className="relative flex h-[100px] w-[110px] items-center justify-center sm:h-[130px] sm:w-[140px]">
                    <AnimatePresence initial={false} mode="sync">
                      {slotVisual ? (
                        <motion.div
                          key={slotVisual.key}
                          initial={
                            slotVisual.kind === 'letter'
                              ? { opacity: 0, scale: 0.85, y: 24 }
                              : { opacity: 0, scale: 0.88, y: 5 }
                          }
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, y: -3 }}
                          transition={
                            slotVisual.kind === 'letter'
                              ? { ...SLOT_MOUNT_TRANSITION, y: LETTER_BOUNCE_TRANSITION }
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
