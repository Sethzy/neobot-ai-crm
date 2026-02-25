'use client';

/**
 * Promo video component with muted autoplay and click-to-unmute overlay.
 * Video plays silently in background; clicking enables sound and controls.
 */
import { useState, useRef, useEffect } from 'react'
import { Play } from 'lucide-react'

export function PromoVideo() {
  const [hasInteracted, setHasInteracted] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [canAutoplay] = useState(() => {
    if (typeof window === 'undefined') return true
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean }
    }).connection
    return !prefersReducedMotion && !connection?.saveData
  })
  const videoRef = useRef<HTMLVideoElement>(null)

  // Only play while the video is near the viewport.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      { threshold: 0.4, rootMargin: '120px 0px 120px 0px' }
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  // Attempt autoplay only when visible and allowed.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isInView) {
      video.pause()
      return
    }

    if (!hasInteracted && canAutoplay) {
      video.play().catch(() => {
        // Autoplay blocked - user can start via overlay button.
      })
    }
  }, [canAutoplay, hasInteracted, isInView])

  const handleUnmute = () => {
    if (videoRef.current) {
      videoRef.current.muted = false
      videoRef.current.currentTime = 0 // Restart from beginning
      videoRef.current.play()
      setHasInteracted(true)
    }
  }

  const handleVideoEnd = () => {
    if (videoRef.current && !hasInteracted && canAutoplay && isInView) {
      // Loop silently if user hasn't interacted
      videoRef.current.currentTime = 0
      videoRef.current.play()
    }
  }

  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-2xl shadow-xl shadow-black/15">
      <video
        ref={videoRef}
        className="w-full aspect-video bg-zinc-100"
        poster="/exports/sunder-poster.jpg"
        preload="metadata"
        playsInline
        muted
        onEnded={handleVideoEnd}
        controls={hasInteracted}
      >
        <source src="/exports/neobot-demo-1080p.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Overlay - shown until user clicks to unmute */}
      {!hasInteracted && (
        <button
          onClick={handleUnmute}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/30 transition-colors hover:bg-black/40 group cursor-pointer focus:outline-none"
          aria-label="Watch demo with sound"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-xl ring-1 ring-black/5 transition-transform group-hover:scale-110 sm:h-20 sm:w-20">
            <Play className="h-6 w-6 text-sunder-green ml-1 sm:h-8 sm:w-8" fill="currentColor" />
          </div>
          <span className="mt-4 text-sm font-medium text-white sm:text-base">
            Watch 27s demo
          </span>
        </button>
      )}
    </div>
  )
}
