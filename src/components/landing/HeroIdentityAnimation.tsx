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
export const HERO_IDENTITY_STEP_DELAYS_MS = [260, 210, 210, 280, 280, 280] as const

const SLOT_MOUNT_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1] as const,
}

const SLOT_POSITION_TRANSITION = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 26,
  mass: 0.82,
}

const SEQUENCE: SequenceFrame[] = [
  {
    left: null,
    middle: null,
    right: null,
    glowOpacity: 0.12,
    glowScale: 0.88,
  },
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
  {
    left: null,
    middle: {
      kind: 'token',
      value: 'ai-blue',
      x: -30,
      zIndex: 2,
      key: 'ai-blue',
    },
    right: {
      kind: 'token',
      value: 'avatar',
      x: 30,
      zIndex: 1,
      key: 'avatar',
    },
    glowOpacity: 0.24,
    glowScale: 0.97,
  },
  {
    left: {
      kind: 'token',
      value: 'ai-green',
      x: -60,
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
      x: 60,
      zIndex: 1,
      key: 'avatar',
    },
    glowOpacity: 0.32,
    glowScale: 1,
  },
  {
    left: {
      kind: 'token',
      value: 'ai-green',
      x: -70,
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
      x: 70,
      zIndex: 2,
      key: 'avatar',
    },
    glowOpacity: 0.4,
    glowScale: 1.04,
  },
  {
    left: {
      kind: 'token',
      value: 'ai-green',
      x: -78,
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
      x: 76,
      zIndex: 4,
      key: 'O',
    },
    glowOpacity: 0.5,
    glowScale: 1.08,
  },
  {
    left: {
      kind: 'letter',
      value: 'N',
      x: -86,
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
      x: 82,
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
        fontSize: 'clamp(3rem, 5vw, 4.5rem)',
        fontWeight: 900,
        lineHeight: 0.88,
        letterSpacing: '-0.08em',
        textShadow: '0 14px 28px rgba(26, 26, 26, 0.08)',
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
    <div className="relative h-14 w-14 overflow-hidden rounded-full border-[3px] border-white bg-[#D8C3A5] shadow-[0_12px_30px_rgba(32,24,18,0.14)] sm:h-[3.9rem] sm:w-[3.9rem]">
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
      className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-white sm:h-[3.9rem] sm:w-[3.9rem]"
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
      className={`pointer-events-none relative flex min-h-[90px] items-center justify-center sm:min-h-[112px] ${className ?? ''}`}
    >
      <motion.div
        className="absolute h-20 w-56 rounded-full sm:h-24 sm:w-72"
        initial={false}
        animate={{
          opacity: activeFrame.glowOpacity,
          scale: activeFrame.glowScale,
        }}
        transition={{
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1],
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
              fontSize: 'clamp(3rem, 5vw, 4.5rem)',
              fontWeight: 900,
              lineHeight: 0.88,
              letterSpacing: '-0.08em',
              textShadow: '0 14px 28px rgba(26, 26, 26, 0.08)',
            }}
          >
            NEO
          </span>
        </div>
      ) : (
        <div className="relative h-[84px] w-[280px] sm:h-[100px] sm:w-[340px]">
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
                  <div className="relative flex h-[84px] w-[92px] items-center justify-center sm:h-[96px] sm:w-[104px]">
                    <AnimatePresence initial={false} mode="sync">
                      {slotVisual ? (
                        <motion.div
                          key={slotVisual.key}
                          initial={{ opacity: 0, scale: 0.82, y: 8, filter: 'blur(10px)' }}
                          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, scale: 0.82, y: -6, filter: 'blur(10px)' }}
                          transition={SLOT_MOUNT_TRANSITION}
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
