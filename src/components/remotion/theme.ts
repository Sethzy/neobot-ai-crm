/**
 * Theme configuration for Remotion animations.
 */

export const springs = {
  smooth: { damping: 200 },
  snappy: { damping: 20, stiffness: 200 },
  bouncy: { damping: 8, stiffness: 100 },
  heavy: { damping: 15, stiffness: 80, mass: 2 },
} as const
