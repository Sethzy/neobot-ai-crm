'use client';

import { useEffect, useState } from 'react'

export function useMediaQuery(query: string, fallback = false) {
  const [matches, setMatches] = useState(fallback)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQueryList = window.matchMedia(query)
    const onChange = () => setMatches(mediaQueryList.matches)

    onChange()
    mediaQueryList.addEventListener('change', onChange)
    return () => mediaQueryList.removeEventListener('change', onChange)
  }, [query])

  return matches
}
