import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats a snake_case tag ID as a human-readable label. */
export function formatTagLabel(tagId: string): string {
  return tagId.charAt(0).toUpperCase() + tagId.slice(1).replace(/_/g, " ");
}
