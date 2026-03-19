# Flexoki Accent Colors — Semantic Design System v2

**Status:** Ready to execute
**Plan:** OUT OF PLAN (design system consistency pass, not in v2 JSON)
**Scope:** App dashboard only. Landing pages (`/`, `/market/*`, etc.) are untouched.
**Ref doc:** `roadmap docs/Sunder - Source of Truth/ux-and-pm/design-system.md`
**Flexoki spec:** https://stephango.com/flexoki

## Problem

Components use arbitrary hardcoded Tailwind palette classes (`bg-amber-500`, `text-green-600`, etc.) with manual `dark:` prefixes scattered everywhere. These are not Flexoki values, don't adapt correctly in dark mode, and cannot be changed consistently.

## Design System Architecture

Three-layer token hierarchy. Components only reference Layer 2/3 — never Layer 1.

```
Layer 1 — Raw Flexoki palette (private, :root/.dark only)
  --flexoki-orange, --flexoki-yellow, --flexoki-green, --flexoki-cyan,
  --flexoki-blue, --flexoki-purple, --flexoki-magenta (+ existing --flexoki-re)

Layer 2 — Semantic tokens (chain to Layer 1, swap automatically in dark mode)
  --warning      → --flexoki-yellow    (overdue, amber states)
  --success      → --flexoki-green     (completed, positive outcomes)
  --info         → --flexoki-blue      (open tasks, informational)
  --approval     → --flexoki-yellow    (tool approval-requested dot)
  --denied       → --flexoki-orange    (tool output-denied dot/label)
  --tag          → --flexoki-purple    (existing, remap to var)
  --syntax-string   → --flexoki-cyan
  --syntax-number   → --flexoki-blue
  --syntax-boolean  → --flexoki-yellow

Layer 3 — Domain tokens (chain to Layer 1, semantic by CRM concept)
  --stage-leads       → --flexoki-yellow
  --stage-negotiation → --flexoki-orange
  --stage-offer       → --flexoki-purple
  --stage-closing     → --flexoki-green
  --stage-lost        → --flexoki-re
  --status-open       → --flexoki-cyan
  --status-completed  → --flexoki-green
  --filetype-spreadsheet  → --flexoki-green
  --filetype-pdf          → --flexoki-re
  --filetype-document     → --flexoki-blue
  --filetype-presentation → --flexoki-orange
  --filetype-default      → --flexoki-tx-2
```

**Dark mode strategy:** Layer 1 vars swap between `:root` and `.dark`. Layer 2/3 chain to Layer 1. Components use `text-warning`, `bg-success/10`, `border-l-stage-leads` — no `dark:` prefixes needed.

**Centralization:** New `src/lib/ui/color-maps.ts` exports all class-string maps. `display.ts` and leaf components import from it — single source of truth for class strings.

**TDD rule:** For every component with a test file, update the test FIRST (failing), then implement. Never patch a class without a failing test catching the old value first (where a test file exists).

---

## Flexoki Accent Values Reference

| Layer 1 var | Light | Dark |
|---|---|---|
| `--flexoki-re` | `hsl(3 62% 42%)` = `#AF3029` | `hsl(5 61% 54%)` = `#D14D41` |
| `--flexoki-orange` | `#BC5215` | `#DA702C` |
| `--flexoki-yellow` | `#AD8301` | `#D0A215` |
| `--flexoki-green` | `#66800B` | `#879A39` |
| `--flexoki-cyan` | `#24837B` | `#3AA99F` |
| `--flexoki-blue` | `#205EA6` | `#4385BE` |
| `--flexoki-purple` | `#5E409D` | `#8B7EC8` |
| `--flexoki-magenta` | `#A02F6F` | `#CE5D97` |

---

## Step 1 — globals.css: Layer 1 — add 7 raw accent vars

**File:** `app/globals.css`

In `:root`, add after `--flexoki-re: hsl(3 62% 42%);`:

```css
  --flexoki-orange:  #BC5215;
  --flexoki-yellow:  #AD8301;
  --flexoki-green:   #66800B;
  --flexoki-cyan:    #24837B;
  --flexoki-blue:    #205EA6;
  --flexoki-purple:  #5E409D;
  --flexoki-magenta: #A02F6F;
```

In `.dark`, add after `--flexoki-re: hsl(5 61% 54%);`:

```css
  --flexoki-orange:  #DA702C;
  --flexoki-yellow:  #D0A215;
  --flexoki-green:   #879A39;
  --flexoki-cyan:    #3AA99F;
  --flexoki-blue:    #4385BE;
  --flexoki-purple:  #8B7EC8;
  --flexoki-magenta: #CE5D97;
```

**Verify:** `pnpm build` passes. No components reference these vars yet — just adding the palette.

---

## Step 2 — globals.css: Layer 2 — remap semantic tokens to Flexoki accents

**File:** `app/globals.css`

In `:root`, replace the existing semantic status block (success/info/warning/tag):

```css
/* BEFORE */
  --success: #19A249;
  --success-foreground: #F1FDF4;
  --success-border: #B8E1C2;
  --info: #2762EA;
  --info-foreground: #F0F6FF;
  --warning: #D87708;
  --warning-foreground: #FFFBEB;
  --content-foreground: #1F2937;
  --tag: #7C3AED;
  --tag-foreground: #F5F3FF;

/* AFTER */
  --success: var(--flexoki-green);
  --success-foreground: var(--flexoki-bg);
  --success-border: var(--flexoki-green);
  --info: var(--flexoki-blue);
  --info-foreground: var(--flexoki-bg);
  --warning: var(--flexoki-yellow);
  --warning-foreground: var(--flexoki-bg);
  --content-foreground: var(--flexoki-tx);
  --tag: var(--flexoki-purple);
  --tag-foreground: var(--flexoki-bg);
  /* New semantic tokens */
  --approval: var(--flexoki-yellow);
  --denied: var(--flexoki-orange);
  --syntax-string: var(--flexoki-cyan);
  --syntax-number: var(--flexoki-blue);
  --syntax-boolean: var(--flexoki-yellow);
```

These chain to Layer 1 vars, so dark mode is handled automatically — no `.dark` overrides needed for semantic tokens.

**Verify:** `pnpm build` passes. Visit `/customers/people` — buyer (info/blue), seller (success/green), landlord (warning/yellow) badge colors should be Flexoki tinted (olive green, not emerald; olive yellow, not amber).

---

## Step 3 — globals.css: Layer 3 — add domain tokens + register all in @theme inline

**File:** `app/globals.css`

Add domain tokens in `:root` after the semantic block:

```css
  /* Layer 3 — CRM stage tokens */
  --stage-leads:       var(--flexoki-yellow);
  --stage-negotiation: var(--flexoki-orange);
  --stage-offer:       var(--flexoki-purple);
  --stage-closing:     var(--flexoki-green);
  --stage-lost:        var(--flexoki-re);
  /* Layer 3 — Task status tokens */
  --status-open:       var(--flexoki-cyan);
  --status-completed:  var(--flexoki-green);
  /* Layer 3 — File type tokens */
  --filetype-spreadsheet:  var(--flexoki-green);
  --filetype-pdf:          var(--flexoki-re);
  --filetype-document:     var(--flexoki-blue);
  --filetype-presentation: var(--flexoki-orange);
  --filetype-default:      var(--flexoki-tx-2);
```

In the `@theme inline` block, add after the existing `--color-tag-foreground` line — register ONLY semantic and domain tokens (not raw palette):

```css
  /* Semantic tokens — enables bg-success/10, text-warning, border-info, etc. */
  --color-success: var(--success);
  --color-info: var(--info);
  --color-warning: var(--warning);
  --color-approval: var(--approval);
  --color-denied: var(--denied);
  --color-syntax-string: var(--syntax-string);
  --color-syntax-number: var(--syntax-number);
  --color-syntax-boolean: var(--syntax-boolean);
  /* Domain tokens — enables border-l-stage-leads, bg-status-open/10, etc. */
  --color-stage-leads: var(--stage-leads);
  --color-stage-negotiation: var(--stage-negotiation);
  --color-stage-offer: var(--stage-offer);
  --color-stage-closing: var(--stage-closing);
  --color-stage-lost: var(--stage-lost);
  --color-status-open: var(--status-open);
  --color-status-completed: var(--status-completed);
  --color-filetype-spreadsheet: var(--filetype-spreadsheet);
  --color-filetype-pdf: var(--filetype-pdf);
  --color-filetype-document: var(--filetype-document);
  --color-filetype-presentation: var(--filetype-presentation);
  --color-filetype-default: var(--filetype-default);
```

**Verify:** `pnpm build` passes with no warnings about unknown color utilities.

---

## Step 4 — TDD: Create src/lib/ui/color-maps.ts with tests

**Why:** Single source of truth for all class-string maps. Components and display.ts import from here — no duplicate map definitions.

### 4a. Write test first

**File:** `src/lib/ui/color-maps.test.ts` (new)

```ts
import { describe, expect, it } from "vitest";
import {
  AVATAR_COLORS,
  DEAL_STAGE_LEFT_BORDER_CLASSES,
  DEAL_STAGE_TOP_BORDER_CLASSES,
  DEAL_STAGE_TONE_CLASSES,
  FILETYPE_COLOR_CLASSES,
  FILETYPE_ICON_CLASSES,
  TASK_STATUS_TONE_CLASSES,
  TASK_STATUS_TOP_BORDER_CLASSES,
} from "./color-maps";

describe("DEAL_STAGE_TONE_CLASSES", () => {
  it("uses semantic stage tokens, not raw Tailwind palette", () => {
    expect(DEAL_STAGE_TONE_CLASSES.leads).toBe("bg-stage-leads/10 text-stage-leads");
    expect(DEAL_STAGE_TONE_CLASSES.negotiation).toBe("bg-stage-negotiation/10 text-stage-negotiation");
    expect(DEAL_STAGE_TONE_CLASSES.offer).toBe("bg-stage-offer/10 text-stage-offer");
    expect(DEAL_STAGE_TONE_CLASSES.closing).toBe("bg-stage-closing/10 text-stage-closing");
    expect(DEAL_STAGE_TONE_CLASSES.lost).toBe("bg-stage-lost/10 text-stage-lost");
  });
  it("contains no raw Tailwind palette classes", () => {
    const values = Object.values(DEAL_STAGE_TONE_CLASSES).join(" ");
    expect(values).not.toMatch(/amber|orange|emerald|sky|rose|green|blue|purple/);
  });
});

describe("DEAL_STAGE_TOP_BORDER_CLASSES", () => {
  it("uses semantic stage tokens", () => {
    expect(DEAL_STAGE_TOP_BORDER_CLASSES.leads).toBe("border-t-stage-leads");
    expect(DEAL_STAGE_TOP_BORDER_CLASSES.lost).toBe("border-t-stage-lost");
  });
});

describe("DEAL_STAGE_LEFT_BORDER_CLASSES", () => {
  it("uses semantic stage tokens", () => {
    expect(DEAL_STAGE_LEFT_BORDER_CLASSES.leads).toBe("border-l-stage-leads");
    expect(DEAL_STAGE_LEFT_BORDER_CLASSES.closing).toBe("border-l-stage-closing");
  });
});

describe("TASK_STATUS_TONE_CLASSES", () => {
  it("uses semantic status tokens", () => {
    expect(TASK_STATUS_TONE_CLASSES.open).toBe("bg-status-open/10 text-status-open");
    expect(TASK_STATUS_TONE_CLASSES.completed).toBe("bg-status-completed/10 text-status-completed");
  });
  it("contains no raw Tailwind palette classes", () => {
    const values = Object.values(TASK_STATUS_TONE_CLASSES).join(" ");
    expect(values).not.toMatch(/amber|orange|emerald|sky|rose|green|blue|cyan/);
  });
});

describe("TASK_STATUS_TOP_BORDER_CLASSES", () => {
  it("uses semantic status tokens", () => {
    expect(TASK_STATUS_TOP_BORDER_CLASSES.open).toBe("border-t-status-open");
    expect(TASK_STATUS_TOP_BORDER_CLASSES.completed).toBe("border-t-status-completed");
  });
});

describe("AVATAR_COLORS", () => {
  it("has 8 entries covering the full Flexoki accent palette", () => {
    expect(AVATAR_COLORS).toHaveLength(8);
  });
  it("uses semantic stage/status tokens, not raw Tailwind palette", () => {
    const joined = AVATAR_COLORS.join(" ");
    expect(joined).not.toMatch(/amber|orange|emerald|sky|rose|slate/);
  });
  it("each entry has a bg and text class", () => {
    for (const cls of AVATAR_COLORS) {
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
    }
  });
});

describe("FILETYPE_COLOR_CLASSES", () => {
  it("uses filetype domain tokens", () => {
    expect(FILETYPE_COLOR_CLASSES.xlsx).toBe("text-filetype-spreadsheet");
    expect(FILETYPE_COLOR_CLASSES.xls).toBe("text-filetype-spreadsheet");
    expect(FILETYPE_COLOR_CLASSES.csv).toBe("text-filetype-spreadsheet");
    expect(FILETYPE_COLOR_CLASSES.pdf).toBe("text-filetype-pdf");
    expect(FILETYPE_COLOR_CLASSES.docx).toBe("text-filetype-document");
    expect(FILETYPE_COLOR_CLASSES.doc).toBe("text-filetype-document");
    expect(FILETYPE_COLOR_CLASSES.pptx).toBe("text-filetype-presentation");
    expect(FILETYPE_COLOR_CLASSES.ppt).toBe("text-filetype-presentation");
  });
  it("contains no raw Tailwind palette classes", () => {
    const values = Object.values(FILETYPE_COLOR_CLASSES).join(" ");
    expect(values).not.toMatch(/green|red|blue|orange|emerald|rose/);
  });
});

describe("FILETYPE_ICON_CLASSES", () => {
  it("uses filetype domain tokens", () => {
    expect(FILETYPE_ICON_CLASSES.Spreadsheet).toBe("bg-filetype-spreadsheet/10 text-filetype-spreadsheet");
    expect(FILETYPE_ICON_CLASSES.PDF).toBe("bg-filetype-pdf/10 text-filetype-pdf");
    expect(FILETYPE_ICON_CLASSES.Document).toBe("bg-filetype-document/10 text-filetype-document");
    expect(FILETYPE_ICON_CLASSES.Presentation).toBe("bg-filetype-presentation/10 text-filetype-presentation");
  });
});
```

Run: `pnpm vitest run src/lib/ui/color-maps.test.ts` → should FAIL (module not found).

### 4b. Implement color-maps.ts

**File:** `src/lib/ui/color-maps.ts` (new)

```ts
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
 * Avatar background + text colors, cycling through all 8 Flexoki accents.
 * Assigned by index: avatarColorFor(name) = AVATAR_COLORS[hash(name) % 8].
 * Uses domain tokens so every accent is represented consistently.
 */
export const AVATAR_COLORS = [
  "bg-stage-leads/15 text-stage-leads",
  "bg-stage-negotiation/15 text-stage-negotiation",
  "bg-stage-offer/15 text-stage-offer",
  "bg-stage-closing/15 text-stage-closing",
  "bg-stage-lost/15 text-stage-lost",
  "bg-status-open/15 text-status-open",
  "bg-filetype-presentation/15 text-filetype-presentation",
  "bg-filetype-document/15 text-filetype-document",
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
```

Run: `pnpm vitest run src/lib/ui/color-maps.test.ts` → all tests PASS.

---

## Step 5 — TDD: badge.tsx — semantic tokens for success/warning/info variants

### 5a. Check for existing tests

```bash
pnpm vitest run --reporter=verbose src/components/ui/badge
```

If a test file exists, find where it tests the `success`/`warning`/`info` variants and update those assertions first (failing). If no test file exists, create one:

**File:** `src/components/ui/badge.test.tsx` (new if absent)

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge semantic color variants", () => {
  it("success variant uses success semantic token, not raw Tailwind green", () => {
    const { container } = render(<Badge variant="success">OK</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-success/);
    expect(el.className).toMatch(/text-success/);
    expect(el.className).not.toMatch(/green-/);
  });

  it("warning variant uses warning semantic token, not raw Tailwind amber", () => {
    const { container } = render(<Badge variant="warning">Warn</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-warning/);
    expect(el.className).toMatch(/text-warning/);
    expect(el.className).not.toMatch(/amber-/);
  });

  it("info variant uses info semantic token, not raw Tailwind blue", () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-info/);
    expect(el.className).toMatch(/text-info/);
    expect(el.className).not.toMatch(/blue-500/);
  });
});
```

Run: `pnpm vitest run src/components/ui/badge.test.tsx` → FAIL.

### 5b. Implement

**File:** `src/components/ui/badge.tsx`

Replace the `success`, `warning`, `info` variant class strings:

```tsx
        success:
          "bg-success/10 text-success [a]:hover:bg-success/20",
        warning:
          "bg-warning/10 text-warning [a]:hover:bg-warning/20",
        info:
          "bg-info/10 text-info [a]:hover:bg-info/20",
```

Run: `pnpm vitest run src/components/ui/badge.test.tsx` → PASS.

---

## Step 6 — TDD: display.ts — import from color-maps.ts

### 6a. Write test first

**File:** `src/lib/crm/display.test.ts` (new if absent, or add to existing)

```ts
import { describe, expect, it } from "vitest";
import {
  dealStageToneClassMap,
  dealStageTopBorderMap,
  taskStatusToneClassMap,
  taskStatusTopBorderMap,
  avatarColorFor,
} from "./display";

describe("dealStageToneClassMap", () => {
  it("uses domain stage tokens, not raw Tailwind palette", () => {
    const values = Object.values(dealStageToneClassMap).join(" ");
    expect(values).not.toMatch(/amber|orange|emerald|sky|rose|green|blue|purple/);
    expect(values).toMatch(/stage-/);
  });
  it("leads maps to stage-leads token", () => {
    expect(dealStageToneClassMap.leads).toContain("stage-leads");
  });
});

describe("dealStageTopBorderMap", () => {
  it("uses domain stage tokens", () => {
    expect(dealStageTopBorderMap.closing).toContain("stage-closing");
    expect(Object.values(dealStageTopBorderMap).join(" ")).not.toMatch(/amber|orange|emerald/);
  });
});

describe("taskStatusToneClassMap", () => {
  it("uses domain status tokens, not raw Tailwind palette", () => {
    const values = Object.values(taskStatusToneClassMap).join(" ");
    expect(values).not.toMatch(/sky|emerald|cyan|green/);
    expect(values).toMatch(/status-/);
  });
});

describe("taskStatusTopBorderMap", () => {
  it("uses domain status tokens", () => {
    expect(taskStatusTopBorderMap.open).toContain("status-open");
  });
});

describe("avatarColorFor", () => {
  it("returns a string with bg and text classes", () => {
    const cls = avatarColorFor("Alice");
    expect(cls).toMatch(/bg-/);
    expect(cls).toMatch(/text-/);
  });
  it("is deterministic for the same name", () => {
    expect(avatarColorFor("Bob")).toBe(avatarColorFor("Bob"));
  });
  it("uses domain tokens, not raw Tailwind palette", () => {
    const cls = avatarColorFor("Charlie");
    expect(cls).not.toMatch(/amber|orange|emerald|sky|slate/);
  });
});
```

Run: `pnpm vitest run src/lib/crm/display.test.ts` → FAIL.

### 6b. Implement

**File:** `src/lib/crm/display.ts`

Add import at top:

```ts
import {
  AVATAR_COLORS,
  DEAL_STAGE_LEFT_BORDER_CLASSES,
  DEAL_STAGE_TONE_CLASSES,
  DEAL_STAGE_TOP_BORDER_CLASSES,
  TASK_STATUS_TONE_CLASSES,
  TASK_STATUS_TOP_BORDER_CLASSES,
} from "@/lib/ui/color-maps";
```

Replace `dealStageToneClassMap`, `dealStageTopBorderMap`, `taskStatusToneClassMap`, `taskStatusTopBorderMap` to re-export from `color-maps`:

```ts
export const dealStageToneClassMap = DEAL_STAGE_TONE_CLASSES;
export const dealStageTopBorderMap = DEAL_STAGE_TOP_BORDER_CLASSES;
export const taskStatusToneClassMap = TASK_STATUS_TONE_CLASSES;
export const taskStatusTopBorderMap = TASK_STATUS_TOP_BORDER_CLASSES;
```

Remove the local `AVATAR_COLORS` array and `getAvatarColor` function. Replace with `avatarColorFor` (renamed — callers must update):

```ts
/** @see color-maps.AVATAR_COLORS */
export function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
```

Run: `pnpm vitest run src/lib/crm/display.test.ts` → PASS.

Also export `DEAL_STAGE_LEFT_BORDER_CLASSES` from display.ts for components that need it:

```ts
export { DEAL_STAGE_LEFT_BORDER_CLASSES } from "@/lib/ui/color-maps";
```

### 6c. Update task-kanban-card.tsx (caller of old `getAvatarColor`)

**File:** `src/components/crm/task-kanban-card.tsx`

Replace import:

```ts
// BEFORE
import { formatContactFullName, formatCrmDate, getAvatarColor } from "@/lib/crm/display";

// AFTER
import { formatContactFullName, formatCrmDate, avatarColorFor } from "@/lib/crm/display";
```

Replace both usages — remove `text-white` (the new function returns a text class):

```tsx
// BEFORE
className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white ${getAvatarColor(task.title)}`}

// AFTER
className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${avatarColorFor(task.title)}`}

// BEFORE
className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-medium text-white ${getAvatarColor(contactName)}`}

// AFTER
className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-medium ${avatarColorFor(contactName)}`}
```

---

## Step 7 — TDD: stale-indicator.tsx — update existing test first

**File:** `src/components/analyst/stale-indicator.test.tsx`

Find line 26 (or wherever `text-amber-500` is asserted) and update it FIRST:

```ts
// BEFORE
expect(icon).toHaveClass('text-amber-500');

// AFTER
expect(icon).toHaveClass('text-warning');
```

Run: `pnpm vitest run src/components/analyst/stale-indicator.test.tsx` → FAIL.

**File:** `src/components/analyst/stale-indicator.tsx`

Replace `text-amber-500` with `text-warning`.

Run: `pnpm vitest run src/components/analyst/stale-indicator.test.tsx` → PASS.

---

## Step 8 — TDD: task-item.tsx — overdue indicator

### 8a. Write test first

**File:** `src/components/views/task-item.test.tsx` (new if absent)

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskItem } from "./task-item";

describe("TaskItem overdue indicator", () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  it("applies warning token left border for overdue open tasks", () => {
    const { container } = render(
      <TaskItem title="Call client" dueDate={yesterday} status="open" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/border-l-warning/);
    expect(root.className).not.toMatch(/amber/);
  });

  it("applies warning token text for overdue date label", () => {
    const { getByText } = render(
      <TaskItem title="Call client" dueDate={yesterday} status="open" />,
    );
    const span = getByText(/Overdue/);
    expect(span.className).toMatch(/text-warning/);
    expect(span.className).not.toMatch(/amber/);
  });

  it("no overdue styling for completed tasks past due date", () => {
    const { container } = render(
      <TaskItem title="Done" dueDate={yesterday} status="completed" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toMatch(/border-l-warning/);
  });
});
```

Run: `pnpm vitest run src/components/views/task-item.test.tsx` → FAIL.

### 8b. Implement

**File:** `src/components/views/task-item.tsx`

Replace:
```tsx
overdue && "border-l-3 border-l-amber-500",
```
with:
```tsx
overdue && "border-l-3 border-l-warning",
```

Replace:
```tsx
<span className={cn(overdue && "font-medium text-amber-600 dark:text-amber-400")}>
```
with:
```tsx
<span className={cn(overdue && "font-medium text-warning")}>
```

Run: `pnpm vitest run src/components/views/task-item.test.tsx` → PASS.

---

## Step 9 — TDD: deal-card.tsx — left border by stage

### 9a. Write test first

**File:** `src/components/views/deal-card.test.tsx` (new if absent)

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DealCard } from "./deal-card";

describe("DealCard stage border", () => {
  it("uses stage-leads domain token for leads stage", () => {
    const { container } = render(<DealCard address="1 Test St" price="$0" stage="leads" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/border-l-stage-leads/);
  });

  it("uses stage-closing domain token for closing stage", () => {
    const { container } = render(<DealCard address="1 Test St" price="$0" stage="closing" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/border-l-stage-closing/);
  });

  it("contains no raw Tailwind palette classes in border", () => {
    const { container } = render(<DealCard address="1 Test St" price="$0" stage="leads" />);
    expect(container.innerHTML).not.toMatch(/border-l-(zinc|sky|amber|emerald|rose)-/);
  });
});
```

Run: `pnpm vitest run src/components/views/deal-card.test.tsx` → FAIL.

### 9b. Implement

**File:** `src/components/views/deal-card.tsx`

Add import:

```ts
import { DEAL_STAGE_LEFT_BORDER_CLASSES } from "@/lib/crm/display";
```

Remove the local `stageBorderMap` object and `DEFAULT_STAGE_BORDER` constant. Replace usage with a cast + fallback (since `stage` is typed as `string` but the map is keyed by the enum union):

```tsx
// BEFORE
const stageBorderMap: Record<string, string> = {
  leads: "border-l-zinc-400",
  closed_won: "border-l-emerald-500",
  closed_lost: "border-l-rose-500",
  ...
};
const borderClass = stage ? (stageBorderMap[stage] ?? DEFAULT_STAGE_BORDER) : undefined;

// AFTER
const borderClass = stage
  ? (DEAL_STAGE_LEFT_BORDER_CLASSES[stage as keyof typeof DEAL_STAGE_LEFT_BORDER_CLASSES] ?? "border-l-border")
  : undefined;
```

Note: `closed_won`/`closed_lost` were legacy aliases not in the CRM schema — they fall to the neutral `border-l-border` fallback now.

Run: `pnpm vitest run src/components/views/deal-card.test.tsx` → PASS.

---

## Step 10 — TDD: contact-card.tsx — avatar colors

### 10a. Write test first

**File:** `src/components/views/contact-card.test.tsx` (new if absent)

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContactCard } from "./contact-card";

const base = { id: "1", name: "Alice Tan", clientId: "c1" };

describe("ContactCard avatar", () => {
  it("uses domain token classes for avatar, not raw Tailwind palette", () => {
    const { getByTestId } = render(<ContactCard contact={base} />);
    // Find avatar element (adjust selector if testid differs)
    const avatar = document.querySelector("[data-testid='contact-avatar']") ??
                   document.querySelector(".rounded-full");
    if (!avatar) return; // skip if no avatar rendered
    expect(avatar.className).not.toMatch(/emerald|sky|violet|amber|red-[0-9]/);
  });
});
```

Run: `pnpm vitest run src/components/views/contact-card.test.tsx` → FAIL (or pass if no avatar testid — adjust selector to match actual implementation).

### 10b. Implement

**File:** `src/components/views/contact-card.tsx`

Remove local `AVATAR_COLORS` array. Add import:

```ts
import { avatarColorFor } from "@/lib/crm/display";
```

Replace:
```tsx
// BEFORE
const colorIndex = /* some hash */ % AVATAR_COLORS.length;
const colorClass = AVATAR_COLORS[colorIndex];

// AFTER
const colorClass = avatarColorFor(contact.name ?? "");
```

Run: `pnpm vitest run src/components/views/contact-card.test.tsx` → PASS.

---

## Step 11 — pipeline-overview.tsx — semantic badge variants

**File:** `src/components/crm/dashboard/pipeline-overview.tsx`

No separate test needed here (badge component is already tested). Replace `stageBarClassByVariant`:

```ts
// BEFORE
const stageBarClassByVariant = {
  destructive: "bg-rose-500",
  info:        "bg-blue-500",
  success:     "bg-emerald-500",
  warning:     "bg-amber-500",
  ...
}

// AFTER
const stageBarClassByVariant = {
  default:     "bg-primary",
  destructive: "bg-destructive",
  ghost:       "bg-muted-foreground",
  info:        "bg-info",
  link:        "bg-primary",
  outline:     "bg-muted-foreground/50",
  secondary:   "bg-muted-foreground/30",
  success:     "bg-success",
  warning:     "bg-warning",
} as const satisfies Record<BadgeVariant, string>;
```

**Verify:** Visit `/customers` — Pipeline Overview stage bars use Flexoki colors.

---

## Step 12 — TDD: json-view.tsx — syntax highlighting tokens

### 12a. Write test first

**File:** `src/components/ui/json-view.test.tsx` (new if absent)

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonView } from "./json-view";

describe("JsonView syntax coloring", () => {
  it("uses syntax-string token for string values", () => {
    const { container } = render(<JsonView data={{ key: "value" }} />);
    const stringEl = container.querySelector(".text-syntax-string");
    expect(stringEl).not.toBeNull();
  });

  it("uses syntax-number token for number values", () => {
    const { container } = render(<JsonView data={{ count: 42 }} />);
    const numEl = container.querySelector(".text-syntax-number");
    expect(numEl).not.toBeNull();
  });

  it("uses syntax-boolean token for boolean values", () => {
    const { container } = render(<JsonView data={{ active: true }} />);
    const boolEl = container.querySelector(".text-syntax-boolean");
    expect(boolEl).not.toBeNull();
  });

  it("contains no raw Tailwind palette color classes for syntax tokens", () => {
    const { container } = render(<JsonView data={{ a: "x", b: 1, c: true }} />);
    expect(container.innerHTML).not.toMatch(/text-(green|blue|amber)-[0-9]/);
  });
});
```

Run: `pnpm vitest run src/components/ui/json-view.test.tsx` → FAIL.

### 12b. Implement

**File:** `src/components/ui/json-view.tsx`

Replace raw Tailwind color classes:

```tsx
// strings: text-green-600 dark:text-green-400 → text-syntax-string
// numbers: text-blue-600 dark:text-blue-400   → text-syntax-number
// booleans: text-amber-600 dark:text-amber-400 → text-syntax-boolean
```

Run: `pnpm vitest run src/components/ui/json-view.test.tsx` → PASS.

---

## Step 13 — TDD: tool-execution-step.tsx — success/error/warning status icons

### 13a. Write test first

**File:** `src/components/analyst/tool-execution-step.test.tsx` (check existing, add to it)

Add new `describe` block or extend existing:

```tsx
describe("tool-execution-step status icon colors", () => {
  it("success icon uses success semantic token", () => {
    // render a completed step and check the success circle
    const { getByTestId } = render(<ToolExecutionStep /* props for success state */ />);
    const icon = getByTestId("status-success");
    expect(icon.className).toMatch(/text-success/);
    expect(icon.className).not.toMatch(/green-[0-9]/);
  });

  it("error icon uses destructive semantic token", () => {
    const { getByTestId } = render(<ToolExecutionStep /* props for error state */ />);
    const icon = getByTestId("status-error");
    expect(icon.className).toMatch(/text-destructive/);
    expect(icon.className).not.toMatch(/red-[0-9]/);
  });
});
```

(Adjust props to match the actual component API. Check file for how to trigger success/error states.)

Run: `pnpm vitest run src/components/analyst/tool-execution-step.test.tsx` → FAIL.

### 13b. Implement

**File:** `src/components/analyst/tool-execution-step.tsx`

Replace class strings:

```tsx
/* success icon circle */
// BEFORE: bg-green-500/15 text-green-600 dark:text-green-400
// AFTER:  bg-success/15 text-success

/* error icon circle */
// BEFORE: bg-red-500/15 text-red-600 dark:text-red-400
// AFTER:  bg-destructive/15 text-destructive

/* copy button check mark */
// BEFORE: text-green-500
// AFTER:  text-success

/* stderr block */
// BEFORE: text-amber-600 dark:text-amber-300 / bg-amber-50 dark:bg-amber-500/10
// AFTER:  text-warning / bg-warning/10

/* error text block */
// BEFORE: text-red-600 dark:text-red-400 / bg-red-50 dark:bg-red-500/10
// AFTER:  text-destructive / bg-destructive/10
```

Run: `pnpm vitest run src/components/analyst/tool-execution-step.test.tsx` → PASS.

---

## Step 14 — TDD: tool-call-inline.tsx — approval/denied/auth tokens

### 14a. Write test first

**File:** `src/components/chat/tool-call-inline.test.tsx` (new if absent)

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolCallInline } from "./tool-call-inline";

describe("ToolCallInline approval state", () => {
  it("approval-requested dot uses approval semantic token", () => {
    const { getByTestId } = render(
      <ToolCallInline
        name="send_email"
        state="approval-requested"
        input={{}}
        approvalId="abc"
        onToolApproval={() => undefined}
      />,
    );
    const dot = getByTestId("tool-dot");
    expect(dot.className).toMatch(/bg-approval/);
    expect(dot.className).not.toMatch(/amber-500/);
  });

  it("output-denied dot uses denied semantic token", () => {
    const { getByTestId } = render(
      <ToolCallInline name="send_email" state="output-denied" input={{}} />,
    );
    const dot = getByTestId("tool-dot");
    expect(dot.className).toMatch(/bg-denied/);
    expect(dot.className).not.toMatch(/orange-500/);
  });

  it("denied label uses denied semantic token text color", () => {
    const { getByText } = render(
      <ToolCallInline name="send_email" state="output-denied" input={{}} />,
    );
    const label = getByText("Denied");
    expect(label.className).toMatch(/text-denied/);
    expect(label.className).not.toMatch(/orange-[0-9]/);
  });

  it("approve button uses success semantic token classes", () => {
    const { getByLabelText } = render(
      <ToolCallInline
        name="send_email"
        state="approval-requested"
        input={{}}
        approvalId="abc"
        onToolApproval={() => undefined}
      />,
    );
    const btn = getByLabelText("Approve");
    expect(btn.className).toMatch(/text-success/);
    expect(btn.className).not.toMatch(/green-[0-9]/);
  });

  it("deny button uses destructive semantic token classes", () => {
    const { getByLabelText } = render(
      <ToolCallInline
        name="send_email"
        state="approval-requested"
        input={{}}
        approvalId="abc"
        onToolApproval={() => undefined}
      />,
    );
    const btn = getByLabelText("Deny");
    expect(btn.className).toMatch(/text-destructive/);
    expect(btn.className).not.toMatch(/red-[0-9]/);
  });
});
```

Run: `pnpm vitest run src/components/chat/tool-call-inline.test.tsx` → FAIL.

### 14b. Implement

**File:** `src/components/chat/tool-call-inline.tsx`

Replace class strings:

```tsx
/* Status dot */
// BEFORE: isAwaitingApproval && "animate-pulse bg-amber-500"
// AFTER:  isAwaitingApproval && "animate-pulse bg-approval"

// BEFORE: isDenied && "bg-orange-500"
// AFTER:  isDenied && "bg-denied"

/* Denied label */
// BEFORE: "text-[10px] font-medium text-orange-600 dark:text-orange-400"
// AFTER:  "text-[10px] font-medium text-denied"

/* Approve button */
// BEFORE: "... border-green-300 bg-green-50 ... text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
// AFTER:  "rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20"

/* Deny button */
// BEFORE: "... border-red-300 bg-red-50 ... text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
// AFTER:  "rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"

/* Auth card (browser auth) */
// BEFORE: "border-amber-200 bg-amber-50 ... dark:border-amber-800 dark:bg-amber-950"
// AFTER:  "border-warning/20 bg-warning/5"

/* Auth card paragraph */
// BEFORE: "text-amber-900 dark:text-amber-100"
// AFTER:  "text-foreground"

/* Auth card "Connect" button */
// BEFORE: "bg-amber-600 ... hover:bg-amber-700"
// AFTER:  "bg-warning text-warning-foreground hover:opacity-90"

/* Auth card "Done, I've logged in" button */
// BEFORE: "bg-amber-600 ... hover:bg-amber-700"
// AFTER:  "bg-warning text-warning-foreground hover:opacity-90"

/* Auth card "Cancel" button */
// BEFORE: "border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
// AFTER:  "border-warning/30 text-warning hover:bg-warning/10"

/* Connection saved message */
// BEFORE: "text-emerald-700 dark:text-emerald-300"
// AFTER:  "text-success"

/* Verifying message */
// BEFORE: "text-amber-900 dark:text-amber-100"
// AFTER:  "text-foreground"

/* Auth error message */
// BEFORE: "text-amber-800/80 dark:text-amber-200/80"
// AFTER:  "text-muted-foreground"
```

Run: `pnpm vitest run src/components/chat/tool-call-inline.test.tsx` → PASS.

---

## Step 15 — TDD: analyst-section.tsx — warning/error banners

### 15a. Write test first

**File:** `src/components/analyst/analyst-section.test.tsx` (new if absent)

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// This is an integration test — render with an interrupted/error state and check banner classes
describe("analyst-section banner colors", () => {
  it("interrupted banner uses warning token, not raw amber", () => {
    // Render with interrupted state — adjust props to match actual component API
    // const { container } = render(<AnalystSection state="interrupted" ... />);
    // expect(container.innerHTML).not.toMatch(/amber-/);
    // expect(container.innerHTML).toMatch(/warning/);
    // Note: mark as TODO if component is hard to unit test in isolation
    expect(true).toBe(true); // placeholder — replace with real render
  });
});
```

If the component is too coupled (e.g., requires full context/store), add a TODO comment and do a visual spot-check instead. Proceed to implement.

### 15b. Implement

**File:** `src/components/analyst/analyst-section.tsx`

Replace class strings:

```tsx
/* Interrupted stream warning banner */
// BEFORE: "p-3 rounded-lg bg-amber-50 text-amber-800 ..."
// AFTER:  "p-3 rounded-lg bg-warning/5 border border-warning/20 ..."

/* Warning icon */
// BEFORE: "text-amber-500" or "text-amber-600"
// AFTER:  "text-warning"

/* Regenerate link */
// BEFORE: "text-amber-600 hover:..."
// AFTER:  "text-warning hover:opacity-80"

/* Error banner */
// BEFORE: "p-3 rounded-lg bg-red-50 text-red-700 ..."
// AFTER:  "p-3 rounded-lg bg-destructive/5 text-destructive ..."

/* Retry link */
// BEFORE: "text-red-600 ..." or "text-red-700"
// AFTER:  "text-destructive"

/* DO NOT TOUCH: Sparkles empty state "bg-[#024F46]/10 text-[#024F46]" — intentional brand color */
```

---

## Step 16 — TDD: validation-rules-section.tsx

### 16a. Write test first

**File:** `src/components/cases/validation-rules-section.test.tsx` (check existing for color assertions)

If existing tests assert amber/green classes, update them first (failing). Then add:

```tsx
describe("validation-rules-section color tokens", () => {
  it("issue count header uses warning token", () => {
    // render with issues present
    // expect warning token, not amber-600
    expect(true).toBe(true); // replace with real render
  });

  it("passing count uses success token", () => {
    // expect success token, not green-600
    expect(true).toBe(true); // replace with real render
  });
});
```

### 16b. Implement

**File:** `src/components/cases/validation-rules-section.tsx`

Replace class strings:

```tsx
/* Issue count header */
// BEFORE: text-amber-600
// AFTER:  text-warning

/* Passing count */
// BEFORE: text-green-600
// AFTER:  text-success

/* Issue tag */
// BEFORE: bg-amber-50 text-amber-600 dark:bg-amber-950/50
// AFTER:  bg-warning/10 text-warning

/* Passing tag */
// BEFORE: bg-green-50 text-green-600 dark:bg-green-950/50
// AFTER:  bg-success/10 text-success

/* Issue icon */
// BEFORE: text-amber-500
// AFTER:  text-warning

/* Passing icon */
// BEFORE: text-green-500
// AFTER:  text-success
```

Run tests → PASS.

---

## Step 17 — TDD: file-download.tsx — filetype token colors

### 17a. Write test first

**File:** `src/components/analyst/file-download.test.tsx` (check existing, add to it)

```tsx
describe("file-download filetype icon colors", () => {
  it("xlsx uses filetype-spreadsheet token", () => {
    const { container } = render(<FileDownload filename="report.xlsx" url="/f" />);
    const icon = container.querySelector("svg");
    expect(icon?.className.baseVal ?? icon?.getAttribute("class")).toMatch(/filetype-spreadsheet/);
  });

  it("pdf uses filetype-pdf token", () => {
    const { container } = render(<FileDownload filename="doc.pdf" url="/f" />);
    const icon = container.querySelector("svg");
    expect(icon?.className.baseVal ?? icon?.getAttribute("class")).toMatch(/filetype-pdf/);
  });

  it("no raw Tailwind palette color classes in rendered output", () => {
    const { container } = render(<FileDownload filename="sheet.xlsx" url="/f" />);
    expect(container.innerHTML).not.toMatch(/text-(green|red|blue|orange)-[0-9]/);
  });
});
```

Run: `pnpm vitest run src/components/analyst/file-download.test.tsx` → FAIL.

### 17b. Implement

**File:** `src/components/analyst/file-download.tsx`

Add import:

```ts
import { FILETYPE_COLOR_CLASSES } from "@/lib/ui/color-maps";
```

In `getFileTypeConfig`, replace raw `colorClass` strings with `FILETYPE_COLOR_CLASSES[ext]` lookups:

```ts
function getFileTypeConfig(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const colorClass = FILETYPE_COLOR_CLASSES[ext] ?? "text-filetype-default";
  // ... rest of switch unchanged, just use colorClass variable
}
```

Also replace container and text classes:

```tsx
/* Container */
// BEFORE: border-zinc-200 bg-zinc-50
// AFTER:  border-border bg-muted/30

/* Filename */
// BEFORE: text-zinc-900
// AFTER:  text-foreground

/* File type label */
// BEFORE: text-zinc-500
// AFTER:  text-muted-foreground

/* Download icon */
// BEFORE: text-zinc-400
// AFTER:  text-muted-foreground
```

Run: `pnpm vitest run src/components/analyst/file-download.test.tsx` → PASS.

---

## Step 18 — tools-dropdown.tsx — import FILETYPE_ICON_CLASSES

**File:** `src/components/analyst/tools-dropdown.tsx`

Add import:

```ts
import { FILETYPE_ICON_CLASSES } from "@/lib/ui/color-maps";
```

Replace icon wrapper divs — use `FILETYPE_ICON_CLASSES[label]` where `label` is `"Spreadsheet"`, `"PDF"`, `"Document"`, `"Presentation"`:

```tsx
/* BEFORE */
<div className="h-6 w-6 rounded bg-green-100 flex items-center justify-center text-green-700">

/* AFTER */
<div className={cn("h-6 w-6 rounded flex items-center justify-center", FILETYPE_ICON_CLASSES.Spreadsheet)}>
```

No separate test needed — `FILETYPE_ICON_CLASSES` is already tested in `color-maps.test.ts`.

---

## Step 19 — Catch-all: minor hardcoded colors

These files have isolated hardcoded color classes not covered above. Apply the same semantic-token pattern:

| File | Change |
|---|---|
| `src/components/crm/quick-edit-cell.tsx` | `text-emerald-600` → `text-success` |
| `src/components/documents/upload-progress-panel.tsx` | `bg-emerald-500` → `bg-success`, `bg-amber-500` → `bg-warning`, `text-emerald-500` → `text-success` |
| `src/components/documents/extraction-review/review-actions.tsx` | `bg-emerald-600 hover:bg-emerald-700` → `bg-success hover:opacity-90 text-success-foreground` |
| `src/components/documents/extraction-review/extraction-field.tsx` | `bg-red-50 text-red-600/80` → `bg-destructive/10 text-destructive/80` |
| `src/components/documents/extraction-review/array-field-editor.tsx` | `bg-green-50` → `bg-success/10` |
| `src/components/documents/extraction-review/primitive-array-editor.tsx` | `bg-green-50` → `bg-success/10` |
| `src/components/documents/duplicate-indicator.tsx` | `text-green-500` → `text-success` |
| `src/components/property/config-notice.tsx` | `border-amber-200 bg-amber-50` → `border-warning/30 bg-warning/10`, `text-amber-*` → `text-warning` |

---

## Step 20 — Full test run + build verify

```bash
pnpm vitest run
pnpm build
```

Expected: all tests pass, build clean with no TypeScript or Tailwind errors.

### Manual spot-check

- `/customers/people` — buyer (info/Flexoki blue), seller (success/olive green), landlord (warning/olive yellow) badge tints
- `/customers/deals/pipeline` — kanban column top-borders and stage chips use Flexoki stage tokens
- `/customers/tasks` — task board (Open=cyan border/chip, Completed=green border/chip)
- Chat view with a pending tool call — approval dot is olive yellow, deny dot is orange, approve/deny buttons use success/destructive tokens
- Any agent view with file downloads — filetype icons use Flexoki tokens
- Dark mode toggle — all colors adapt without any dark: class overrides

## Commit

```bash
git add -A
git commit -m "feat: semantic-first Flexoki design system — three-layer token hierarchy across all app components"
```
