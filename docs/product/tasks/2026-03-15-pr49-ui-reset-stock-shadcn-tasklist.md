# UI Reset — Stock shadcn Components + Custom Theme

**PR:** PR 49: UI reset — stock shadcn components + custom theme
**Decisions:** FOUND-05 (Next.js + React + Tailwind + ShadCN), UX-10 (json-render catalog views)
**Goal:** Reset all shadcn UI components to stock, swap icons to lucide-react, apply a green-anchored custom theme so both the app and json-render inline views share identical base components.

**Architecture:** All shadcn components should match the official source exactly — visual differentiation comes from the CSS theme layer in `globals.css`, not from modifying component code. The only justified component-level customizations are Badge extra variants (success/warning/info) needed for CRM semantics. The icon library is standardized on `lucide-react` (shadcn default) instead of `react-icons/tb`.

**Tech Stack:** shadcn/ui CLI, Tailwind CSS 4, lucide-react, tweakcn theme

---

## Pre-requisites

- Read the shadcn CLI docs: `npx shadcn@latest add --all --overwrite` resets all components to stock
- The tweakcn theme CSS is provided in the PR description (green-anchored palette)
- Reference: json-render shadcn components at `/Users/sethlim/Documents/json-render/packages/shadcn/src/ui/` for stock comparison
- The app currently uses `react-icons/tb` (Tabler Icons) in 19 files — all must be swapped to `lucide-react`

## Important Context

- `src/components/ui/card.tsx` has already been reset to stock in this session
- Chart colors in `globals.css` have already been updated to sunder-green palette
- Custom view components (StatMetric, DealCard, ContactCard, TaskItem, chart panels) are in `src/components/views/` — these are NOT shadcn components and should NOT be overwritten
- The landing page at `app/(marketing)/` has its own scoped theme (`.landing-page` class) — preserve it
- Custom non-shadcn UI components (spinner, button-group, input-group, filter-overlay, empty-state, data-table, json-view, iphone, beams-background, field, row-actions, filter-bar) will NOT be overwritten by the CLI — but some import `react-icons/tb` and need icon swaps

---

### Task 1: Backup and branch

**Files:**
- No file changes

**Step 1: Create a feature branch**

```bash
git checkout -b feat/pr49-ui-reset-stock-shadcn
```

**Step 2: Commit any in-progress work**

```bash
git add -A
git commit -m "chore: snapshot before UI reset"
```

---

### Task 2: Reset shadcn components to stock via CLI

**Files:**
- Overwrite: all files in `src/components/ui/` that match shadcn component names
- Preserve: custom components (spinner.tsx, button-group.tsx, input-group.tsx, filter-overlay.tsx, empty-state.tsx, data-table.tsx, json-view.tsx, iphone.tsx, beams-background.tsx, field.tsx, row-actions.tsx, filter-bar.tsx)

**Step 1: Run the shadcn CLI overwrite**

```bash
npx shadcn@latest add --all --overwrite
```

When prompted, choose "reinstall" to overwrite all existing component files. This will reset: badge, button, card, input, textarea, select, checkbox, separator, skeleton, tabs, label, tooltip, popover, accordion, collapsible, dropdown-menu, radio-group, alert, dialog, sheet, scroll-area, command, calendar, navigation-menu, hover-card, chart.

**Step 2: Verify the overwrite succeeded**

```bash
git diff --stat src/components/ui/
```

Expected: ~15-20 files changed. Card should show minimal diff (already reset). Badge, Button, Select, Accordion, Dropdown-Menu should show significant diffs (icon library + class changes).

**Step 2b: Verify sidebar `offExamples` bug is fixed**

```bash
grep -c "offExamples" src/components/ui/sidebar.tsx
```

Expected: 0 results. The stock sidebar uses `offcanvas`. If `offExamples` still appears, the CLI didn't overwrite sidebar — re-run `npx shadcn@latest add sidebar --overwrite`.

**Step 2c: Check sidebar width and note any intentional overrides needed post-overwrite**

Stock sidebar uses `SIDEBAR_WIDTH = "16rem"`. Our previous custom was `"14rem"`. Decide whether to keep stock or revert. Also check if `no-scrollbar` class was on SidebarContent (custom addition) and if `TooltipProvider` wrapper is now present in SidebarProvider.

**Step 3: Check for TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: MANY errors from `react-icons/tb` imports that no longer match the stock components (stock uses `lucide-react`). This is expected — Task 3 fixes them.

**Step 4: Commit the raw overwrite**

```bash
git add src/components/ui/
git commit -m "feat(pr49): reset all shadcn components to stock via CLI overwrite"
```

---

### Task 3: Re-add justified Badge custom variants

**Files:**
- Modify: `src/components/ui/badge.tsx`
- Test: `src/components/views/contact-card.test.tsx` (uses Badge)

The stock Badge has 6 variants: default, secondary, destructive, outline, ghost, link. The CRM needs 3 more: success, warning, info (total = 9 variants). These are used by:
- `src/lib/crm/display.ts` — `contactTypeBadgeVariantMap` and `dealStageBadgeVariantMap`
- `src/components/crm/stage-badge.tsx`
- `src/components/crm/task-status-badge.tsx`

**Step 1: Read the stock badge after overwrite**

```bash
cat src/components/ui/badge.tsx
```

Verify it has the 6 stock variants: default, secondary, destructive, outline, ghost, link.

**Step 2: Add the 3 custom CRM variants**

Add these variants to the `badgeVariants` cva call, after the stock `link` variant. **IMPORTANT:** Match the hover selector pattern to whatever the CLI produced for stock variants (e.g., `[a&]:hover:` for new-york-v4, `[a]:hover:` for radix-nova). Check the stock `default` variant's hover class and use the same pattern.

```typescript
success:
  "bg-green-500/10 text-green-700 dark:text-green-400 dark:bg-green-500/20 [a&]:hover:bg-green-500/20",
warning:
  "bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:bg-amber-500/20 [a&]:hover:bg-amber-500/20",
info:
  "bg-blue-500/10 text-blue-700 dark:text-blue-400 dark:bg-blue-500/20 [a&]:hover:bg-blue-500/20",
```

(Replace `[a&]` with `[a]` if the CLI output uses `[a]:hover:` instead of `[a&]:hover:`)

**Step 3: Verify the Badge type includes the new variants**

```bash
grep -A 5 "variant:" src/components/ui/badge.tsx
```

Expected: 9 variants listed (6 stock + 3 custom).

**Step 4: Run contact card tests**

```bash
npx vitest run src/components/views/contact-card.test.tsx --reporter=verbose
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "feat(pr49): re-add justified Badge CRM variants (success/warning/info)"
```

---

### Task 4: Swap react-icons/tb to lucide-react in all consumer files

**Files:**
- Modify: 19 files that import from `react-icons/tb` (most will be fixed by CLI overwrite, ~5-6 non-shadcn files remain)
- Reference: `node_modules/lucide-react/dist/esm/icons/` for available icon names

The stock shadcn components now use `lucide-react` internally. The CLI overwrite (Task 2) fixes most `src/components/ui/` files. This task catches the remaining non-shadcn consumer files.

Non-shadcn files requiring manual icon swap (confirmed by grep):
1. `src/components/ui/filter-overlay.tsx` (custom, not overwritten by CLI)
2. `src/components/ui/spinner.tsx` (custom, not overwritten by CLI)
3. `src/components/ui/combobox.tsx` (custom, not overwritten by CLI)
4. `src/components/icons/lucide-compat.tsx`
5. `src/components/icons/app-icons.tsx`
6. `src/components/analyst/file-download.tsx`
7. `src/components/library/library-file-card.tsx`
8. `src/components/landing/SecondaryFeatures.tsx`

**Step 1: Check which files still import react-icons after the shadcn overwrite**

```bash
grep -rl "react-icons/tb" src/
```

The shadcn CLI overwrite (Task 2) should have already fixed most of the `src/components/ui/` files. This step catches the remaining non-shadcn files.

**Step 2: For each remaining file, replace tb icon imports with lucide equivalents**

Common mappings:
- `TbX` → `XIcon` from `lucide-react`
- `TbCheck` → `CheckIcon`
- `TbChevronDown` → `ChevronDownIcon`
- `TbChevronUp` → `ChevronUpIcon`
- `TbChevronRight` → `ChevronRightIcon`
- `TbChevronLeft` → `ChevronLeftIcon`
- `TbSearch` → `SearchIcon`
- `TbPlus` → `PlusIcon`
- `TbFilter` → `FilterIcon`
- `TbCircleFilled` → `CircleIcon`
- `TbCalendar` → `CalendarIcon`
- `TbLoader2` → `Loader2Icon`
- `TbArrowLeft` → `ArrowLeftIcon`

For `src/components/icons/app-icons.tsx` and `src/components/icons/lucide-compat.tsx`: these may be re-export shims. Check if they can be deleted or simplified now that everything uses lucide directly.

**Step 3: Search for any remaining react-icons imports across the entire codebase**

```bash
grep -rl "react-icons" src/
```

Expected: zero results. If any remain, fix them.

**Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(pr49): swap all react-icons/tb imports to lucide-react"
```

---

### Task 5: Apply custom green theme to globals.css

**Files:**
- Modify: `app/globals.css`

**Step 1: Read current globals.css**

Understand the current structure: `:root` vars, `.dark` vars, `@theme inline`, `@layer base`, custom Sunder tokens, landing page scoped theme.

**Step 2: Replace the color palette in `:root` with the tweakcn green theme**

Replace these variable groups in `:root`:
- `--background` through `--ring` (core palette)
- `--chart-1` through `--chart-5` (already done — use sunder-green values)
- `--sidebar-*` variables

Keep these Sunder-specific tokens unchanged:
- `--success`, `--success-foreground`, `--success-border`
- `--info`, `--info-foreground`
- `--warning`, `--warning-foreground`
- `--content-foreground`
- `--tag`, `--tag-foreground`

**Step 3: Replace the `.dark` color palette with tweakcn dark theme**

Same approach — replace core palette, keep Sunder tokens.

**Step 4: Update `@theme inline` section**

Add shadow variables and tracking variables from tweakcn if they don't exist. Keep all existing Sunder color token bridges (`--color-sunder-green`, `--color-parchment`, landing page palette, status colors).

**Step 5: Keep the font stack as Geist Sans**

Do NOT change `--font-sans` to Outfit. Keep: `--font-sans: var(--font-geist-sans), system-ui, sans-serif;`

**Step 6: Preserve the landing page scoped theme**

The `.landing-page { ... }` block in globals.css should remain untouched.

**Step 7: Verify both light and dark mode render correctly**

```bash
npm run dev
```

Check `/chat`, `/crm/contacts`, `/crm/deals`, `/settings` in both light and dark mode.

**Step 8: Commit**

```bash
git add app/globals.css
git commit -m "feat(pr49): apply green-anchored custom theme via globals.css"
```

---

### Task 6: Fix build errors and type mismatches

**Files:**
- Various — depends on what broke

**Step 1: Run full build**

```bash
npx next build
```

**Step 2: Fix any type errors**

Common issues after a shadcn overwrite:
- Components may have lost custom props (e.g., Card `size` prop — already handled)
- Icon component API differences (lucide uses `Icon` suffix, tb uses `Tb` prefix)
- State selector syntax changes (`data-open:` vs `data-[state=open]:`)

**Step 3: Fix any import path issues**

Stock shadcn may add/remove sub-component exports. Check that all imports still resolve.

**Step 4: Run build again to verify**

```bash
npx next build
```

Expected: clean build.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix(pr49): resolve build errors from shadcn overwrite"
```

---

### Task 7: Run full test suite and fix breakages

**Files:**
- Test: all `*.test.tsx` files

**Step 1: Run the full test suite**

```bash
npx vitest run --reporter=verbose
```

**Step 2: Fix any failing tests**

Common test breakages:
- Changed class names (tests that assert on specific CSS classes)
- Changed DOM structure (tests that query by role/structure)
- Changed icon rendering (tests that check for specific icon elements)
- Changed text content (trend arrows changed from ↑ to ↗ — already fixed)

**Step 3: Re-run tests to verify**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(pr49): update tests for stock shadcn component changes"
```

---

### Task 8: Visual QA all app pages

**Files:**
- No code changes expected (fix any issues found)

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Check each page in LIGHT mode**

- [ ] `/login` — auth form, buttons, inputs
- [ ] `/register` — same
- [ ] `/chat` — chat interface, message bubbles, inline views
- [ ] `/crm/contacts` — data table, badges (contact type), filters
- [ ] `/crm/deals` — data table, stage badges, board view
- [ ] `/crm/tasks` — data table, status badges, calendar
- [ ] `/crm/companies` — data table, industry badges
- [ ] `/crm/contacts/[id]` — detail page, tabs, inline edit
- [ ] `/crm/deals/[id]` — detail page, tabs
- [ ] `/settings` — forms, inputs, selects
- [ ] `/automations` — automation cards, trigger badges
- [ ] `/memory` — file viewer, tabs

**Step 3: Repeat in DARK mode**

Toggle dark mode and check all pages again. Pay attention to:
- Badge contrast (especially success/warning/info on dark backgrounds)
- Card borders (should be visible but subtle)
- Chart colors (should be sunder-green palette)
- Input/select focus rings (should use new primary color)

**Step 4: Check inline views in chat**

Trigger views with these prompts:
- "Give me a full pipeline overview" — StatMetrics + DealCards + Chart
- "Show me my contacts" — ContactCards with avatars
- "What tasks are due?" — TaskItems with overdue treatment
- "Show me deals by stage as a chart" — Chart with insight callout

**Step 5: Fix any visual issues found**

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(pr49): visual QA fixes"
```

---

### Task 9: Final verification and PR

**Step 1: Run final build + tests**

```bash
npx next build && npx vitest run
```

Both must pass.

**Step 2: Verify no react-icons remain**

```bash
grep -rl "react-icons" src/
```

Expected: zero results.

**Step 3: Verify Badge has exactly 9 variants (6 stock + 3 custom)**

```bash
grep -c "variant" src/components/ui/badge.tsx
```

**Step 4: Create PR**

```bash
git push -u origin feat/pr49-ui-reset-stock-shadcn
gh pr create --title "feat(pr49): UI reset — stock shadcn + custom theme" --body "..."
```

---

## Relevant Files

### Shadcn components (will be overwritten by CLI):
- `src/components/ui/badge.tsx` — needs custom variants re-added
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx` — already reset to stock
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/accordion.tsx`
- `src/components/ui/collapsible.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/ui/navigation-menu.tsx`
- `src/components/ui/hover-card.tsx`
- `src/components/ui/chart.tsx`

### Icon migration files (non-shadcn, require manual swap):
- `src/components/icons/lucide-compat.tsx`
- `src/components/icons/app-icons.tsx`
- `src/components/ui/filter-overlay.tsx`
- `src/components/ui/spinner.tsx`
- `src/components/ui/combobox.tsx`
- `src/components/analyst/file-download.tsx`
- `src/components/library/library-file-card.tsx`
- `src/components/landing/SecondaryFeatures.tsx`

### Theme:
- `app/globals.css`

### CRM badge consumers (verify after Badge reset):
- `src/lib/crm/display.ts`
- `src/components/crm/stage-badge.tsx`
- `src/components/crm/task-status-badge.tsx`

### View components (should NOT be overwritten — verify unchanged):
- `src/components/views/stat-metric.tsx`
- `src/components/views/deal-card.tsx`
- `src/components/views/contact-card.tsx`
- `src/components/views/task-item.tsx`
- `src/components/views/chart-panels.tsx`
