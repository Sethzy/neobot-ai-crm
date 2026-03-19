# Task: Audit Dashboard Components for Raw Tailwind Palette Classes

**Status:** Ready to execute
**Depends on:** Commit `6ef5522` (feat(flexoki-accent-colors): add semantic dashboard accent)
**Estimated effort:** Small — grep + targeted fixes, no architectural changes

---

## Context

We just landed a semantic design system for accent colors across the app dashboard. All accent colors now flow through a three-layer CSS token hierarchy defined in `app/globals.css`:

```
Layer 1 — Raw Flexoki palette vars (private, :root/.dark only)
Layer 2 — Semantic tokens: --warning, --success, --info, --approval, --denied, --syntax-*
Layer 3 — Domain tokens: --stage-*, --status-*, --filetype-*
```

Components should reference Layer 2/3 only via Tailwind utilities (`text-warning`, `bg-stage-leads/10`, `border-l-status-open`, etc.). No `dark:` prefixes needed on accent colors — the CSS cascade handles light/dark automatically.

**The migration covered ~30 files but may have missed some.** Your job is to find and fix any remaining raw Tailwind palette classes in dashboard components.

---

## Scope

**In scope:** Everything under `src/components/` and `app/(dashboard)/` that renders in the app dashboard.

**Out of scope — DO NOT touch:**
- `src/components/landing/` — landing pages use a separate scoped theme
- `.landing-page` scoped styles in `globals.css`
- `bg-[#024F46]` / `text-[#024F46]` — intentional Sunder brand color (used in EmptyState sparkle)
- `text-white` / `text-black` — these are neutral, not accent palette
- `bg-muted`, `text-foreground`, `border-border`, etc. — these are already semantic shadcn tokens
- `bg-zinc-*`, `text-zinc-*` — neutral gray scale, not accent colors (though `text-zinc-900`, `bg-zinc-50` etc. in dashboard components should ideally be `text-foreground`, `bg-muted/30` — fix these too if you spot them, but they're lower priority)

---

## Step 1 — Find violations

Run these greps to find raw Tailwind accent palette classes in dashboard components:

```bash
# Accent palette colors (HIGH priority — these should all be tokens)
rg "(text|bg|border|ring)-(amber|emerald|green|rose|sky|violet|orange|cyan|indigo|pink|teal|red|blue|purple)-[0-9]" src/components/ --glob '!**/landing/**' -n

# Also check app/(dashboard) routes
rg "(text|bg|border|ring)-(amber|emerald|green|rose|sky|violet|orange|cyan|indigo|pink|teal|red|blue|purple)-[0-9]" "app/(dashboard)/" -n

# dark: prefixes on accent colors (should not exist post-migration)
rg "dark:(text|bg|border)-(amber|emerald|green|rose|sky|violet|orange|cyan|indigo|pink|teal|red|blue|purple)" src/components/ --glob '!**/landing/**' -n
```

For each hit, classify as:
- **Fix** — should be replaced with a semantic/domain token
- **Skip** — landing page, brand color, or intentionally raw

---

## Step 2 — Apply the replacement map

Use these token mappings (same ones from the original migration):

### Semantic tokens (Layer 2)
| Old pattern | New token | Use case |
|---|---|---|
| `green-500/600/700` for success states | `text-success`, `bg-success/10` | Checkmarks, passing, completed |
| `red-500/600/700` for errors | `text-destructive`, `bg-destructive/10` | Errors, failures, delete |
| `amber-500/600/700` for warnings | `text-warning`, `bg-warning/10` | Overdue, caution, pending |
| `blue-500/600/700` for info | `text-info`, `bg-info/10` | Open, informational |
| `green-600 dark:green-400` (syntax) | `text-syntax-string` | JSON string values |
| `blue-600 dark:blue-400` (syntax) | `text-syntax-number` | JSON number values |
| `amber-600 dark:amber-400` (syntax) | `text-syntax-boolean` | JSON boolean values |

### Domain tokens (Layer 3)
| Old pattern | New token | Use case |
|---|---|---|
| Stage-specific colors | `bg-stage-leads/10`, `border-t-stage-negotiation` | Deal pipeline stages |
| Task status colors | `bg-status-open/10`, `border-t-status-completed` | Task board |
| File type colors | `text-filetype-spreadsheet`, `text-filetype-pdf` | File icons |

### Neutral replacements
| Old pattern | New token |
|---|---|
| `text-zinc-900` | `text-foreground` |
| `text-zinc-700` | `text-foreground/80` |
| `text-zinc-500/600` | `text-muted-foreground` |
| `bg-zinc-50` | `bg-muted/30` |
| `bg-zinc-100` | `bg-muted` |
| `border-zinc-200` | `border-border` |

### Class-string maps
If a component defines its own inline color map (e.g., `const colorMap = { leads: "bg-amber-100 text-amber-700", ... }`), replace it with an import from `src/lib/ui/color-maps.ts`. That file is the single source of truth for all class-string maps.

---

## Step 3 — Remove dark: prefixes

When replacing accent colors, **delete the `dark:` prefix variant entirely**. The token system handles dark mode via CSS variable swapping.

```tsx
// BEFORE
"text-green-600 dark:text-green-400"

// AFTER
"text-success"
```

---

## Step 4 — Update any broken tests

If a test file asserts old raw palette classes (e.g., `expect(el).toHaveClass("text-amber-500")`), update the assertion to match the new token class. Pattern:

```ts
// BEFORE
expect(icon).toHaveClass("text-amber-500");
// AFTER
expect(icon).toHaveClass("text-warning");
```

---

## Step 5 — Verify

```bash
pnpm vitest run    # all tests pass
pnpm build         # clean build, no Tailwind warnings
```

Then re-run the greps from Step 1 — should return zero hits (or only intentional skips).

---

## Reference files

| File | Purpose |
|---|---|
| `app/globals.css` | Token definitions (Layer 1/2/3) + `@theme inline` registrations |
| `src/lib/ui/color-maps.ts` | Centralized class-string maps |
| `src/lib/ui/color-maps.test.ts` | Tests ensuring no raw palette leaks in maps |
| `roadmap docs/Sunder - Source of Truth/ux-and-pm/design-system.md` | Design system reference |
| `docs/product/tasks/2026-03-19-flexoki-accent-colors-tasklist.md` | Original migration tasklist |

## Commit convention

```
fix(design-system): remove remaining raw Tailwind palette classes from dashboard
```
