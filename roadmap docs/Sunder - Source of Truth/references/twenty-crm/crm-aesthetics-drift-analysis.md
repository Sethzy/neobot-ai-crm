# Twenty CRM Reference — Pure Aesthetics Drift Analysis

> **Scope:** This document is **aesthetics only** — colors, typography, spacing, border radius, shadows, motion, and the visual recipe of every surface-level component (table, kanban card, chip, button, input, avatar, sidebar, record detail, empty state). It is the visual-spec companion to `crm-ux-gold-standard-drift-analysis.md`, which covers architecture and behavior. No backend, no data model, no routing, no logic.
>
> **Reference repo:** `https://github.com/twentyhq/twenty` (local clone: `/Users/sethlim/Documents/twenty`)
>
> **Sunder repo:** `/Users/sethlim/Documents/sunder-next-migration-20260225`
>
> **Default position:** Match Twenty's visual recipe exactly. Drift only where the stack (Tailwind 4 + ShadCN + Flexoki vs. Linaria + Radix colors + Emotion) makes identical output impossible, and in those cases translate 1:1 to our primitives.
>
> **Date:** 2026-04-23

---

## 1. Executive Summary

Sunder already has a coherent visual system (Flexoki tokens + custom Figtree/Fraunces typography + warm neutral canvas). It looks modern. It does **not** yet look like a dense, data-first enterprise CRM.

Twenty's aesthetic signature comes from five aesthetic decisions that together produce the "Attio-level" feel:

1. **4px spacing grid, nothing bigger.** Row height 32px. Icon size 14/16/20. Cell padding 0 8px. Gap 4/8/12. Everything is a small multiple of 4. Sunder uses Tailwind's default scale freely and has row heights closer to 40–44px.
2. **Gray-first color hierarchy with accents on a short leash.** Primary text gray12. Secondary gray11. Tertiary gray9. Borders gray7. Accent blue reserved for selection, focus, and a small set of deliberate highlights. Sunder leans on warmer Flexoki paper + teal primary + full spectrum accent palette; denser data surfaces need a colder, flatter default.
3. **Radix P3 color ramps — 12 steps per hue, used systematically.** Tag color = step 3 background + step 11 text. Hover = transparent step tint. Selected = accent step 4 background. Sunder uses two-tone `bg-{color}/10 text-{color}` which works but lacks the same calibration.
4. **Minimal, layered shadows.** Four tiers only: `light`, `strong`, `underline`, `superHeavy`. All alpha-based. Sunder has 8 shadow tiers but uses them rarely; the kanban column is actually *less* elevated than Twenty's equivalent.
5. **Motion is almost absent.** Two durations matter: `0.1s` for hover background and `0.3s` for row-selection. No bouncy curves. No card shimmers. Sunder ships several decorative keyframes (flame/key/clock icon wobbles, badge-shimmer, card-shimmer-sweep, login-slide-in) that do not belong in a CRM surface.

If we copy Twenty's token values, border widths, row heights, cell padding, and shadow tiers, our existing Flexoki palette still works — but the surface will *feel* like a professional CRM instead of a generic shadcn dashboard. This is the smallest change with the largest perceptual impact.

---

## 2. What Twenty Actually Looks Like

### 2.1 Theme system — one file family, all tokens

Primary reference files in `/Users/sethlim/Documents/twenty`:

- `packages/twenty-ui/src/theme/constants/ThemeLight.ts`
- `packages/twenty-ui/src/theme/constants/ThemeDark.ts`
- `packages/twenty-ui/src/theme/constants/MainColorsLight.ts`
- `packages/twenty-ui/src/theme/constants/SecondaryColorsLight.ts`
- `packages/twenty-ui/src/theme/constants/GrayScaleLight.ts`
- `packages/twenty-ui/src/theme/constants/BorderCommon.ts`
- `packages/twenty-ui/src/theme/constants/BorderLight.ts`
- `packages/twenty-ui/src/theme/constants/BoxShadowLight.ts`
- `packages/twenty-ui/src/theme/constants/BoxShadowDark.ts`
- `packages/twenty-ui/src/theme/constants/FontCommon.ts`
- `packages/twenty-ui/src/theme/constants/FontLight.ts`
- `packages/twenty-ui/src/theme/constants/spacingValues.ts`
- `packages/twenty-ui/src/theme-constants/generated/themeCssVariables.ts`

Key pattern:

- Token categories: `background`, `border`, `font`, `spacing`, `radius`, `boxShadow`, `animation`, `icon`, `accent`, `tag`.
- Auto-generated CSS variables of the form `--t-*` (e.g., `--t-spacing-1`, `--t-font-color-primary`).
- Light/dark are parallel constant objects, not media queries. Theme swap mounts a different variable set at the root.
- Radix Colors (Display-P3) for every accent hue — not custom palettes.

### 2.2 Typography — Inter, a tight scale, medium-heavy

Primary reference: `packages/twenty-ui/src/theme/constants/FontCommon.ts`

```ts
fontFamily: 'Inter, sans-serif'
fontSize: {
  xxs: '0.625rem',   // 10px
  xs: '0.85rem',     // 13.6px
  sm: '0.92rem',     // 14.72px
  md: '1rem',        // 16px
  lg: '1.23rem',     // 19.68px
  xl: '1.54rem',     // 24.64px
  xxl: '1.85rem',    // 29.6px
}
fontWeight: { regular: 400, medium: 500, semiBold: 600 }
lineHeight: { md: 1.1, lg: 1.5 }
color: {
  primary: gray12, secondary: gray11, tertiary: gray9,
  light: gray8, extraLight: gray7, inverted: gray1, danger: red4
}
```

Key pattern:

- One font family for the entire product. No display/serif pairing.
- Seven sizes, five of which carry the entire UI. `xs` and `sm` (13.6 / 14.72 px) do almost all of the work in tables and forms.
- Only three weights — 400 / 500 / 600. No light (300). No black (700+).
- Text colors are a narrow ramp driven by gray steps, not independent tokens.

### 2.3 Spacing — pure 4px multiples

Primary reference: `packages/twenty-ui/src/theme/constants/spacingValues.ts`

```ts
spacingMultiplicator: 4
spacing(n) = `${n * 4}px`
// Fractional: spacing(0.5) = 2px, spacing(1.5) = 6px
```

Representative usage:

- Row height: `spacing(8)` = 32 px
- Cell padding: `0 spacing(2)` = 0 8 px
- Empty state gap: `spacing(6)` = 24 px
- Gap between adjacent controls: `spacing(1)` = 4 px
- Button padding: `spacing(2) spacing(3)` = 8 px / 12 px

Key pattern: every layout decision is a small integer multiple of 4. There is no "1.5rem" or "1.25rem". This is the single biggest source of density feel.

### 2.4 Border radius — six values, all small

Primary reference: `packages/twenty-ui/src/theme/constants/BorderCommon.ts`

```ts
xs: '2px'
sm: '4px'    // inputs, checkboxes, chips, table rows
md: '8px'    // buttons, cards, panels
xl: '20px'   // modals
xxl: '40px'
pill: '999px'
rounded: '100%'  // avatars
```

Key pattern:

- `sm: 4px` is the default for small surfaces (chip, cell background, checkbox).
- `md: 8px` is the default for buttons and cards. Nothing bigger inside the data plane.
- 20 px (`xl`) and 40 px (`xxl`) are reserved for modal/dialog shells.
- Avatars are true circles (`100%`), not rounded squares — except for "icon" avatars at 4 px.

### 2.5 Shadows — four tiers, alpha-based

Primary reference: `packages/twenty-ui/src/theme/constants/BoxShadowLight.ts`

```ts
light:      '0 2px 4px 0 rgb(0 0 0 / 0.08), 0 0 4px 0 rgb(0 0 0 / 0.05)'
strong:     '2px 4px 16px 0 rgb(0 0 0 / 0.12), 0 2px 4px 0 rgb(0 0 0 / 0.05)'
underline:  '0 1px 0 0 rgb(0 0 0 / 0.2)'
superHeavy: '0 0 8px 0 rgb(0 0 0 / 0.12), 0 8px 64px -16px rgb(0 0 0 / 0.08), 0 24px 56px -16px rgb(0 0 0 / 0.05)'
```

Key pattern:

- Popover / floating panel = `light`.
- Modal / elevated card = `strong`.
- Sticky table header bottom edge = `underline`.
- Dropdown / context menu = `superHeavy`.
- No shadow on data rows, no shadow on kanban cards at rest.

### 2.6 Motion — 75 / 150 / 300 / 1500 ms

Primary reference: `packages/twenty-ui/src/theme/constants/Animation.ts`

```ts
duration: { instant: 0.075, fast: 0.15, normal: 0.3, slow: 1.5 }
clickableElementBackgroundTransition: 'background 0.1s ease'
```

Key pattern:

- Hover background transitions = `0.1s ease`. That is the single transition most users actually feel.
- Row selection background = `0.3s` (normal).
- No custom cubic-bezier curves. No springs. No shimmer.
- Fade-in for empty states = `0.15s opacity 0 → 1`.

### 2.7 Color — Radix ramps, used by step number

Primary reference: `packages/twenty-ui/src/theme/constants/MainColorsLight.ts`, `SecondaryColorsLight.ts`, `GrayScaleLight.ts`, and `@radix-ui/colors`.

Representative gray ramp (Display-P3 approximated):

```
gray1:  #FFFFFF   canvas
gray2:  #FBF9F7   subtle surface
gray4:  #F1EDEB   elevated surface
gray5:  #EBE7E5   row hover
gray6:  #D6CED8   subtle border
gray7:  #CCCCCC   regular border / disabled fg
gray8:  #B3B3B3   placeholder / light fg
gray9:  #999999   table header / tertiary fg
gray10: #838383
gray11: #666666   secondary fg
gray12: #333333   primary fg (near-black, not pure black)
```

Primary blue: `indigoP3` ramp. `blue5` for accent surfaces, `blue8` for pressed, `blue9` as the "primary-inverted" stamp.

Key pattern:

- Every hue is a 12-step ramp with identical semantic numbering.
- Tag background = step 3. Tag text = step 11. Selected row background = accent step 4.
- Transparent variants exist for every step (`transparent.blue3`, `transparent.gray5`) and drive hover overlays.

### 2.8 Chip / Tag — the unit of status

Primary reference: `packages/twenty-ui/src/components/chip/Chip.tsx` and `packages/twenty-ui/src/components/tag/Tag.tsx`.

```
Chip:
  height: spacing(4) = 16px (Large); spacing(3) = 12px (Small)
  padding: 4px 4px
  radius: sm = 4px
  variants: Regular | Highlighted | Transparent | Rounded | Static
  accents: TextPrimary (gray12) | TextSecondary (gray11, medium)

Tag (status/chip color):
  bg = radix step 3 of chosen hue
  fg = radix step 11 of chosen hue
  ~24 preset hues (gray, blue, red, orange, green, yellow, purple, pink, ...)
```

Key pattern: chips are tiny (12–16 px), radius 4, always soft-tone. They never use solid brand color as background.

### 2.9 Button

Primary reference: `packages/twenty-ui/src/components/button/MainButton.tsx` and `Button.tsx`.

```
Primary:
  background: background.primaryInverted (gray12 in light)
  text: font.color.inverted (white)
  border: 1px solid background.transparent.strong
  padding: spacing(2) spacing(3)  // 8px 12px
  height: max spacing(8) = 32px
  radius: md = 8px
  font-weight: 600
  hover: primaryInvertedHover (~gray11)
Secondary:
  background: background.primary (white)
  text: font.color.primary (gray12)
  border: 1px solid border.color.medium (gray6/7)
  hover: background.tertiary (gray4)
Disabled:
  background: background.secondary; text: font.color.light
Icon on left: icon.size.sm = 14px
```

Key pattern: primary is **inverted dark**, not brand blue. Brand blue is almost never a button background — it is an accent for selection, link, and focus.

### 2.10 Input / SearchInput

Primary reference: `packages/twenty-ui/src/components/input/components/SearchInput.tsx` and `TextInput.tsx`.

```
height: 32px
border: 1px solid border.color.medium
radius: sm = 4px
background: background.transparent.lighter
padding: 0 8px
gap: 4px (icon → text)
placeholder: font.color.light (gray8), font-weight 500
focus: border color → color.blue (accent blue)
icon color: unfocused = gray8, focused = gray11
```

Key pattern: inputs are 32 px tall, radius 4 px (not 8), and focus is signaled by **border color**, not a 3 px ring.

### 2.11 Avatar

Primary reference: `packages/twenty-ui/src/components/avatar/Avatar.tsx`.

```
Sizes: xl=40, lg=24, md=16, sm=14, xs=12
Font size: xl=16, lg=13, md=12, sm=10, xs=8
Types: rounded (50%) | squared (2px) | icon (4px)
Color: stringToThemeColorP3String(name) → Radix hue
  background = step 4 (light tint)
  text       = step 12 (dark)
Hover (clickable): box-shadow 0 0 0 4px background.transparent.light
```

Key pattern: avatars are tiny. Primary table avatar is 16 px. Record header avatar is 40 px max. No big circular headshots taking 64 px of a row.

### 2.12 Icons

Primary reference: `tabler-icons-react` imported as themed icons.

```
Sizes: sm=14, md=16, lg=20, xl=24
Stroke widths: sm=1.6, md=2.0, lg=2.5
Color: currentColor (inherits text color)
```

Key pattern: icons are **14 px** in table cells, **16 px** in buttons, **20 px** in record detail headers. Nothing bigger except in dedicated empty-state illustrations. Stroke 2 is the default — not 1.5 (lucide) or 1.

### 2.13 Table — the single most important surface

Primary reference: `packages/twenty-front/src/modules/object-record/record-table/**` (styles live alongside components).

```
Row height:     32px (= spacing(8))
Cell padding:   0 8px (= 0 spacing(2))   // zero vertical
Header height:  32px
Header border:  1px solid border.color.light bottom
Header font:    font.size.sm, weight medium (500), color tertiary (gray9)
Header align:   left | center | right (configurable)
Cell font:      font.size.sm, weight regular (400), color secondary (gray11)
Row divider:    none by default (rely on header underline + row hover)
Row hover:      background.transparent.light (gray5 @ ~6% alpha)
Row selected:   accent.quaternary (blue @ ~12% alpha)
Transition:     background 0.1s ease on hover, 0.3s on select
Checkbox col:   width = spacing(4) = 16px
Sort indicator: 14px icon in header, tertiary color
Column resize:  1px grabber on right edge, appears on hover
```

Key pattern: **zero vertical padding**. Cells are vertically centered in a fixed 32 px row by flex layout, not by padding. Row dividers are almost invisible (the header's bottom border carries the weight). Hover is an almost imperceptible gray wash, not a blue tint.

### 2.14 Record card / kanban tile

Same aesthetic recipe as a row: 4 px radius, no shadow at rest, 32 px minimum height per line, tag-style status chips using step-3/step-11 Radix pairing. Hover = `background.transparent.light`. Drag state = `strong` shadow.

### 2.15 Sidebar / page shell

Primary references: `MainNavigationDrawerScrollableItems.tsx`, `WorkspaceSectionContainer.tsx`, plus the page-layout shell.

```
Sidebar background:  background.primary (gray1 / white)
Sidebar item height: spacing(7) ≈ 28px
Sidebar item radius: sm = 4px
Active item bg:      background.transparent.light
Active item fg:      font.color.primary (not blue)
Item icon:           16px, tertiary color
Top bar height:      spacing(10) = 40px
Top bar background:  background.primary
Top bar bottom rule: 1px solid border.color.light
```

Key pattern: the chrome is white-on-white with a whisper of gray separating panels. The active nav item is **not** the brand color — it is just a slightly darker gray wash.

### 2.16 Record detail page

```
Page header bg:      background.primary
Title:               font.size.xl (24.64px), weight 600
Tab bar:             underline style, active tab = accent.primary blue line, inactive = tertiary text
Field label:         font.size.sm, weight medium, color secondary (gray11) — NOT uppercase
Field value:         font.size.md, color primary (gray12)
Inline-edit hover:   background.transparent.light, transition 0.1s ease
Read-only:           color tertiary/light, no hover state
```

Key pattern: labels are **mixed case** (`Email address`, not `EMAIL ADDRESS`). Uppercase is reserved for table headers in some themes but never for field labels in the detail panel.

### 2.17 Empty states

```
Container:      flex column, centered, gap spacing(6) = 24px
Title:          font.size.lg (19.68px), weight 600
Subtitle:       font.size.sm, weight regular, color tertiary, line-height 1.5
Subtitle max:   50% width, 2.8em height (max 3 lines)
Fade in:        opacity 0 → 1, duration 0.15s
Illustration:   `AnimatedPlaceholder` — simple line-art SVG, muted color, no personality gimmick
```

### 2.18 Skeleton

```
Base:       background.tertiary
Highlight:  background.transparent.lighter
Radius:     4px
Animation:  react-loading-skeleton default sweep
```

---

## 3. Sunder's Current Aesthetic

Primary reference files in `/Users/sethlim/Documents/sunder-next-migration-20260225`:

- `app/globals.css` — all tokens, typography, keyframes, utilities
- `app/layout.tsx` — font loading (Figtree / Fraunces / Geist Mono)
- `src/lib/ui/color-maps.ts` — Flexoki semantic-to-class mapping
- `src/components/ui/badge.tsx`, `button.tsx`, `input.tsx`, `avatar.tsx`, `card.tsx`, `skeleton.tsx`, `table.tsx`, `list-table.tsx`
- `src/components/crm/*` — kanban-board, deal-kanban-card, quick-edit-cell, record-drawer/**
- `src/components/layout/app-sidebar.tsx`

### 3.1 Theme system — Flexoki + OKLCH + custom CSS vars

`globals.css` defines three layers:

- **Layer 1 — raw Flexoki:** paper (`hsl(48 100% 97%)`), base-50..950, red, orange, yellow, green, cyan, blue, purple, magenta. Hex values roughly: orange `#BC5215`, yellow `#AD8301`, green `#66800B`, cyan `#24837B`, blue `#205EA6`, purple `#5E409D`, magenta `#A02F6F`.
- **Layer 2 — semantic:** `--primary oklch(0.3840 0.0681 181.8438)` (teal/cyan), `--secondary` pale green, `--destructive` warm red, `--success` = flexoki green, `--warning` = flexoki yellow, `--info` = flexoki blue.
- **Layer 3 — CRM concept:** `--stage-leads` yellow, `--stage-negotiation` orange, `--stage-offer` purple, `--stage-closing` green, `--stage-lost` red; `--status-todo` cyan, `--status-in-progress` yellow, `--status-done` green; file-type colors green/red/blue/orange/cyan.

Canvas is **warm paper**, not white. Sidebar is `oklch(0.9700 0.0030 90.0000)` — a warm off-white.

### 3.2 Typography — Figtree + Fraunces + Geist Mono

```
--font-ui:      Figtree (custom woff2)
--font-display: Fraunces (variable)
--font-mono:    Geist Mono

--text-caption:  12px / 500 / 16px  / +0.08em tracking
--text-meta:     14px / 400 / 20px
--text-body:     16px / 400 / 24px
--text-control:  14px / 500 / 20px / -0.01em
--text-toolbar:  18px / 600 / 24px / -0.015em
--text-page:     24px / 600 / 30px / -0.03em
--text-subhead:  20px / 600 / 28px / -0.01em
--text-title:    32px / 600 / 36px / -0.04em
--text-display:  clamp(2.5, 5vw, 4rem) / 500 / 1.02 / -0.05em
```

### 3.3 Spacing — Tailwind defaults

No custom scale in `globals.css`. Tailwind v4 defaults used freely: `px-4 py-2.5` on list rows, `py-4 gap-4` on cards, `p-2.5` on form fields.

### 3.4 Border radius — custom scale, larger than Twenty's

```
--radius:        0.35rem ≈ 5.6px   (base)
--radius-sm:     ≈ 1.6px
--radius-md:     ≈ 3.6px
--radius-lg:     0.35rem
--radius-xl:     ≈ 9.6px

Buttons: rounded-lg (~5.6px)
Badges:  rounded-4xl (pill)
Cards:   rounded-2xl (~16px) via .surface-app
Inputs:  rounded-lg
```

### 3.5 Shadows — 8 tiers, alpha 2–10%

`--shadow-2xs` through `--shadow-2xl` exist but `.surface-app` uses `shadow-sm` and kanban columns use `shadow-sm` only on hover. No defined equivalent of Twenty's `superHeavy`.

### 3.6 Component recipes (condensed)

| Component | Sunder recipe |
|---|---|
| Badge | `h-5 px-2 py-0.5 rounded-4xl text-caption font-medium gap-1 size-3 icon`; soft style `bg-{color}/10 text-{color}` |
| Button default | `h-8 px-2.5 gap-1.5 rounded-lg text-control bg-primary text-primary-foreground` |
| Button outline | `border-border bg-background hover:bg-muted` |
| Button active | `active:not-aria-[haspopup]:translate-y-px` (1 px press) |
| Input | `h-8 px-2.5 py-1 rounded-lg border-input bg-transparent focus:ring-3 ring-ring/50` |
| Avatar | `size-8 rounded-full`, fallback color-cycles through `stage-*` tokens at `/20` opacity |
| Icon | lucide-react, default stroke 2, sizes 12/16/28 used across contexts |
| List-table row | `px-4 py-2.5`, hover `bg-app-hover/70`, selected `bg-app-hover/80` |
| List-table header | `type-table-heading` (caption + uppercase + muted), `px-4 py-2.5`, bottom border |
| Kanban card | no border/shadow; hover `bg-muted/50` — minimal |
| Kanban column card | `rounded-xl border border-app-border-subtle bg-app-surface px-3 py-3 hover:bg-app-hover/35 hover:shadow-sm` |
| Record drawer | side panel, header avatar + title + meta, inline edit, tab underline |
| Empty state | `h-14 w-14 rounded-full border bg-app-surface-muted` icon wrapper + body/meta text |
| Skeleton | `animate-pulse rounded-md bg-muted/40` |

### 3.7 Motion — ornament present, not data-plane

`globals.css` defines `icon-flame`, `icon-key`, `icon-clock` wobbles; `badge-shimmer` and `card-shimmer-sweep`; `login-slide-in`, `gentle-float`, `thread-unread-pulse`. All gated on `prefers-reduced-motion`. Table/kanban itself uses Tailwind default 150 ms transition-all.

### 3.8 Overall feel

Warm-paper canvas + teal primary + wide accent palette + larger radii + variable typography = **soft, editorial, modern-web-product** feel. Twenty = **cold-white canvas + gray-first + dark-inverted buttons + tight 4 px grid** = **desktop-enterprise tool** feel.

Neither is wrong. The question is which one we want for the CRM surface. For the **CRM surface specifically** (tables, kanban, record detail) the editorial treatment works against density and scannability. For the chat / landing / settings surfaces it is a genuine asset.

---

## 4. Drift Matrix (Aesthetics Only)

Legend: **Remove drift** = adopt Twenty's value. **Translate** = same effect, different stack primitive. **Keep drift** = Sunder's choice is deliberate and a genuine improvement.

| Area | Twenty value | Sunder today | Severity | Position |
|---|---|---|---|---|
| Spacing base | 4 px multiplicator, `spacing(n)` semantic | Tailwind default mixed freely | High | Remove drift — standardize on 4 px grid |
| Row height (table) | 32 px | ~36–44 px depending on padding | High | Remove drift — use `h-8` rows |
| Cell padding | `0 8px` (zero vertical) | `px-4 py-2.5` | High | Remove drift — zero vertical padding |
| Cell font size | 14.72 px (`sm`) | 14 px (`text-meta`) | Low | Already close — keep |
| Header label style | mixed-case, medium weight, gray9 | uppercase caption muted | Medium | **Drift justified if we keep uppercase elsewhere; otherwise match Twenty's mixed-case.** Recommend remove drift. |
| Row hover | `bg.transparent.light` (~6% gray wash), 0.1 s | `bg-app-hover/70` (~7% wash), ~150 ms | Low | Keep — already equivalent |
| Row selected | `accent.quaternary` (blue @ ~12%) | `bg-app-hover/80` (gray @ ~8%) | High | Remove drift — selection must be a blue tint, not a darker gray |
| Border radius (chip/cell) | 4 px | pill (full) for badges, `rounded-lg` for cells | High | Remove drift — chips at 4 px, not pills |
| Border radius (button) | 8 px | ~5.6 px (`rounded-lg`) | Medium | Translate — set `--radius` to 8 px OR add a `--radius-button` at 8 px |
| Border radius (card) | 8 px | 16 px (`rounded-2xl`) | Medium | Remove drift — cards at 8 px |
| Border width | 1 px everywhere | 1 px everywhere | — | Matches |
| Primary button color | **dark gray (gray12) inverted**, white text | teal `--primary`, white text | Medium | **Drift justified** if teal is part of brand identity. If not, adopt dark-inverted. Recommend: keep teal for chat/marketing surfaces, switch to dark-inverted for CRM primary actions. |
| Accent blue (selection, focus) | indigoP3 step 9 | Flexoki blue `#205EA6` | Low | Translate — `--flexoki-blue` is close enough |
| Focus ring | border-color change only | `ring-3 ring-ring/50` + border change | Medium | Remove drift — replace 3 px ring with border-color + 1 px inner glow. (Keep 3 px ring only on error state.) |
| Tag color recipe | step-3 bg + step-11 fg (Radix) | `bg-{color}/10 text-{color}` (Flexoki) | Low | Translate — our recipe is visually equivalent |
| Shadow tiers | 4 (light/strong/underline/superHeavy) | 8 (2xs → 2xl) mostly unused | Medium | Translate — collapse usage to 4 semantic roles; keep the 8-tier var set |
| Shadow on rows at rest | none | none | — | Matches |
| Shadow on kanban card at rest | none | none | — | Matches |
| Shadow on modal | `strong` | `shadow-lg` or `shadow-xl` | Low | Translate |
| Avatar size in table | 16 px | 32 px (`size-8`) | High | Remove drift — table avatars at 16 px |
| Avatar size in record header | 40 px | 32 px | Low | Adjust — bump record header avatar to 40 px |
| Icon size in cells | 14 px | 12 px (`size-3`) in kanban rows | Low | Keep if intentional, else bump to 14 |
| Icon stroke width | 2 (default tabler) | 2 (default lucide) | — | Matches |
| Typography family | Inter, single family | Figtree + Fraunces + Geist Mono | Medium | **Drift justified if we want brand identity.** For CRM surfaces specifically, Inter is the convention; Figtree is close enough to read as professional. Keep Figtree for UI, drop Fraunces from CRM surfaces. |
| Typography scale | 10 / 13.6 / 14.72 / 16 / 19.68 / 24.64 / 29.6 | 12 / 14 / 16 / 18 / 20 / 24 / 32 | Low | Keep — both are reasonable, ours maps cleaner to Tailwind |
| Field label case (record detail) | mixed-case | uppercase caption (via `type-kicker`) | High | Remove drift — mixed-case, medium weight, gray11 |
| Uppercase tracking | none on field labels | +0.08em caption | — | Remove where it applies to field labels |
| Canvas background | pure gray1 (#FFFFFF) | warm paper `hsl(48 100% 97%)` | High | **Drift justified only for chat/marketing.** For `/customers/*` surfaces, switch to white canvas to maximize readable contrast. |
| Sidebar active item | transparent light gray bg, primary text | — verify current treatment | Medium | Audit — ensure we're not using brand color for active nav |
| Keyframe ornaments on CRM surfaces (flame/key/clock, card-shimmer-sweep, badge-shimmer) | none | present | High | Remove drift — strip shimmer/wobble from CRM tables & kanban. Keep for landing/login. |
| Hover transition duration | 0.1 s | 0.15 s (Tailwind default) | Low | Translate — add `duration-100` utility class or override |
| Row-selection transition | 0.3 s | 0.15 s | Low | Translate — `duration-300` on selection bg |
| Empty state illustration | line-art SVG placeholder | icon-in-circle | Low | Keep — ours is equivalent |
| Table column type icons | 14 px, tertiary color | lucide 16 px varied | Low | Translate |

---

## 5. Good Reasons to Drift (Stack Translation Only)

These are the **only** valid reasons to drift. They justify different implementation primitives, never weaker aesthetics.

1. **Stack: Linaria + Emotion → Tailwind 4 + ShadCN.** We express the same tokens through `@theme` CSS variables and utility classes. Twenty's `spacing(n)` becomes Tailwind's `p-{n}`, which already aligns to 4 px at the 1-unit level. Their `styled.div\`padding: ${spacing(2)}\`` becomes our `className="p-2"`.
2. **Color library: Radix Colors Display-P3 → Flexoki.** Radix has 12 calibrated steps per hue with built-in dark-mode parity. Flexoki is 10 steps per hue with hand-tuned values. The ramp semantics differ: Radix step 3 ≠ Flexoki `/10`. For the CRM surface, our `/10` + solid fg pattern *is* the translation of Twenty's step-3 bg + step-11 fg. Keep it.
3. **Font: Inter → Figtree.** Figtree is visually close to Inter with slightly warmer letterforms. Acceptable translation.
4. **CSS-in-JS: runtime Linaria → Tailwind utilities.** No aesthetic impact; this is purely tooling.
5. **Icon library: tabler-icons-react → lucide-react.** Both are 24×24 line icons at stroke 2 by default. Visually interchangeable at the sizes we use.

**What does NOT justify drift:**

- "Tailwind default is `rounded-lg` so we used `rounded-lg`" — adjust the `--radius` variable to match 8 px.
- "Our brand palette is warmer" — for the CRM surface specifically, cold-white canvas wins on density. Keep warm paper in chat/landing.
- "`text-meta` is our convention" — convention is good; the actual px value (14) is already Twenty-equivalent.
- "`rounded-4xl` badges look modern" — they are pills. Twenty's chips are 4 px radius. Chips on a dense table should read as **small status tokens**, not **UI candy**.

---

## 6. Minimum-Drift Migration Plan

Ordered by visual impact per unit of work. Each step touches only the files listed. No backend, no data shape, no routing.

### 6.1 Adjust radius tokens

**File:** `app/globals.css`

Change `--radius` from `0.35rem` to `0.5rem` (8 px) so that `rounded-lg` on buttons and `rounded-md` on cells/chips land on Twenty's values. Add an explicit `--radius-chip: 0.25rem` for chips and inline tokens.

### 6.2 Re-skin the badge

**File:** `src/components/ui/badge.tsx`

Replace:
```
rounded-4xl px-2 py-0.5 h-5
```
with:
```
rounded-[var(--radius-chip)] px-1.5 py-0 h-4
```
and `text-caption` → `text-[11px] font-medium`. Soft `bg-{color}/10 text-{color}` stays. This alone moves the visual needle the most.

### 6.3 Tighten row height and cell padding

**File:** `src/components/ui/list-table.tsx`

Row: `px-4 py-2.5` → `h-8 px-2` on cells. Remove vertical padding; vertically center by flex.
Header: keep border-bottom, swap `type-table-heading` (uppercase caption) for `text-[13px] font-medium text-muted-foreground`. Remove uppercase and tracking.

### 6.4 Re-color row hover and selection

**File:** `src/components/ui/list-table.tsx`, `src/components/ui/table.tsx`

- Hover: keep `hover:bg-app-hover/70`, add `duration-100`.
- Selected: change `bg-app-hover/80` → `bg-primary/10` (or a dedicated `--selection: var(--info)/10`), add `duration-300`.

### 6.5 Shrink table avatars

**Files:** wherever the list tables render avatar cells (search for `<Avatar` inside the CRM table rendering).

Pass `size="xs"` or equivalent to render 16 px avatars. Keep record-drawer header avatar at 40 px.

### 6.6 Mixed-case field labels in record detail

**Files:** `src/components/crm/record-drawer/record-detail-panel-shell.tsx`, `contact-drawer-content.tsx`, `company-drawer-content.tsx`, `deal-drawer-content.tsx`

Remove `.type-kicker` / any `uppercase` class on field labels. Replace with `text-[13px] font-medium text-muted-foreground`. Keep uppercase only on table column headers if we want that one accent — or drop it there too and unify.

### 6.7 Strip ornament keyframes from CRM surfaces

**File:** `app/globals.css`

`icon-flame`, `icon-key`, `icon-clock`, `badge-shimmer`, `card-shimmer-sweep` — keep declarations (reused by landing), but remove the utility classes `.icon-flame`, `.icon-key`, `.icon-clock` from CRM table column headers. CRM data plane is still, not animated.

### 6.8 Inline-edit focus treatment

**File:** `src/components/crm/quick-edit-cell.tsx`

Replace `focus-visible:ring-3 focus-visible:ring-ring/50` on edit cells with `focus-visible:border-primary focus-visible:shadow-[0_0_0_1px_var(--primary)]`. This matches Twenty's single-pixel inner glow for inline edits. Keep 3 px ring for explicit form inputs (`input.tsx`) where accessibility matters more than density.

### 6.9 Kanban card consistency

**File:** `src/components/crm/kanban-board.tsx`, `src/components/crm/deal-kanban-card.tsx`

Add `rounded-md border border-app-border-subtle bg-app-surface p-3 hover:bg-app-hover/35` to the card itself (currently borderless). Match `rounded-md` (8 px) to Twenty. Remove any `card-shimmer-sweep` utility.

### 6.10 Canvas background for CRM routes only

**File:** `app/globals.css` (add scoped override) or per-route wrapper

Inside `app/(dashboard)/customers/**`, wrap the page with a `bg-background` (white) override instead of inheriting warm paper. Chat and settings can keep the paper tone.

### 6.11 Shadow role collapse

**File:** `app/globals.css`

Add four named tokens mapping onto existing shadows:

```
--shadow-surface-light: var(--shadow-sm);      // popovers, floating
--shadow-surface-strong: var(--shadow-lg);     // modals, elevated
--shadow-surface-underline: 0 1px 0 0 rgb(0 0 0 / 0.2);
--shadow-surface-menu: var(--shadow-2xl);      // dropdowns, context menus
```

Use these four role names from now on. The raw 8-tier scale stays available.

### 6.12 Hover duration shortening

Global: where CRM surfaces use `transition-all` without a duration, explicitly apply `duration-100`. This is the single most perceptible "feel" change.

---

## 7. Files to Copy From Twenty (Reference Map)

Copy the *values*. The files are reference material; we translate to Tailwind utilities.

| Sunder file | Study Twenty file |
|---|---|
| `app/globals.css` @theme color block | `packages/twenty-ui/src/theme/constants/ThemeLight.ts`, `GrayScaleLight.ts`, `MainColorsLight.ts`, `SecondaryColorsLight.ts` |
| `app/globals.css` @theme spacing/radius | `packages/twenty-ui/src/theme/constants/spacingValues.ts`, `BorderCommon.ts` |
| `app/globals.css` @theme shadow | `packages/twenty-ui/src/theme/constants/BoxShadowLight.ts` |
| `app/globals.css` typography utilities | `packages/twenty-ui/src/theme/constants/FontCommon.ts`, `FontLight.ts` |
| `src/components/ui/badge.tsx` | `packages/twenty-ui/src/components/chip/Chip.tsx`, `packages/twenty-ui/src/components/tag/Tag.tsx` |
| `src/components/ui/button.tsx` | `packages/twenty-ui/src/components/button/MainButton.tsx`, `Button.tsx` |
| `src/components/ui/input.tsx` | `packages/twenty-ui/src/components/input/components/TextInput.tsx`, `SearchInput.tsx` |
| `src/components/ui/avatar.tsx` | `packages/twenty-ui/src/components/avatar/Avatar.tsx` |
| `src/components/ui/list-table.tsx` | `packages/twenty-front/src/modules/object-record/record-table/record-table-body/components/RecordTableBody.tsx`, `record-table-header/components/RecordTableHeader.tsx`, `record-table-cell/components/RecordTableCellContainer.tsx` |
| `src/components/crm/kanban-board.tsx`, `deal-kanban-card.tsx` | `packages/twenty-front/src/modules/object-record/record-board/**` and `RecordBoardCard.tsx` |
| `src/components/crm/record-drawer/*` | `packages/twenty-front/src/modules/object-record/record-show/**`, `packages/twenty-front/src/modules/object-record/record-field/**` |
| `src/components/layout/app-sidebar.tsx` | `packages/twenty-front/src/modules/navigation/MainNavigationDrawer*`, `WorkspaceSectionContainer.tsx` |
| `src/components/ui/skeleton.tsx` | `packages/twenty-ui/src/components/skeleton-loader/**` |
| Empty state | `packages/twenty-ui/src/components/animated-placeholder/**` |

---

## 8. Explicit Non-Goals

- **No brand repaint.** Keep Flexoki. Keep teal primary where it is today outside the CRM surface.
- **No font swap.** Keep Figtree / Fraunces / Geist Mono loading. Drop Fraunces *usage* from CRM surfaces only.
- **No restructure.** Architecture concerns (views, record-index shell, page layouts) are covered in the sibling file `crm-ux-gold-standard-drift-analysis.md`. This document does not touch them.
- **No new animations.** Motion budget for CRM surfaces is: `0.1s` hover, `0.3s` selection, nothing else.
- **No new dependencies.** No Linaria, no Emotion, no Radix Colors package. Our existing Tailwind + ShadCN + Flexoki stack can express every target value.

---

## 9. Acceptance Criteria

A CRM surface is "aesthetically converged" with Twenty when:

1. Any table row is 32 px tall with 0 vertical padding.
2. Any status chip / tag is ≤ 16 px tall, 4 px radius, soft-tone color pair.
3. A selected row is tinted blue (not darker gray).
4. Record-detail field labels are mixed-case at ~13 px medium, secondary gray.
5. Buttons land on an 8 px radius; focus is signaled by border color + optional 1 px inner glow, not a 3 px outer ring.
6. Table avatars are 16 px; record-header avatars are 40 px.
7. No shimmer, no wobble, no bouncy spring curve on `/customers/*` routes.
8. CRM canvas is white (or near-white); paper tone is only on chat / landing / settings.
9. Hover transitions run at 100 ms; row-selection at 300 ms.
10. Sidebar active item is a gray wash, not a brand-color fill.

Hitting those ten is the entire visual convergence.
