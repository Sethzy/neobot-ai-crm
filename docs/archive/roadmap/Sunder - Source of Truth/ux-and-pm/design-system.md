# Sunder App Design System

## Color Scheme: Flexoki

We use [Flexoki](https://stephango.com/flexoki) by Steph Ango (creator of Obsidian) as the color scheme for the **app dashboard** (chat, CRM, tasks, automations, memory, settings, etc.).

Flexoki is an "ink on paper" palette — warm cream backgrounds with near-black text, no dominant brand color. The aesthetic is calm, editorial, and distraction-free. Think Notion or Linear, not a typical SaaS green dashboard.

**Scope:** App dashboard only. The landing/marketing pages (`/`, `/market/*`, `/use-cases/*`, `/industries/*`, `/demo`) use a separate scoped theme (Sunder green `#024F46`) defined under `.landing-page` in `globals.css` — untouched.

---

## Palette

### Light Mode

| Token | HSL | Role |
|---|---|---|
| `--flexoki-bg` | `hsl(48 100% 97%)` | Main page background — warm paper |
| `--flexoki-bg-2` | `hsl(51 33% 92%)` | Cards, sidebar — slightly deeper |
| `--flexoki-ui` | `hsl(51 21% 88%)` | Hover states, selected rows |
| `--flexoki-ui-2` | `hsl(50 14% 83%)` | Borders, input backgrounds |
| `--flexoki-ui-3` | `hsl(55 10% 79%)` | Focus rings, subtle decorations |
| `--flexoki-tx` | `hsl(0 3% 6%)` | Primary text — near-black ink |
| `--flexoki-tx-2` | `hsl(50 3% 42%)` | Secondary / label text |
| `--flexoki-tx-3` | `hsl(49 7% 70%)` | Placeholder / muted text |
| `--flexoki-re` | `hsl(3 62% 42%)` | Destructive / error — warm red |

### Dark Mode

| Token | HSL | Role |
|---|---|---|
| `--flexoki-bg` | `hsl(0 3% 6%)` | Near-black background |
| `--flexoki-bg-2` | `hsl(30 4% 11%)` | Cards, sidebar |
| `--flexoki-ui` | `hsl(30 3% 15%)` | Hover states |
| `--flexoki-ui-2` | `hsl(40 3% 20%)` | Borders, inputs |
| `--flexoki-ui-3` | `hsl(30 3% 24%)` | Focus rings |
| `--flexoki-tx` | `hsl(55 10% 79%)` | Warm light — primary text |
| `--flexoki-tx-2` | `hsl(43 3% 52%)` | Secondary text |
| `--flexoki-tx-3` | `hsl(45 2% 33%)` | Muted text |
| `--flexoki-re` | `hsl(5 61% 54%)` | Destructive — brighter warm red |

---

## shadcn Token Mapping

The Flexoki tokens are mapped to shadcn's semantic tokens in `app/globals.css `:

| shadcn token | Flexoki source | Notes |
|---|---|---|
| `--primary` | `--flexoki-tx` | Dark ink — buttons, active elements |
| `--primary-foreground` | `--flexoki-bg` | Light — text on primary buttons |
| `--background` | `--flexoki-bg` | Page background |
| `--card` | `--flexoki-bg` (light) / `--flexoki-bg-2` (dark) | Cards |
| `--sidebar` | `--flexoki-bg-2` | Sidebar background |
| `--accent` | `--flexoki-ui` | Hover background on nav items |
| `--border` | `--flexoki-ui-2` | All borders |
| `--muted-foreground` | `--flexoki-tx-3` | Placeholder, timestamps, labels |
| `--destructive` | `--flexoki-re` | Delete buttons, error states |

**Key implication:** `--primary` is dark ink, not a color. Buttons, active sidebar items, and focus rings are dark/warm-gray — not green.

---

## Chart Colors

Charts use Flexoki's accent palette instead of greens. Assigned to `--chart-1` through `--chart-5`:

| Slot | Light | Dark | Name |
|---|---|---|---|
| `--chart-1` | `#66800B` | `#879A39` | Green (olive) |
| `--chart-2` | `#24837B` | `#3AA99F` | Cyan |
| `--chart-3` | `#205EA6` | `#4385BE` | Blue |
| `--chart-4` | `#BC5215` | `#DA702C` | Orange |
| `--chart-5` | `#AD8301` | `#D0A215` | Yellow |

---

## Accent Colors — Three-Layer Token Hierarchy

All accent/status colors in the dashboard flow through a three-layer CSS variable system. Components reference **Layer 2 or Layer 3 only** — never Layer 1 or raw Tailwind palette classes.

```
Layer 1 — Raw Flexoki accent palette (private, :root/.dark only)
Layer 2 — Semantic tokens (chain to Layer 1, swap automatically in dark mode)
Layer 3 — Domain tokens (chain to Layer 1, scoped to CRM concepts)
```

### Layer 1 — Raw Flexoki Accent Palette (private)

Defined in `:root` and `.dark` in `globals.css`. **Never reference these in components.**

| Var | Light | Dark |
|---|---|---|
| `--flexoki-re` | `#AF3029` | `#D14D41` |
| `--flexoki-orange` | `#BC5215` | `#DA702C` |
| `--flexoki-yellow` | `#AD8301` | `#D0A215` |
| `--flexoki-green` | `#66800B` | `#879A39` |
| `--flexoki-cyan` | `#24837B` | `#3AA99F` |
| `--flexoki-blue` | `#205EA6` | `#4385BE` |
| `--flexoki-purple` | `#5E409D` | `#8B7EC8` |
| `--flexoki-magenta` | `#A02F6F` | `#CE5D97` |

### Layer 2 — Semantic Tokens

Use these for UI states. Available as Tailwind utilities (`text-warning`, `bg-success/10`, `border-info`, etc.).

| Token | Maps to | Use case |
|---|---|---|
| `--success` | `--flexoki-green` | Completed, passing, positive outcomes |
| `--info` | `--flexoki-blue` | Open tasks, informational states |
| `--warning` | `--flexoki-yellow` | Overdue, caution, pending |
| `--approval` | `--flexoki-yellow` | Tool approval-requested dot |
| `--denied` | `--flexoki-orange` | Tool output-denied dot/label |
| `--tag` | `--flexoki-purple` | Tag badges |
| `--syntax-string` | `--flexoki-cyan` | JSON viewer: string values |
| `--syntax-number` | `--flexoki-blue` | JSON viewer: number values |
| `--syntax-boolean` | `--flexoki-yellow` | JSON viewer: boolean values |

Note: `--destructive` (`--flexoki-re`) is also a semantic token but predates this system — it was already wired up.

### Layer 3 — Domain Tokens

Use these for CRM-specific concepts. Available as Tailwind utilities (`border-l-stage-leads`, `bg-status-open/10`, `text-filetype-pdf`, etc.).

| Token | Maps to | Use case |
|---|---|---|
| `--stage-leads` | `--flexoki-yellow` | Deal pipeline: Leads |
| `--stage-negotiation` | `--flexoki-orange` | Deal pipeline: Negotiation |
| `--stage-offer` | `--flexoki-purple` | Deal pipeline: Offer |
| `--stage-closing` | `--flexoki-green` | Deal pipeline: Closing |
| `--stage-lost` | `--flexoki-re` | Deal pipeline: Lost |
| `--status-open` | `--flexoki-cyan` | Task status: Open |
| `--status-completed` | `--flexoki-green` | Task status: Completed |
| `--filetype-spreadsheet` | `--flexoki-green` | File icons: xlsx, xls, csv |
| `--filetype-pdf` | `--flexoki-re` | File icons: pdf |
| `--filetype-document` | `--flexoki-blue` | File icons: docx, doc |
| `--filetype-presentation` | `--flexoki-orange` | File icons: pptx, ppt |
| `--filetype-default` | `--flexoki-tx-2` | File icons: unknown types |

### Dark Mode

Dark mode is handled **entirely by the CSS cascade**. Layer 1 vars swap between `:root` and `.dark`. Layers 2 and 3 chain to Layer 1 via `var()`. Components never need `dark:` prefixes on accent colors.

```tsx
// CORRECT — works in both light and dark mode automatically
"bg-warning/10 text-warning"

// WRONG — manual dark mode overrides
"bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
```

### Class-String Maps

All class-string maps (stage tone classes, border classes, avatar colors, filetype icon classes) are centralized in `src/lib/ui/color-maps.ts`. Components import from there — never define inline color maps.

Exports:
- `DEAL_STAGE_TONE_CLASSES` — bg + text for kanban stage chips
- `DEAL_STAGE_TOP_BORDER_CLASSES` — column header top borders
- `DEAL_STAGE_LEFT_BORDER_CLASSES` — deal card left accent borders
- `TASK_STATUS_TONE_CLASSES` — bg + text for task status badges
- `TASK_STATUS_TOP_BORDER_CLASSES` — task board column top borders
- `AVATAR_COLORS` — 8-slot deterministic avatar bg + text
- `FILETYPE_COLOR_CLASSES` — extension → icon color
- `FILETYPE_ICON_CLASSES` — label → icon wrapper bg + text

---

## What Didn't Change

- **Typography:** Geist Sans (app), Fraunces (serif accents) — unchanged
- **Border radius:** `0.35rem` — kept tighter than shadcn default
- **Sunder brand tokens:** `--color-sunder-green`, `--color-parchment`, etc. — kept in `@theme inline` for landing page use only
- **`bg-[#024F46]` / `text-[#024F46]`** in EmptyState sparkle — intentional brand color, not part of the token system

---

## Implementation

Token definitions live in `app/globals.css` — the `:root` and `.dark` blocks. All tokens are registered in the `@theme inline` block so Tailwind 4 generates the corresponding utility classes.

Reference gist for the original shadcn port: https://gist.github.com/phenomen/affd8c346538378548febd20dccdbfcc
