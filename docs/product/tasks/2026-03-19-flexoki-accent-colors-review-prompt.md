# Review Prompt — Flexoki Accent Colors Design System

**Reviewer:** Please review the uncommitted changes on `main` that implement a semantic-first design system for accent colors across the Sunder app dashboard.

**Scope:** App dashboard only. Landing pages (`/`, `/market/*`) are intentionally untouched.

---

## What changed and why

The dashboard previously used arbitrary hardcoded Tailwind palette classes (`bg-amber-500`, `text-green-600`, `dark:text-emerald-300`, etc.) scattered across ~30 component files. These weren't Flexoki values, required manual `dark:` prefixes, and couldn't be changed consistently.

This PR introduces a three-layer CSS token hierarchy so that every accent color in the dashboard derives from Flexoki palette variables:

```
Layer 1 — Raw Flexoki palette (:root/.dark only, private)
  --flexoki-orange, --flexoki-yellow, --flexoki-green, etc.

Layer 2 — Semantic tokens (chain to Layer 1)
  --warning, --success, --info, --approval, --denied, --syntax-*

Layer 3 — Domain tokens (chain to Layer 1)
  --stage-leads, --status-open, --filetype-pdf, etc.
```

Components now reference Layer 2/3 only. Dark mode is handled by CSS cascade — no `dark:` class prefixes needed on color utilities.

---

## Key files

| File | Role |
|---|---|
| `app/globals.css` | All three token layers + `@theme inline` registrations |
| `src/lib/ui/color-maps.ts` | NEW — centralized class-string maps (single source of truth) |
| `src/lib/ui/color-maps.test.ts` | NEW — 13 tests ensuring no raw Tailwind palette leaks |
| `src/lib/crm/display.ts` | Delegates to color-maps; `getAvatarColor` → `avatarColorFor` rename |
| `src/components/ui/badge.tsx` | success/warning/info variants simplified |

---

## Review checklist

### Token correctness
- [ ] Layer 1 light/dark values in `globals.css` match the [Flexoki spec](https://stephango.com/flexoki) — cross-check the hex table in the tasklist header
- [ ] Layer 2/3 tokens chain to Layer 1 via `var()` — no hardcoded hex values in semantic/domain tokens
- [ ] `@theme inline` registers all new tokens (approval, denied, syntax-*, stage-*, status-*, filetype-*) — Tailwind 4 won't generate utility classes without these

### Dark mode
- [ ] No new `dark:` prefixes were introduced on color classes — the whole point is that Layer 1 swaps handle this
- [ ] `--success-foreground`, `--warning-foreground`, etc. now resolve to `var(--flexoki-bg)` which is near-black in dark mode — confirm this is acceptable for any `text-success-foreground` / `text-warning-foreground` usage (used on solid-color buttons)

### Component migration
- [ ] `display.ts` — `getAvatarColor` is removed, `avatarColorFor` is the replacement. The hash algorithm changed (old: `(hash << 5) - hash`, new: `hash * 31 + charCode`). Avatar color assignments will shift for some names — this is expected and acceptable.
- [ ] `task-kanban-card.tsx` — `text-white` removed from avatar spans since `avatarColorFor` returns both `bg-*` and `text-*` classes. Verify the new text color (e.g., `text-stage-leads` olive-yellow) is readable at `text-[10px]` / `text-[8px]` on the `/15` opacity backgrounds.
- [ ] `deal-card.tsx` — local `stageBorderMap` (including `closed_won`/`closed_lost` aliases) replaced with `DEAL_STAGE_LEFT_BORDER_CLASSES` + a `border-l-border` fallback. Legacy aliases now get a neutral border instead of colored.
- [ ] `tool-call-inline.tsx` — auth card buttons use `bg-warning text-warning-foreground`. In dark mode this is olive-yellow bg + near-black text. Verify contrast.
- [ ] `contact-card.tsx` — local `AVATAR_COLORS` (5 entries) replaced with centralized `avatarColorFor` (8 entries). Color assignments will differ.

### Missed files / stray palette classes
- [ ] Run `grep -rn "text-(amber|emerald|green|rose|sky|violet|orange|cyan)-[0-9]" src/components/` and confirm any remaining hits are landing-page scoped or intentional
- [ ] `bg-[#024F46]` in `analyst-section.tsx` EmptyState sparkle is intentional brand color — do NOT change

### Tests
- [ ] `src/lib/ui/color-maps.test.ts` — 13 tests, all maps assert no raw Tailwind palette leaks
- [ ] Existing test files updated: `stale-indicator`, `tool-call-inline`, `duplicate-indicator`, `status-badge`, `review-actions`, `json-view`, `upload-progress-panel`, `extraction-field` — assertions changed from raw palette classes to semantic tokens
- [ ] Run `pnpm vitest run` — our 9 affected test files should all pass. Pre-existing failures in unrelated files (analyst-section, chat-input, subagent, etc.) are not introduced by this PR.

### Unrelated changes
- [ ] `app/api/chat/route.ts` and `src/lib/runner/run-agent.ts` have uncommitted changes from a prior branch that are NOT part of this design system work. Exclude them from this review and commit separately.

---

## Visual spot-check list

After deploying locally (`pnpm dev`), check these surfaces in both light and dark mode:

1. `/customers/people` — buyer (info/Flexoki blue), seller (success/olive green), landlord (warning/olive yellow) badge tints
2. `/customers/deals/pipeline` — kanban column top-borders and stage chips
3. `/customers/tasks` — task board (Open=cyan, Completed=green)
4. Chat view with a pending tool call — approval dot is olive yellow, deny dot is orange, approve/deny buttons
5. Chat view with a browser auth prompt — warning-toned card
6. Any thread with file downloads — filetype icons
7. `/cases/[id]` validation rules section — warning/success icons and tags
8. Toggle dark mode — all accent colors should adapt without any jarring shifts

---

## Reference docs
- Tasklist: `docs/product/tasks/2026-03-19-flexoki-accent-colors-tasklist.md`
- Design system: `roadmap docs/Sunder - Source of Truth/ux-and-pm/design-system.md`
- Flexoki spec: https://stephango.com/flexoki
