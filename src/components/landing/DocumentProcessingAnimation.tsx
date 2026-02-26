'use client';

/**
 * Document processing animation rendered to video for lightweight playback.
 */
import { useEffect, useRef, useState } from 'react'

export function DocumentProcessingAnimation() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
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
    const video = videoRef.current
    if (!video) return

    if (isInView && isTabVisible) {
      const playPromise = video.play()
      if (playPromise) {
        playPromise.catch(() => {
          // Some browsers may block autoplay temporarily.
        })
      }
      return
    }

    video.pause()
  }, [isInView, isTabVisible])

  return (
    <div ref={wrapperRef} className="w-full aspect-[1600/650]">
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        muted
        loop
        autoPlay
        preload="auto"
      >
        <source src="/exports/document-processing-loop.mp4" type="video/mp4" />
      </video>
    </div>
  )
}
