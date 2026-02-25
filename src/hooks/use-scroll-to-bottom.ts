'use client';

/**
 * Hook for managing chat scroll behavior with sticky scroll pattern.
 * Auto-scrolls during streaming only when user is at bottom.
 * Stops auto-scrolling when user scrolls up to read.
 * @module hooks/use-scroll-to-bottom
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Threshold in pixels to consider "at bottom" - 100px buffer */
const BOTTOM_THRESHOLD = 100;

/** Debounce time in ms for detecting user scroll intent */
const SCROLL_DEBOUNCE_MS = 150;

/**
 * Manages scroll state and behavior for chat interfaces.
 * Provides refs for container and bottom sentinel, plus
 * state/functions for conditional auto-scrolling.
 */
export function useScrollToBottom() {
  /** Ref to the scrollable container element */
  const containerRef = useRef<HTMLDivElement>(null);

  /** Ref to the bottom sentinel element for scroll anchoring */
  const endRef = useRef<HTMLDivElement>(null);

  /** Reactive state for UI (button visibility) */
  const [isAtBottom, setIsAtBottom] = useState(true);

  /** Ref for instant checks within observers (avoids stale closure) */
  const isAtBottomRef = useRef(true);

  /** Tracks if user is actively scrolling (prevents auto-scroll fighting) */
  const isUserScrollingRef = useRef(false);

  /**
   * Checks if scroll position is within threshold of bottom.
   * Uses container's scroll metrics to calculate.
   */
  const checkIfAtBottom = useCallback((): boolean => {
    const container = containerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollTop + clientHeight >= scrollHeight - BOTTOM_THRESHOLD;
  }, []);

  /**
   * Scrolls the container to the absolute bottom.
   * @param behavior - 'smooth' for animated, 'instant' for immediate
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current;
      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });

      // Update state immediately for smooth UX
      setIsAtBottom(true);
      isAtBottomRef.current = true;
    },
    []
  );

  /**
   * Track user scroll events with debounce.
   * Detects manual scrolling to pause auto-scroll during streaming.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      // Mark as user scrolling immediately
      isUserScrollingRef.current = true;
      clearTimeout(scrollTimeout);

      // Check bottom position
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      isAtBottomRef.current = atBottom;

      // Clear user scrolling flag after debounce
      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, SCROLL_DEBOUNCE_MS);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [checkIfAtBottom]);

  /**
   * Auto-scroll on content changes using MutationObserver + ResizeObserver.
   * Only scrolls if user is at bottom and not actively scrolling.
   * Uses 'instant' behavior during streaming to avoid animation jank.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollIfNeeded = () => {
      // Only auto-scroll if:
      // 1. User is at bottom (hasn't scrolled up)
      // 2. User is not actively scrolling (prevents fighting)
      if (isAtBottomRef.current && !isUserScrollingRef.current) {
        requestAnimationFrame(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'instant', // No animation during streaming
          });
          setIsAtBottom(true);
          isAtBottomRef.current = true;
        });
      }
    };

    // Watch for DOM changes (new text tokens during streaming)
    const mutationObserver = new MutationObserver(scrollIfNeeded);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Watch for size changes (images loading, code blocks expanding)
    const resizeObserver = new ResizeObserver(scrollIfNeeded);
    resizeObserver.observe(container);

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return {
    /** Attach to the scrollable container element */
    containerRef,
    /** Attach to a sentinel div at the bottom of content */
    endRef,
    /** True when within threshold of bottom (for button visibility) */
    isAtBottom,
    /** Programmatically scroll to bottom */
    scrollToBottom,
  };
}
