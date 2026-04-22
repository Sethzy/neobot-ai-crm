import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge needs to be told about the Tailwind v4 custom font-size
 * tokens we registered in globals.css (see `@theme inline` block). Without
 * this, it sees a class like `text-meta` and — because it does not match any
 * built-in size — assumes it is a color. Combining any of these with
 * `text-foreground` / `text-muted-foreground` inside `cn()` silently drops
 * the size utility, rendering that node at the inherited 16px body size.
 *
 * Keep this list in sync with the `--text-*` custom tokens in globals.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "caption",
            "meta",
            "body",
            "control",
            "toolbar",
            "page",
            "subhead",
            "title",
            "display",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
