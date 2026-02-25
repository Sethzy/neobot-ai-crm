import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a tag ID for display by replacing underscores with spaces
 * and capitalizing each word.
 * @example formatTagLabel("medical_expense") // "Medical Expense"
 */
export function formatTagLabel(tag: string): string {
  return tag.split("_").map((word) =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(" ");
}
