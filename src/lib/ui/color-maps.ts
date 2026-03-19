/**
 * Centralised color class maps for the Sunder design system.
 * All maps reference semantic (Layer 2) or domain (Layer 3) CSS tokens only —
 * never raw Tailwind palette classes like `amber-500` or `emerald-600`.
 *
 * Token layers are defined in `app/globals.css`:
 *   Layer 1: raw Flexoki accent vars (--flexoki-*)
 *   Layer 2: semantic tokens (--warning, --success, --info, --approval, --denied, --syntax-*)
 *   Layer 3: domain tokens (--stage-*, --status-*, --filetype-*)
 *
 * Dark mode is handled automatically via CSS variable swapping — no dark: prefixes needed.
 * @module lib/ui/color-maps
 */

import type { dealStageValues, crmTaskStatusValues } from "@/lib/crm/schemas";

/** Tone (background + text) classes for each deal stage. Uses Layer 3 stage tokens. */
export const DEAL_STAGE_TONE_CLASSES: Record<(typeof dealStageValues)[number], string> = {
  leads:       "bg-stage-leads/10 text-stage-leads",
  negotiation: "bg-stage-negotiation/10 text-stage-negotiation",
  offer:       "bg-stage-offer/10 text-stage-offer",
  closing:     "bg-stage-closing/10 text-stage-closing",
  lost:        "bg-stage-lost/10 text-stage-lost",
};

/** Top border classes for kanban column headers. Uses Layer 3 stage tokens. */
export const DEAL_STAGE_TOP_BORDER_CLASSES: Record<(typeof dealStageValues)[number], string> = {
  leads:       "border-t-stage-leads",
  negotiation: "border-t-stage-negotiation",
  offer:       "border-t-stage-offer",
  closing:     "border-t-stage-closing",
  lost:        "border-t-stage-lost",
};

/** Left border classes for deal cards. Uses Layer 3 stage tokens. */
export const DEAL_STAGE_LEFT_BORDER_CLASSES: Record<(typeof dealStageValues)[number], string> = {
  leads:       "border-l-stage-leads",
  negotiation: "border-l-stage-negotiation",
  offer:       "border-l-stage-offer",
  closing:     "border-l-stage-closing",
  lost:        "border-l-stage-lost",
};

/** Tone classes for task status badges. Uses Layer 3 status tokens. */
export const TASK_STATUS_TONE_CLASSES: Record<(typeof crmTaskStatusValues)[number], string> = {
  open:      "bg-status-open/10 text-status-open",
  completed: "bg-status-completed/10 text-status-completed",
};

/** Top border classes for task board columns. Uses Layer 3 status tokens. */
export const TASK_STATUS_TOP_BORDER_CLASSES: Record<(typeof crmTaskStatusValues)[number], string> = {
  open:      "border-t-status-open",
  completed: "border-t-status-completed",
};

/**
 * Avatar background + text colors, cycling through 8 Flexoki accents.
 * The initials stay on `text-foreground` to keep the tiny kanban avatars legible
 * in both light and dark mode while the tint still carries the accent meaning.
 */
export const AVATAR_COLORS = [
  "bg-stage-leads/20 text-foreground",
  "bg-stage-negotiation/20 text-foreground",
  "bg-stage-offer/20 text-foreground",
  "bg-stage-closing/20 text-foreground",
  "bg-stage-lost/20 text-foreground",
  "bg-status-open/20 text-foreground",
  "bg-filetype-presentation/20 text-foreground",
  "bg-filetype-document/20 text-foreground",
] as const;

/** File extension → icon color class. Uses Layer 3 filetype tokens. */
export const FILETYPE_COLOR_CLASSES: Record<string, string> = {
  xlsx: "text-filetype-spreadsheet",
  xls:  "text-filetype-spreadsheet",
  csv:  "text-filetype-spreadsheet",
  pdf:  "text-filetype-pdf",
  docx: "text-filetype-document",
  doc:  "text-filetype-document",
  pptx: "text-filetype-presentation",
  ppt:  "text-filetype-presentation",
};

/** File type label → icon wrapper background + text classes (for tools-dropdown). */
export const FILETYPE_ICON_CLASSES: Record<string, string> = {
  Spreadsheet:  "bg-filetype-spreadsheet/10 text-filetype-spreadsheet",
  PDF:          "bg-filetype-pdf/10 text-filetype-pdf",
  Document:     "bg-filetype-document/10 text-filetype-document",
  Presentation: "bg-filetype-presentation/10 text-filetype-presentation",
};

/** Market transaction type badge classes. */
export const MARKET_TRANSACTION_TYPE_TONE_CLASSES: Record<string, string> = {
  "New Sale": "bg-success/10 text-success",
  "Sub Sale": "bg-warning/10 text-warning",
  Resale: "bg-info/10 text-info",
  "Whole Rental": "bg-tag/10 text-tag",
  "Room Rental": "bg-stage-negotiation/10 text-stage-negotiation",
};

/** Market represented-party badge classes. */
export const MARKET_REPRESENTED_TONE_CLASSES: Record<string, string> = {
  Seller: "bg-success/10 text-success",
  Buyer: "bg-info/10 text-info",
  Landlord: "bg-warning/10 text-warning",
  Tenant: "bg-tag/10 text-tag",
};

/** HDB flat type badge classes. */
export const MARKET_HDB_FLAT_TYPE_TONE_CLASSES: Record<string, string> = {
  "1 ROOM": "bg-destructive/10 text-destructive",
  "2 ROOM": "bg-stage-negotiation/10 text-stage-negotiation",
  "3 ROOM": "bg-warning/10 text-warning",
  "4 ROOM": "bg-success/10 text-success",
  "5 ROOM": "bg-info/10 text-info",
  EXECUTIVE: "bg-tag/10 text-tag",
  "MULTI-GENERATION": "bg-chart-4/10 text-chart-4",
};
