'use client';

/**
 * Document processing animation using Remotion Player.
 * Embeds the Act4DocumentProcessing scene as a looping animation.
 */
import { useEffect, useRef, useState } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { Act4DocumentProcessing } from '@/components/remotion/Act4DocumentProcessing'

export function DocumentProcessingAnimation() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<PlayerRef>(null)
  const [isInView, setIsInView] = useState(true)
  const [isTabVisible, setIsTabVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden
  )

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      {
        threshold: 0.01,
        rootMargin: '200px 0px',
      }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsTabVisible(!document.hidden)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    if (isInView && isTabVisible) {
      player.play()
      return
    }

    player.pause()
  }, [isInView, isTabVisible])

  return (
    <div ref={wrapperRef}>
      <Player
        ref={playerRef}
        component={Act4DocumentProcessing}
        durationInFrames={242}
        fps={30}
        compositionWidth={1600}
        compositionHeight={650}
        style={{
          width: '100%',
        }}
        loop
        autoPlay
        acknowledgeRemotionLicense
      />
    </div>
  )
}
