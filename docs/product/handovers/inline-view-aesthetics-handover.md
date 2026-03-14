# Inline View Components — Aesthetic Upgrade Handover

## Objective

Elevate the 8 custom inline view components from functional data cards to polished CRM analytics dashboard quality. These components render inside chat messages when the AI agent presents structured CRM data (deals, contacts, tasks, metrics, charts). They should feel like fragments of a best-in-class CRM analytics page — not raw data dumps.

**North star references:** Study the dashboard/analytics pages of HubSpot, Attio, and Close CRM. Pay attention to:
- How metric tiles use color, weight, and whitespace to create scannable hierarchy
- How deal/contact cards use subtle accents (colored borders, avatars, icons) to anchor the eye
- How charts integrate with surrounding content (titles, insights, legends)
- How inline cards balance information density with breathing room

These components appear **inline in a chat conversation**, so they must be compact — but they should still carry the visual confidence of a standalone analytics page.

## What You're Working With

### File map (read all of these first)

| File | What it is |
|---|---|
| `src/components/views/stat-metric.tsx` | Headline metric tile (label, value, trend arrow) |
| `src/components/views/deal-card.tsx` | Deal summary card (address, price, stage badge) |
| `src/components/views/contact-card.tsx` | Contact summary card (name, type badge, subtitle) |
| `src/components/views/task-item.tsx` | Task row (title, due date, status, context) |
| `src/components/views/chart-panels.tsx` | 4 chart types: Bar, Donut, Funnel, Line (uses Recharts + ShadCN chart primitives) |
| `src/lib/views/registry.tsx` | Maps component names to React implementations |
| `src/lib/views/catalog.ts` | **READ-ONLY** — Zod schemas + descriptions for LLM prompt. Do not modify. |
| `src/lib/views/renderer.tsx` | Provider stack that wraps all inline views |
| `src/components/ui/card.tsx` | Base Card primitive (ShadCN) |

### How they get rendered

1. The LLM writes a JSONL spec inside a ` ```spec ` fence in its text output
2. `pipeJsonRender()` on the server extracts the spec from the stream
3. The client receives spec data parts and renders them via `ViewRenderer` → `registry` → individual components
4. Components receive props that match the Zod schemas in `catalog.ts`

### What exists today

All 8 custom components share the same card treatment:
```
<Card size="sm" className="h-full border-border/60 bg-card/80">
```

This is consistent but visually flat. Specific issues:
- **StatMetric**: Trend indicator is plain text arrows (`↑ ↓ →`). Value sizing is fixed `text-2xl` regardless of content length. No visual differentiation between metrics.
- **DealCard**: Address + price + optional stage badge. No visual anchor — all cards look identical at a glance. No stage-based color coding beyond the badge itself.
- **ContactCard**: Name + type badge + subtitle. No avatar or visual identifier. Cards are hard to distinguish in a grid.
- **TaskItem**: Overdue tasks only get rose text color — easy to miss. Contact/deal context is plain text with no visual structure.
- **Charts**: Functional but plain. Empty states are a dashed border box. No insight styling. Center label on donuts uses absolute positioning.

## Constraints

### Hard constraints (do not violate)

1. **Do not add new components** — Each component in the catalog costs ~60-100 tokens in the system prompt, paid on every request. Adding components is a separate product decision.
2. **Do not change the shadcn base 6** — Card, Grid, Tabs, Text, Badge, Table come from `@json-render/shadcn`. We don't control their implementation.
3. **Maintain dark mode compatibility** — Use Tailwind theme tokens (`text-foreground`, `bg-card`, `border-border`, etc.), not hard-coded colors. Test in both light and dark.

### Schema/prop changes (allowed with justification)

`src/lib/views/catalog.ts` defines the Zod schemas and descriptions that get injected into the LLM's system prompt via `catalog.prompt()`. Every prop costs ~10-20 input tokens per request, forever. Every description/example change also costs tokens. So:

**Default to deriving visuals from existing props.** Most improvements can be computed from what the LLM already sends — e.g. mapping the `stage` prop to a border color, computing initials from `name`, mapping `status` to an icon. These are free in token cost and don't change the LLM contract.

**If a visual improvement genuinely cannot be achieved without a new prop**, it may be added under these conditions:
1. The prop is optional (`.nullable()`) — existing specs without it still render correctly
2. The prop is a constrained enum or short string, not open-ended (e.g. `z.enum(["deals", "contacts", "revenue", "tasks"]).nullable()`, not `z.string()`)
3. The total token cost increase across the full catalog stays under ~100 tokens
4. The description and example in `catalog.ts` are updated to teach the LLM when to use the new prop
5. Document the token cost justification in the PR description (before vs after character count of `catalog.prompt()` output)

### Soft constraints (prefer but negotiate if needed)

- Keep components compact — these render inline in chat, not on a full-page dashboard
- Avoid adding heavy dependencies (no new charting libraries, icon packs, etc.)
- Use existing ShadCN primitives and Tailwind utilities where possible
- Maintain the existing test structure in `*.test.tsx` files — update tests if markup changes break them

## Investigation & Improvement Areas

Work through each component systematically. For each one, study CRM analytics best practices, then improve.

### StatMetric
- Replace plain text arrows with a styled trend indicator (colored pill/chip with arrow icon, or a small colored bar)
- Add `tabular-nums` font feature for numeric values so digits align in a grid
- Consider subtle background tint based on trend direction (very light green for up, very light rose for down)
- Ensure the value text scales gracefully for both short ("3") and long ("$1,200,000") values

### DealCard
- Add a stage-colored left border accent (e.g. 3px left border, color derived from the `stage` prop value). Map stages to semantic colors.
- Improve the address/price visual hierarchy — address is the identifier, price is the key metric. They should read differently.
- Consider a subtle property icon (home/building) as a visual anchor — but only if it can be done with an inline SVG, no icon library

### ContactCard
- Add an initials avatar circle (compute from `name` prop, deterministic color from a small palette). This is the single highest-impact visual change — gives every card a unique anchor.
- Improve the layout: avatar left, name + subtitle right, badge top-right
- The initials avatar is purely derived from the `name` prop — no schema change needed

### TaskItem
- Add a stronger overdue visual: colored left border accent (rose) or light background tint, not just text color
- Style the contact/deal context as small inline chips rather than plain text
- Consider a subtle checkbox-style icon for the status (open = empty circle, completed = filled check circle) — inline SVG only

### Chart Panels (all 4)
- Polish the `ChartPanelShell` wrapper: refine card header spacing, title/subtitle weight
- Style the `insight` text distinctly — currently it's plain `text-sm text-muted-foreground`, same as every other secondary text. Consider a light background pill or a left-border accent quote style.
- Improve the empty state: add a subtle chart icon, soften the messaging
- Donut: improve the center label treatment (currently absolute-positioned span)
- Bar/Line: review axis label styling, grid line opacity, bar radius
- Funnel: verify legend readability with 5+ segments
- Review the color palette (`--chart-1` through `--chart-5`) — ensure sufficient contrast between adjacent segments in all chart types

### Cross-cutting
- Review the shared `border-border/60 bg-card/80` treatment — is the reduced opacity the right call, or should cards have more presence?
- Check spacing consistency: gap sizes, padding, margin between components in a Grid
- Verify all components look correct at mobile widths (they render in a chat panel that can be narrow)
- Test with realistic data volumes: 1 card, 3 cards in a grid, 8+ cards with repeat/scroll

## Deliverables

1. **Implement the styling changes** directly in the component files
2. **Update tests** in `*.test.tsx` if markup structure changes (e.g. new wrapper divs, changed class names)
3. **Screenshots** — before/after for each component, in both light and dark mode, showing:
   - Single component
   - 3-4 components in a Grid layout
   - A realistic "show me my pipeline" view with mixed StatMetrics + DealCards + a chart
4. **Brief notes** on any changes that were considered but rejected, and why

## How to Test Visually

The fastest way to see components rendered is via the existing test files and Storybook (if available), or by triggering views in the chat:

- Ask the agent: "Show me my deals" → DealCards in a Grid
- Ask the agent: "How's my pipeline?" → StatMetrics + chart
- Ask the agent: "What tasks are due this week?" → TaskItems
- Ask the agent: "Show me my contacts" → ContactCards in a Grid

If the dev environment doesn't have agent access, create a simple test page that renders `ViewRenderer` with hard-coded specs matching the examples in `catalog.ts`.

## Out of Scope

- New component types
- Animation or transitions (keep it simple for v1)
- Interactive features (click-to-navigate, filtering) — views are read-only snapshots
- Changes to how/when the LLM decides to emit views (system prompt logic)
