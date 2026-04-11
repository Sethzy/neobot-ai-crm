/**
 * Color interpolation and spinner-frame utilities.
 * Ported verbatim from cc-src/components/Spinner/utils.ts with one change:
 * getDefaultCharacters() simplified to the Darwin path (no terminal branching
 * needed on web).
 * @module components/chat/spinner/utils
 */

export interface RGBColor {
  r: number
  g: number
  b: number
}

/**
 * The six spinner glyph characters used in forward + reverse animation.
 * Darwin path from cc-src — canonical set for the web.
 */
export function getDefaultCharacters(): string[] {
  return ['·', '✢', '✳', '✶', '✻', '✽']
}

/** Linearly interpolate between two RGB colors. t is in [0, 1]. */
export function interpolateColor(
  color1: RGBColor,
  color2: RGBColor,
  t: number,
): RGBColor {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * t),
    g: Math.round(color1.g + (color2.g - color1.g) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t),
  }
}

/** Convert an RGB object to a CSS `rgb(r,g,b)` color string. */
export function toRGBColor(color: RGBColor): string {
  return `rgb(${color.r},${color.g},${color.b})`
}

/**
 * Convert HSL hue (0–360) to RGB. Uses s=0.7, l=0.6 — the same parameters
 * CC uses for the animated asterisk sweep.
 */
export function hueToRgb(hue: number): RGBColor {
  const h = ((hue % 360) + 360) % 360
  const s = 0.7
  const l = 0.6
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) {
    r = c; g = x
  } else if (h < 120) {
    r = x; g = c
  } else if (h < 180) {
    g = c; b = x
  } else if (h < 240) {
    g = x; b = c
  } else if (h < 300) {
    r = x; b = c
  } else {
    r = c; b = x
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

const RGB_CACHE = new Map<string, RGBColor | null>()

/**
 * Parse an `rgb(r, g, b)` string into an RGBColor object.
 * Returns null if the string doesn't match. Result is cached.
 */
export function parseRGB(colorStr: string): RGBColor | null {
  const cached = RGB_CACHE.get(colorStr)
  if (cached !== undefined) return cached

  const match = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  const result = match
    ? {
        r: parseInt(match[1]!, 10),
        g: parseInt(match[2]!, 10),
        b: parseInt(match[3]!, 10),
      }
    : null
  RGB_CACHE.set(colorStr, result)
  return result
}
