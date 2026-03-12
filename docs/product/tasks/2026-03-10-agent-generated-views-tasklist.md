# Agent-Generated Views Implementation Plan

**PR:** PR 42a: Agent-generated views (inline, json-render)
**Decisions:** UX-10
**Goal:** Let the agent respond with visual components (stat cards, tables, kanban boards, and compact snapshot charts) rendered inline in chat using Vercel Labs json-render.

**Architecture:** The agent calls a `show_view` tool that outputs a JSON spec + pre-computed state. The frontend extracts `tool-show_view` parts from the message (like `ask_user_question`) and renders them **outside** the steps accordion via json-render's `Renderer` + `StateProvider`, while keeping the `show_view` tool call visible inside the expanded `StepsSummary` as an inspectable fallback. No saved/pinned views, no DB migration, no sidebar changes, and no live report/query layer. Views live in chat only. Charts in PR42a are snapshot panels backed by aggregated state, not live analytics dashboards. (UX-10: Tier 1 catalog-based JSON specs.)

**Tech Stack:** `@json-render/core`, `@json-render/react`, `@json-render/shadcn`, existing `recharts`, Vitest, React Testing Library

**Design Doc:** `docs/product/designs/pr31-agent-generated-views.md`

## Scope Update (2026-03-11)

This revision widens PR42a slightly so inline views can feel closer to Dench's analytics cards without turning into a separate analytics/reporting subsystem.

- Add 3 custom snapshot chart components: `BarChartPanel`, `DonutChartPanel`, `FunnelChartPanel`.
- Use the repo's existing `recharts` dependency inside those components. Do **not** depend on undocumented `@json-render/shadcn` `Chart`.
- Borrow Dench-style presentation cues: strong panel titles, a clear timeframe badge, a one-sentence insight strip, and compact 2-up chart layouts inside the rendered view.
- Keep the non-goals explicit: no live queries at render time, no refresh button, no filter chips, no "live" badge, no pinned/saved reports, no workspace report viewer.
- Keep chart data compact and aggregated (counts, totals, stage/source breakdowns). Do **not** pass raw deal/task lists just to draw a chart.

---

## Relevant Files

### New Files
- `src/lib/views/catalog.ts` — json-render catalog with **explicit allowlist** (13 components: Card, Grid, Tabs, Text, Badge, Table + 4 CRM + 3 snapshot charts)
- `src/lib/views/catalog.test.ts` — catalog validation tests including invalid component rejection
- `src/lib/views/registry.tsx` — maps catalog component names to React implementations
- `src/components/views/view-card.tsx` — inline chat wrapper (StateProvider + Renderer)
- `src/components/views/view-card.test.tsx` — ViewCard rendering tests
- `src/components/views/stat-metric.tsx` — custom StatMetric component (accepts resolved `value` prop)
- `src/components/views/stat-metric.test.tsx` — StatMetric tests
- `src/components/views/deal-card.tsx` — custom DealCard component (extracted from deals page)
- `src/components/views/deal-card.test.tsx` — DealCard tests
- `src/components/views/contact-card.tsx` — custom ContactCard component
- `src/components/views/contact-card.test.tsx` — ContactCard tests
- `src/components/views/task-item.tsx` — custom TaskItem component
- `src/components/views/task-item.test.tsx` — TaskItem tests
- `src/components/views/chart-panels.tsx` — custom `BarChartPanel`, `DonutChartPanel`, `FunnelChartPanel` snapshot components
- `src/components/views/chart-panels.test.tsx` — chart panel tests
- `src/lib/runner/tools/views/index.ts` — view tool barrel
- `src/lib/runner/tools/views/show-view.ts` — show_view tool definition with full catalog validation + ~4KB full-output size cap
- `src/lib/runner/tools/views/show-view.test.ts` — show_view tool tests (valid spec, invalid component rejection, size cap)

### Modified Files
- `src/lib/runner/tools/index.ts` — add `createViewTools` export
- `src/lib/runner/tool-registry.ts` — register view tools (main runner only, excluded from subagents)
- `src/components/chat/message-bubble.tsx` — extract `tool-show_view` parts and render outside accordion
- `src/components/chat/tool-call-inline.tsx` — render ViewCard for show_view instead of JsonView (inside accordion fallback)
- `src/lib/ai/system-prompt.ts` — add `<view-guidance>` block to output-guidance

### Reference Files (read-only, for context)
- `docs/product/designs/pr31-agent-generated-views.md` — full design doc with decisions log
- `src/components/crm/deal-kanban-card.tsx` — existing DealKanbanCard to extract from
- `src/components/crm/task-kanban-card.tsx` — existing TaskKanbanCard to extract from
- `src/components/crm/contacts-table.tsx` — existing contact rendering patterns
- `src/components/crm/stage-badge.tsx` — stage badge styling
- `src/components/crm/task-status-badge.tsx` — task status badge styling
- `src/lib/crm/display.ts` — formatCrmPrice, formatCrmDate, getAvatarColor utilities
- `src/components/property/charts/*.tsx` — existing Recharts patterns and styling conventions
- `src/lib/property/chart-colors.ts` — existing chart color palette helpers
- `src/components/ui/json-view.tsx` — what ViewCard replaces for show_view output
- `src/lib/runner/tools/utility/send-message.ts` — reference for minimal tool factory pattern (uses `inputSchema`)
- `src/lib/runner/compaction.ts` — `ARTIFACT_SIZE_THRESHOLD_BYTES = 5_000`
- `src/lib/runner/toolcall-artifacts.ts` — truncation logic for oversized tool outputs
- `src/components/chat/ask-user-question-inline.tsx` — reference for inline-outside-accordion pattern

---

## Task 1: Install json-render Dependencies and Verify the Real Package API

**Files:**
- Modify: `package.json`

**Step 1: Install the three json-render packages with the repo-standard package manager**

```bash
pnpm add @json-render/core @json-render/react @json-render/shadcn
```

**Step 2: Verify installation**

```bash
pnpm list @json-render/core @json-render/react @json-render/shadcn
```

Expected: All three packages listed with resolved versions, no `MISSING` or `ERR`.

**Step 3: Verify the installed package API before writing tests or code**

Use the installed types/docs as the source of truth for the implementation details below. Confirm:

- `schema` is imported from `@json-render/react/schema`
- standard catalog definitions come from `@json-render/shadcn/catalog`
- standard React implementations come from `@json-render/shadcn`
- `StateProvider`, `Renderer`, and `defineRegistry` are exported from `@json-render/react`
- `recharts` is already available in the repo and can be reused for custom chart panels

If the installed package disagrees with this tasklist, **the installed package wins** and the engineer should adjust the catalog/registry snippets before proceeding.

**Step 4: Verify the app still compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No type errors.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(pr42a): install json-render dependencies"
```

---

## Task 2: Define the View Catalog (Narrow Allowlist)

The catalog tells json-render (and the LLM) which components are valid. It defines the contract between the agent and the frontend. For standard shadcn components, use the official component definitions from `@json-render/shadcn/catalog` instead of hand-maintaining duplicate prop schemas.

**Key decision (review #1):** Catalog explicitly defines 13 allowed components — NOT a passthrough of all 36 ShadCN components. The allowlist is: `Card`, `Grid`, `Tabs`, `Text`, `Badge`, `Table` (from the documented ShadCN built-ins) + `StatMetric`, `DealCard`, `ContactCard`, `TaskItem`, `BarChartPanel`, `DonutChartPanel`, `FunnelChartPanel` (custom CRM/view components). The agent cannot produce components outside this list.

**Key decision (review #2):** `StatMetric` accepts a resolved `value` prop (string | number), NOT a `valuePath`. json-render resolves `$state` expressions before props reach components, so StatMetric never sees JSON Pointers — it receives the already-resolved value.

**Key decision (new):** Repeated lists/boards must use json-render's `repeat` + `$item` pattern. Do **not** generate one element per row/deal/task — that is repetitive, harder to validate, and more likely to exceed the tool-output truncation threshold.

**Key decision (new):** PR42a charts are custom Recharts-backed snapshot panels. Do **not** use or depend on `@json-render/shadcn` `Chart`, even if the installed package happens to expose it.

**Key decision (new):** Chart props must be aggregated and compact. Prefer 4-8 data points with short labels, totals, and percentages. No fake refresh controls, no filter chips, and no "live" badge copy in the rendered view.

**Files:**
- Create: `src/lib/views/catalog.ts`
- Create: `src/lib/views/catalog.test.ts`

**Reference:**
- `docs/product/designs/pr31-agent-generated-views.md` — see "Example spec + state" section, but prefer the corrected patterns in this tasklist where they differ
- json-render docs: `defineCatalog()` from `@json-render/core`, `schema` from `@json-render/react/schema`, and `shadcnComponentDefinitions` from `@json-render/shadcn/catalog`

**Step 1: Write failing tests for catalog validation**

Create `src/lib/views/catalog.test.ts`:

```typescript
/**
 * Tests for the json-render view catalog definition.
 * Validates the narrow allowlist, prompt generation, and real catalog validation.
 * @module lib/views/catalog.test
 */
import { describe, expect, it } from "vitest";

import { catalog, ALLOWED_COMPONENT_TYPES } from "./catalog";

describe("view catalog", () => {
  it("exports the ALLOWED_COMPONENT_TYPES set for validation", () => {
    expect(ALLOWED_COMPONENT_TYPES).toBeInstanceOf(Set);
    expect(ALLOWED_COMPONENT_TYPES.has("StatMetric")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("BarChartPanel")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("Card")).toBe(true);
    // Components NOT in the allowlist should be absent
    expect(ALLOWED_COMPONENT_TYPES.has("Dialog")).toBe(false);
    expect(ALLOWED_COMPONENT_TYPES.has("Popover")).toBe(false);
    expect(ALLOWED_COMPONENT_TYPES.has("Textarea")).toBe(false);
    expect(ALLOWED_COMPONENT_TYPES.has("Chart")).toBe(false);
  });

  it("generates a prompt string containing allowed components", () => {
    const prompt = catalog.prompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("StatMetric");
    expect(prompt).toContain("DealCard");
    expect(prompt).toContain("Card");
  });

  it("validates a minimal spec that uses $state for a custom component prop", () => {
    const result = catalog.validate({
      root: "metric",
      elements: {
        metric: {
          type: "StatMetric",
          props: {
            label: "Active Deals",
            value: { $state: "/stats/activeDeals" },
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a spec with an unsupported component type", () => {
    const result = catalog.validate({
      root: "dialog",
      elements: {
        dialog: {
          type: "Dialog",
          props: {},
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run src/lib/views/catalog.test.ts
```

Expected: FAIL — `Cannot find module './catalog'`

**Step 3: Implement the catalog**

Create `src/lib/views/catalog.ts`:

```typescript
/**
 * json-render catalog defining the narrow allowlist of view components.
 * Only components listed here can be produced by the agent.
 * Standard shadcn component definitions come from the package directly to avoid
 * drifting from upstream prop schemas.
 *
 * Allowlist (13 components):
 *   ShadCN built-ins: Card, Grid, Tabs, Text, Badge, Table
 *   Custom CRM/View: StatMetric, DealCard, ContactCard, TaskItem,
 *   BarChartPanel, DonutChartPanel, FunnelChartPanel
 *
 * @module lib/views/catalog
 */
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

/**
 * Set of allowed component type names.
 * Used for prompt/test ergonomics and human-readable error messages.
 * Runtime acceptance still goes through catalog.validate(spec).
 */
export const ALLOWED_COMPONENT_TYPES = new Set([
  // ShadCN built-ins (narrow selection)
  "Card", "Grid", "Tabs", "Text", "Badge", "Table",
  // Custom CRM/view components
  "StatMetric", "DealCard", "ContactCard", "TaskItem",
  "BarChartPanel", "DonutChartPanel", "FunnelChartPanel",
]);

export const catalog = defineCatalog(schema, {
  components: {
    // Standard shadcn components — use upstream definitions directly.
    Card: shadcnComponentDefinitions.Card,
    Grid: shadcnComponentDefinitions.Grid,
    Tabs: shadcnComponentDefinitions.Tabs,
    Text: shadcnComponentDefinitions.Text,
    Badge: shadcnComponentDefinitions.Badge,
    Table: shadcnComponentDefinitions.Table,

    // --- Custom CRM Components ---
    /**
     * Big number + label. Used for summary stats like "Active Deals: 29".
     * Accepts a resolved `value` prop — json-render's $state binding resolves
     * the value BEFORE it reaches this component. Do NOT pass a JSON Pointer.
     * In the spec, use: { "value": { "$state": "/stats/activeDeals" } }
     */
    StatMetric: {
      props: z.object({
        label: z.string().describe("Metric label, e.g. 'Active Deals'"),
        value: z.union([z.string(), z.number()]).describe("Resolved metric value (use $state binding in spec)"),
        trend: z.enum(["up", "down", "flat"]).optional().describe("Optional trend arrow"),
      }),
      description:
        "Display a single stat metric — a large number with a label and optional trend indicator. " +
        "Use $state bindings for the value prop, e.g. { \"$state\": \"/stats/activeDeals\" }.",
    },
    /** Compact card for a CRM deal — shows address, price, stage badge. */
    DealCard: {
      props: z.object({
        address: z.string().describe("Property address"),
        price: z.string().describe("Formatted price, e.g. '$1.2M'"),
        stage: z.string().optional().describe("Deal stage, e.g. 'leads', 'negotiation'"),
      }),
      description: "Compact card showing a CRM deal with address, price, and stage badge.",
    },
    /** Compact card for a CRM contact — name, type, optional subtitle. */
    ContactCard: {
      props: z.object({
        name: z.string().describe("Full contact name"),
        type: z.string().optional().describe("Contact type, e.g. 'buyer', 'seller'"),
        subtitle: z.string().optional().describe("Extra context, e.g. last interaction date"),
      }),
      description: "Compact card showing a CRM contact with name, type badge, and optional subtitle.",
    },
    /** Single task row — title, due date, status. */
    TaskItem: {
      props: z.object({
        title: z.string().describe("Task title"),
        dueDate: z.string().optional().describe("Due date, e.g. '8 Mar 2026'"),
        status: z.enum(["open", "completed"]).optional().describe("Task status"),
        contactName: z.string().optional().describe("Associated contact name"),
        dealAddress: z.string().optional().describe("Associated deal address"),
      }),
      description: "Single task line item with title, due date, status, and optional associations.",
    },
    /**
     * Snapshot bar chart panel for compact CRM comparisons like stage/source breakdowns.
     * Accepts aggregated rows only, not raw records.
     */
    BarChartPanel: {
      props: z.object({
        title: z.string().describe("Panel title, e.g. 'Lead Source Performance'"),
        subtitle: z.string().optional().describe("Optional timeframe or count badge text"),
        insight: z.string().optional().describe("Short takeaway sentence shown below the chart"),
        data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).describe("Aggregated rows for the chart"),
        xKey: z.string().describe("Category key in each data row"),
        yKey: z.string().describe("Numeric series key in each data row"),
      }),
      description: "Compact snapshot bar chart panel for category comparisons. Use only aggregated rows and short labels.",
    },
    /** Snapshot donut chart panel for distribution/share views. */
    DonutChartPanel: {
      props: z.object({
        title: z.string().describe("Panel title, e.g. 'Pipeline Breakdown'"),
        subtitle: z.string().optional().describe("Optional timeframe or count badge text"),
        insight: z.string().optional().describe("Short takeaway sentence shown below the chart"),
        data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).describe("Aggregated rows for the chart"),
        nameKey: z.string().describe("Label key in each data row"),
        valueKey: z.string().describe("Numeric value key in each data row"),
        centerLabel: z.string().optional().describe("Optional center label like '200 total'"),
      }),
      description: "Compact snapshot donut chart panel for stage/source share breakdowns. Use aggregated rows only.",
    },
    /** Snapshot funnel chart panel for conversion or stage progression. */
    FunnelChartPanel: {
      props: z.object({
        title: z.string().describe("Panel title, e.g. 'Conversion Funnel'"),
        subtitle: z.string().optional().describe("Optional timeframe or count badge text"),
        insight: z.string().optional().describe("Short takeaway sentence shown below the chart"),
        data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).describe("Ordered aggregated rows for the funnel"),
        nameKey: z.string().describe("Stage/label key in each data row"),
        valueKey: z.string().describe("Numeric value key in each data row"),
        footerText: z.string().optional().describe("Optional footer summary like 'Overall conversion 14%'"),
      }),
      description: "Compact snapshot funnel chart panel for conversion analysis. Use ordered aggregated rows only.",
    },
  },
  actions: {},
});

/**
 * Generates compact prompt guidance derived from the catalog itself.
 * Reuse this in the system prompt so the LLM sees the same contract that the
 * runtime validator enforces.
 */
export function getViewCatalogPrompt() {
  return catalog.prompt({
    mode: "chat",
    customRules: [
      "Only use the allowed components from this catalog.",
      "For lists, boards, and repeated rows, prefer repeat + $item instead of creating one element per record.",
      "Use $state bindings for read-only data props.",
      "Charts in PR42a are snapshot-only. Use compact aggregated data and do not imply live filters, refresh, or pinned reports.",
      "Keep the total serialized show_view tool result under about 4KB.",
    ],
  });
}
```

> **Note:** Do not rely on undocumented properties like `catalog.name` or `catalog.components` in tests. Treat `prompt()`, `validate()`, `zodSchema()`, and `jsonSchema()` as the supported API surface unless the installed package types show otherwise.

**Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/lib/views/catalog.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/views/catalog.ts src/lib/views/catalog.test.ts
git commit -m "feat(pr42a): define narrow json-render catalog with snapshot chart components"
```

---

## Task 3: Build Custom CRM/View Components

7 small React components registered in the json-render catalog. These render the actual UI for CRM-specific data and compact snapshot analytics. They are **stateless, presentational** components.

**Key decision (review #2):** StatMetric accepts `value: string | number` — the already-resolved value, not a JSON Pointer path.

**Key decision (review #6):** All custom components get tests, not just StatMetric.

**Files:**
- Create: `src/components/views/stat-metric.tsx`
- Create: `src/components/views/stat-metric.test.tsx`
- Create: `src/components/views/deal-card.tsx`
- Create: `src/components/views/deal-card.test.tsx`
- Create: `src/components/views/contact-card.tsx`
- Create: `src/components/views/contact-card.test.tsx`
- Create: `src/components/views/task-item.tsx`
- Create: `src/components/views/task-item.test.tsx`
- Create: `src/components/views/chart-panels.tsx`
- Create: `src/components/views/chart-panels.test.tsx`

**Reference:**
- `src/components/crm/deal-kanban-card.tsx` — existing deal card UI to reuse patterns from
- `src/components/crm/task-kanban-card.tsx` — existing task card UI
- `src/components/crm/stage-badge.tsx` — stage badge styling (reuse directly)
- `src/components/crm/task-status-badge.tsx` — task status badge (reuse directly)
- `src/lib/crm/display.ts` — `formatCrmPrice`, `formatCrmDate` utilities
- `src/components/property/charts/*.tsx` — existing Recharts patterns and responsive container usage
- `src/lib/property/chart-colors.ts` — existing palette helper

### Task 3a: StatMetric Component

**Step 1: Write failing test**

Create `src/components/views/stat-metric.test.tsx`:

```typescript
/**
 * Tests for the StatMetric view component.
 * @module components/views/stat-metric.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatMetric } from "./stat-metric";

describe("StatMetric", () => {
  it("renders label and string value", () => {
    render(<StatMetric label="Active Deals" value="29" />);
    expect(screen.getByText("Active Deals")).toBeInTheDocument();
    expect(screen.getByText("29")).toBeInTheDocument();
  });

  it("renders numeric value", () => {
    render(<StatMetric label="Count" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders trend arrow when trend is up", () => {
    render(<StatMetric label="Stale" value="3" trend="up" />);
    expect(screen.getByTestId("trend-indicator")).toHaveTextContent("↑");
  });

  it("renders trend arrow when trend is down", () => {
    render(<StatMetric label="Lost" value="1" trend="down" />);
    expect(screen.getByTestId("trend-indicator")).toHaveTextContent("↓");
  });

  it("renders trend arrow when trend is flat", () => {
    render(<StatMetric label="Same" value="5" trend="flat" />);
    expect(screen.getByTestId("trend-indicator")).toHaveTextContent("→");
  });

  it("does not render trend when absent", () => {
    render(<StatMetric label="Value" value="$4.2M" />);
    expect(screen.queryByTestId("trend-indicator")).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/components/views/stat-metric.test.tsx
```

Expected: FAIL — `Cannot find module './stat-metric'`

**Step 3: Implement StatMetric**

Create `src/components/views/stat-metric.tsx`:

```typescript
/**
 * StatMetric — big number + label + optional trend arrow.
 * Used in agent-generated views for summary statistics.
 *
 * Receives RESOLVED values — json-render's $state bindings resolve
 * before props reach this component. Never receives JSON Pointers.
 * @module components/views/stat-metric
 */
import { cn } from "@/lib/utils";

interface StatMetricProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "flat";
}

const trendConfig = {
  up: { arrow: "↑", className: "text-red-500" },
  down: { arrow: "↓", className: "text-green-500" },
  flat: { arrow: "→", className: "text-muted-foreground" },
} as const;

export function StatMetric({ label, value, trend }: StatMetricProps) {
  return (
    <div className="flex flex-col items-center rounded-lg border bg-card p-4 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold">{value}</span>
        {trend && (
          <span
            data-testid="trend-indicator"
            className={cn("text-sm font-medium", trendConfig[trend].className)}
          >
            {trendConfig[trend].arrow}
          </span>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/components/views/stat-metric.test.tsx
```

Expected: All tests PASS.

### Task 3b: DealCard Component

**Step 1: Write failing test**

Create `src/components/views/deal-card.test.tsx`:

```typescript
/**
 * Tests for the DealCard view component.
 * @module components/views/deal-card.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock StageBadge to avoid importing CRM internals
vi.mock("@/components/crm/stage-badge", () => ({
  StageBadge: ({ stage }: { stage: string }) => (
    <span data-testid="stage-badge">{stage}</span>
  ),
}));

import { DealCard } from "./deal-card";

describe("DealCard", () => {
  it("renders address and price", () => {
    render(<DealCard address="Blk 322 Jurong" price="$1.2M" />);
    expect(screen.getByText("Blk 322 Jurong")).toBeInTheDocument();
    expect(screen.getByText("$1.2M")).toBeInTheDocument();
  });

  it("renders stage badge when stage is provided", () => {
    render(<DealCard address="Marine Parade" price="$2.1M" stage="leads" />);
    expect(screen.getByTestId("stage-badge")).toHaveTextContent("leads");
  });

  it("does not render stage badge when stage is absent", () => {
    render(<DealCard address="Marine Parade" price="$2.1M" />);
    expect(screen.queryByTestId("stage-badge")).not.toBeInTheDocument();
  });
});
```

**Step 2: Implement DealCard**

Create `src/components/views/deal-card.tsx`. Reference the existing `src/components/crm/deal-kanban-card.tsx` for styling patterns and reuse `StageBadge` from `src/components/crm/stage-badge.tsx`:

```typescript
/**
 * DealCard — compact card for a CRM deal.
 * Used in agent-generated views (kanban columns, lists).
 * @module components/views/deal-card
 */
import { StageBadge } from "@/components/crm/stage-badge";

interface DealCardProps {
  address: string;
  price: string;
  stage?: string;
}

export function DealCard({ address, price, stage }: DealCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <p className="text-sm font-medium leading-tight">{address}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{price}</span>
        {stage && <StageBadge stage={stage} />}
      </div>
    </div>
  );
}
```

> **Note:** `StageBadge` expects a `stage` prop typed as `Deal["stage"]`. If the type doesn't accept arbitrary strings from the agent, cast or make a permissive wrapper. Check `src/components/crm/stage-badge.tsx` to confirm.

### Task 3c: ContactCard Component

**Step 1: Write failing test**

Create `src/components/views/contact-card.test.tsx`:

```typescript
/**
 * Tests for the ContactCard view component.
 * @module components/views/contact-card.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContactCard } from "./contact-card";

describe("ContactCard", () => {
  it("renders contact name", () => {
    render(<ContactCard name="John Tan" />);
    expect(screen.getByText("John Tan")).toBeInTheDocument();
  });

  it("renders type badge when provided", () => {
    render(<ContactCard name="Sarah Lee" type="buyer" />);
    expect(screen.getByText("buyer")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<ContactCard name="John Tan" subtitle="Last contact: 5 Mar" />);
    expect(screen.getByText("Last contact: 5 Mar")).toBeInTheDocument();
  });

  it("does not render type badge when absent", () => {
    render(<ContactCard name="John Tan" />);
    // No badge element rendered
    expect(screen.queryByText("buyer")).not.toBeInTheDocument();
  });
});
```

**Step 2: Implement ContactCard**

Create `src/components/views/contact-card.tsx`:

```typescript
/**
 * ContactCard — compact card for a CRM contact.
 * @module components/views/contact-card
 */
import { Badge } from "@/components/ui/badge";

interface ContactCardProps {
  name: string;
  type?: string;
  subtitle?: string;
}

export function ContactCard({ name, type, subtitle }: ContactCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{name}</p>
        {type && <Badge variant="secondary" className="text-xs">{type}</Badge>}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
```

### Task 3d: TaskItem Component

**Step 1: Write failing test**

Create `src/components/views/task-item.test.tsx`:

```typescript
/**
 * Tests for the TaskItem view component.
 * @module components/views/task-item.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock TaskStatusBadge to avoid importing CRM internals
vi.mock("@/components/crm/task-status-badge", () => ({
  TaskStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="task-status-badge">{status}</span>
  ),
}));

import { TaskItem } from "./task-item";

describe("TaskItem", () => {
  it("renders task title", () => {
    render(<TaskItem title="Follow up with John" />);
    expect(screen.getByText("Follow up with John")).toBeInTheDocument();
  });

  it("renders due date when provided", () => {
    render(<TaskItem title="Call Sarah" dueDate="8 Mar 2026" />);
    expect(screen.getByText("8 Mar 2026")).toBeInTheDocument();
  });

  it("renders status badge when provided", () => {
    render(<TaskItem title="Call Sarah" status="open" />);
    expect(screen.getByTestId("task-status-badge")).toHaveTextContent("open");
  });

  it("renders contact and deal associations", () => {
    render(
      <TaskItem
        title="Viewing"
        contactName="John Tan"
        dealAddress="Blk 322 Jurong"
      />,
    );
    expect(screen.getByText(/John Tan/)).toBeInTheDocument();
    expect(screen.getByText(/Blk 322 Jurong/)).toBeInTheDocument();
  });
});
```

**Step 2: Implement TaskItem**

Create `src/components/views/task-item.tsx`. Reference `src/components/crm/task-status-badge.tsx` for status styling:

```typescript
/**
 * TaskItem — single task line item for agent-generated views.
 * @module components/views/task-item
 */
import { TaskStatusBadge } from "@/components/crm/task-status-badge";

interface TaskItemProps {
  title: string;
  dueDate?: string;
  status?: "open" | "completed";
  contactName?: string;
  dealAddress?: string;
}

export function TaskItem({ title, dueDate, status, contactName, dealAddress }: TaskItemProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{title}</p>
        {(contactName || dealAddress) && (
          <p className="text-xs text-muted-foreground truncate">
            {[contactName, dealAddress].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {dueDate && <span className="text-xs text-muted-foreground">{dueDate}</span>}
        {status && <TaskStatusBadge status={status} />}
      </div>
    </div>
  );
}
```

**Step 3: Run all component tests**

```bash
pnpm exec vitest run src/components/views/
```

Expected: All tests PASS (StatMetric, DealCard, ContactCard, TaskItem).

### Task 3e: Snapshot Chart Panels

Implement `BarChartPanel`, `DonutChartPanel`, and `FunnelChartPanel` in `src/components/views/chart-panels.tsx` using the repo's existing `recharts` dependency.

Requirements:
- Treat these as **snapshot panels**, not live dashboard widgets.
- Each panel must render a clear title and optional small subtitle badge.
- Each panel may render one short insight sentence and/or footer summary.
- Accept only aggregated props (`data`, keys, short labels, totals). No embedded filters, refresh button, or "live" badge.
- Keep heights compact enough for inline chat rendering on desktop and mobile.
- Add tests in `src/components/views/chart-panels.test.tsx` for title rendering, empty data state, and at least one happy-path render for each chart type.

Suggested prop shapes:

```typescript
interface BarChartPanelProps {
  title: string;
  subtitle?: string;
  insight?: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
}

interface DonutChartPanelProps {
  title: string;
  subtitle?: string;
  insight?: string;
  data: Array<Record<string, string | number>>;
  nameKey: string;
  valueKey: string;
  centerLabel?: string;
}

interface FunnelChartPanelProps {
  title: string;
  subtitle?: string;
  insight?: string;
  data: Array<Record<string, string | number>>;
  nameKey: string;
  valueKey: string;
  footerText?: string;
}
```

**Step 4: Commit**

```bash
git add src/components/views/
git commit -m "feat(pr42a): add CRM view components and snapshot chart panels"
```

---

## Task 4: Build the Registry

The registry maps json-render catalog component names to actual React implementations. This is where we wire the ShadCN built-in components and our 7 custom CRM/view components together.

**Key decision (review #2):** StatMetric registry wrapper passes `props.value` directly (already resolved by json-render's `$state` pipeline), NOT `String(props.valuePath)`.

**Key decision (review #1 / docs-confirmed):** Register the documented ShadCN implementations directly from `@json-render/shadcn`. Do **not** dynamically probe or assume undocumented exports. Charts in PR42a come from our own `chart-panels.tsx` file backed by `recharts`, not from `@json-render/shadcn`.

**Files:**
- Create: `src/lib/views/registry.tsx`

**Reference:**
- json-render docs: `defineRegistry()` from `@json-render/react` takes a catalog + component map
- `@json-render/shadcn` exports pre-built component implementations for the ShadCN components

**Step 1: Implement the registry**

Create `src/lib/views/registry.tsx`:

```typescript
/**
 * json-render component registry — maps catalog names to React components.
 * Combines @json-render/shadcn built-ins (narrowed to allowlist) with our
 * 7 custom CRM/view components.
 * @module lib/views/registry
 */
import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";

import { ContactCard } from "@/components/views/contact-card";
import { DealCard } from "@/components/views/deal-card";
import { BarChartPanel, DonutChartPanel, FunnelChartPanel } from "@/components/views/chart-panels";
import { StatMetric } from "@/components/views/stat-metric";
import { TaskItem } from "@/components/views/task-item";
import { catalog } from "./catalog";

export const { registry } = defineRegistry(catalog, {
  components: {
    // Register only the documented built-ins that the catalog also exposes.
    Card: shadcnComponents.Card,
    Grid: shadcnComponents.Grid,
    Tabs: shadcnComponents.Tabs,
    Text: shadcnComponents.Text,
    Badge: shadcnComponents.Badge,
    Table: shadcnComponents.Table,
    // Custom CRM components — props are ALREADY RESOLVED by json-render's
    // $state pipeline before reaching these wrappers.
    StatMetric: ({ props }) => (
      <StatMetric
        label={props.label}
        value={props.value}
        trend={props.trend}
      />
    ),
    DealCard: ({ props }) => (
      <DealCard
        address={props.address}
        price={props.price}
        stage={props.stage}
      />
    ),
    ContactCard: ({ props }) => (
      <ContactCard
        name={props.name}
        type={props.type}
        subtitle={props.subtitle}
      />
    ),
    TaskItem: ({ props }) => (
      <TaskItem
        title={props.title}
        dueDate={props.dueDate}
        status={props.status}
        contactName={props.contactName}
        dealAddress={props.dealAddress}
      />
    ),
    BarChartPanel: ({ props }) => (
      <BarChartPanel
        title={props.title}
        subtitle={props.subtitle}
        insight={props.insight}
        data={props.data}
        xKey={props.xKey}
        yKey={props.yKey}
      />
    ),
    DonutChartPanel: ({ props }) => (
      <DonutChartPanel
        title={props.title}
        subtitle={props.subtitle}
        insight={props.insight}
        data={props.data}
        nameKey={props.nameKey}
        valueKey={props.valueKey}
        centerLabel={props.centerLabel}
      />
    ),
    FunnelChartPanel: ({ props }) => (
      <FunnelChartPanel
        title={props.title}
        subtitle={props.subtitle}
        insight={props.insight}
        data={props.data}
        nameKey={props.nameKey}
        valueKey={props.valueKey}
        footerText={props.footerText}
      />
    ),
  },
});
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No type errors. If the installed package exports differ from what's shown, adapt the imports based on the installed package's type exports. Check `node_modules/@json-render/react/dist/index.d.ts` and `node_modules/@json-render/shadcn/dist/index.d.ts`. Do **not** switch PR42a to a package-provided `Chart`; keep charts in our custom `chart-panels.tsx` surface.

**Step 3: Commit**

```bash
git add src/lib/views/registry.tsx
git commit -m "feat(pr42a): build json-render registry with snapshot chart components"
```

---

## Task 5: Build the `show_view` Agent Tool (with Validation + Size Cap)

This is the tool the agent calls to display a view. It validates the spec against the real catalog contract, enforces a conservative ~4KB cap on the **full serialized success payload** to prevent artifact truncation, and returns the validated spec + state as the tool result. In PR42a, this includes compact chart snapshots but **not** live analytics behavior.

**Key decision (review #3):** Use `inputSchema` (not `parameters`) to match this codebase's convention (see `send-message.ts`). Runtime validation must use `catalog.validate(spec)` as the source of truth. `ALLOWED_COMPONENT_TYPES` is secondary only for prompt/test ergonomics and human-readable errors.

**Key decision (review #4):** Cap the serialized **full success payload** (`{ success, spec, state }`) at ~4KB. `truncateOversizedParts()` measures the full serialized tool result against a 5KB threshold, so a state-only cap is not sufficient. Return `{ success: false, error: "..." }` if the full payload would be too large, telling the agent to prefer `repeat` + `$item`, summarize, or limit the data.

**Key decision (review #7):** `show_view` is main-runner only — excluded from subagents (subagents return text).

**Key decision (new):** The tool description must steer the model toward snapshot charts, not fake dashboards. Tell it to use aggregated arrays, timeframe labels, and short insight text; forbid fake refresh/filter controls.

**Files:**
- Create: `src/lib/runner/tools/views/show-view.ts`
- Create: `src/lib/runner/tools/views/show-view.test.ts`
- Create: `src/lib/runner/tools/views/index.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/tool-registry.ts`

**Reference:**
- `src/lib/runner/tools/utility/send-message.ts` — minimal tool factory pattern (uses `inputSchema`, returns `{ success, ... }`)
- `src/lib/runner/tool-registry.ts` — where tools are assembled, `isSubagent` check at line 55
- `src/lib/runner/compaction.ts:25` — `ARTIFACT_SIZE_THRESHOLD_BYTES = 5_000`

**Step 1: Write failing tests**

Create `src/lib/runner/tools/views/show-view.test.ts`:

```typescript
/**
 * Tests for the show_view agent tool.
 * Covers runtime catalog validation, malformed spec rejection, repeat-friendly
 * compact specs, and full-output size enforcement.
 * @module lib/runner/tools/views/show-view.test
 */
import { describe, expect, it } from "vitest";

import { createViewTools } from "./index";

const execOpts = {
  toolCallId: "test-1",
  messages: [],
  abortSignal: new AbortController().signal,
};

describe("show_view tool", () => {
  it("returns success with valid spec and state", async () => {
    const tools = createViewTools();
    const result = await tools.show_view.execute(
      {
        spec: {
          root: "card",
          elements: {
            card: {
              type: "StatMetric",
              props: { label: "Deals", value: 29 },
            },
          },
        },
        state: { count: 5 },
      },
      execOpts,
    );
    expect(result).toMatchObject({ success: true });
    expect(result.spec.root).toBe("card");
    expect(result.state).toEqual({ count: 5 });
  });

  it("rejects spec with unknown component type", async () => {
    const tools = createViewTools();
    const result = await tools.show_view.execute(
      {
        spec: {
          root: "x",
          elements: {
            x: { type: "Dialog", props: {} },
          },
        },
        state: {},
      },
      execOpts,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Dialog");
  });

  it("rejects malformed specs that fail catalog validation", async () => {
    const tools = createViewTools();
    const result = await tools.show_view.execute(
      {
        spec: {
          root: "missing-root",
          elements: {},
        },
        state: {},
      },
      execOpts,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid view spec");
  });

  it("accepts compact repeat-based specs for repeated records", async () => {
    const tools = createViewTools();
    const result = await tools.show_view.execute(
      {
        spec: {
          root: "deal-grid",
          elements: {
            "deal-grid": {
              type: "Grid",
              repeat: { statePath: "/deals", key: "id" },
              children: ["deal-card"],
            },
            "deal-card": {
              type: "DealCard",
              props: {
                address: { $item: "address" },
                price: { $item: "price" },
                stage: { $item: "stage" },
              },
            },
          },
        },
        state: {
          deals: [
            { id: "1", address: "10 Market Street", price: "$1.2M", stage: "lead" },
            { id: "2", address: "22 River Valley Road", price: "$980k", stage: "viewing" },
          ],
        },
      },
      execOpts,
    );
    expect(result.success).toBe(true);
  });

  it("rejects outputs whose full serialized payload exceeds the cap", async () => {
    const tools = createViewTools();
    const result = await tools.show_view.execute(
      {
        spec: {
          root: "deal",
          elements: {
            deal: {
              type: "DealCard",
              props: {
                address: "x".repeat(3900),
                price: "$1",
              },
            },
          },
        },
        state: {},
      },
      execOpts,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("too large");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run src/lib/runner/tools/views/show-view.test.ts
```

Expected: FAIL — `Cannot find module './index'`

**Step 3: Implement the tool**

Create `src/lib/runner/tools/views/show-view.ts`:

```typescript
/**
 * show_view tool — agent outputs a json-render spec + pre-computed state.
 * The frontend detects this tool's output and renders it visually
 * via json-render's Renderer instead of the default JsonView.
 *
 * Validation:
 *   - Runtime acceptance goes through catalog.validate(spec)
 *   - The full serialized success payload stays under ~4KB
 *
 * @module lib/runner/tools/views/show-view
 */
import { tool } from "ai";
import { z } from "zod";

import { ALLOWED_COMPONENT_TYPES, catalog } from "@/lib/views/catalog";

/**
 * ~4KB cap on the full serialized success payload.
 * truncateOversizedParts() measures the serialized tool output, not just state,
 * against a 5KB threshold. Leave headroom for pretty-printed JSON overhead.
 */
const SHOW_VIEW_OUTPUT_SIZE_CAP_BYTES = 4_000;
const TEXT_ENCODER = new TextEncoder();

function getUnsupportedComponentTypes(spec: unknown): string[] {
  if (typeof spec !== "object" || spec === null) return [];

  const elements = (spec as { elements?: unknown }).elements;
  if (typeof elements !== "object" || elements === null) return [];

  return Object.values(elements)
    .flatMap((element) => {
      if (typeof element !== "object" || element === null) return [];
      const type = (element as { type?: unknown }).type;
      return typeof type === "string" && !ALLOWED_COMPONENT_TYPES.has(type)
        ? [type]
        : [];
    });
}

/**
 * Creates the show_view tool. No dependencies — the tool validates
 * the spec against the catalog and caps the total success payload size.
 */
export function createShowViewTool() {
  return tool({
    description:
      "Display an interactive view to the user in chat. " +
      "Use after querying data with CRM tools. " +
      "Compose from: Card, Grid, Tabs, Text, Badge, Table, " +
      "StatMetric, DealCard, ContactCard, TaskItem, BarChartPanel, DonutChartPanel, FunnelChartPanel. " +
      "The 'spec' is a json-render spec (root + elements tree). " +
      "For repeated rows/cards, prefer repeat + $item over creating one element per record. " +
      "The 'state' is the pre-computed data the view reads from via $state bindings. " +
      "Charts are snapshot-only: pass compact aggregated data, not raw rows, and do not imply live filters, refresh, or pinned reports. " +
      "Keep the full serialized result under about 4KB — if you have too much data, summarize, limit records, or use repeat-based specs.",
    inputSchema: z.object({
      spec: z
        .unknown()
        .describe(
          "json-render UI specification. Runtime validation uses the shared catalog and supports repeat, $state, $item, and other documented spec fields.",
        ),
      state: z
        .record(z.string(), z.unknown())
        .describe("Pre-computed data for $state bindings. Keep the entire show_view result under ~4KB. Chart data should be aggregated and compact."),
    }),
    execute: async ({ spec, state }) => {
      const validationResult = catalog.validate(spec);
      if (!validationResult.success) {
        const unsupportedTypes = getUnsupportedComponentTypes(spec);
        const unsupportedTypesMessage =
          unsupportedTypes.length > 0
            ? ` Unsupported component types: ${unsupportedTypes.join(", ")}.`
            : "";
        return {
          success: false as const,
          error:
            `Invalid view spec.${unsupportedTypesMessage} ` +
            "Use only catalog-supported components and valid json-render element structures.",
        };
      }

      const successPayload = { success: true as const, spec, state };
      const payloadBytes = TEXT_ENCODER.encode(
        JSON.stringify(successPayload),
      ).length;
      if (payloadBytes > SHOW_VIEW_OUTPUT_SIZE_CAP_BYTES) {
        const payloadKB = Math.round(payloadBytes / 1024);
        const capKB = Math.round(SHOW_VIEW_OUTPUT_SIZE_CAP_BYTES / 1024);
        return {
          success: false as const,
          error:
            `View payload too large (${payloadKB}KB > ${capKB}KB cap). ` +
            "Prefer repeat + $item, summarize, limit records, or remove unnecessary fields.",
        };
      }

      return successPayload;
    },
  });
}
```

Create `src/lib/runner/tools/views/index.ts`:

```typescript
/**
 * View tools barrel — agent-generated visual components.
 * @module lib/runner/tools/views
 */
import { createShowViewTool } from "./show-view";

export function createViewTools() {
  return {
    show_view: createShowViewTool(),
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/lib/runner/tools/views/show-view.test.ts
```

Expected: All tests PASS (valid spec, invalid component rejection, malformed spec rejection, repeat-based acceptance, full-output size cap enforcement).

**Step 5: Register the tool in the runner (main only, not subagents)**

Modify `src/lib/runner/tools/index.ts` — add the export:

```typescript
export { createViewTools } from "./views";
```

Modify `src/lib/runner/tool-registry.ts`:

1. Add import at the top:
```typescript
import { createViewTools } from "@/lib/runner/tools/views";
```

2. In `createRunnerTools()`, create the view tools and spread into the **main return only** (NOT the subagent return). Add `const viewTools = createViewTools();` after `const triggerTools = ...` (line ~67), and spread `...viewTools` into the main return object (line ~76):

```typescript
// After line 67 (const triggerTools = ...)
const viewTools = createViewTools();

return {
  ...crmTools,
  ...storageTools,
  ...webTools,
  ...utilityTools,
  ...triggerTools,
  ...connectionTools,
  ...viewTools,  // <-- main runner only, NOT in subagent return above
};
```

> **Key decision (review #7):** `viewTools` is NOT spread into the `isSubagent` return block (line ~56-62). Subagents return text only — they can't render views.

**Step 6: Extend existing runner registration tests**

Update the existing runner tests in `src/lib/runner/__tests__/run-agent.test.ts` instead of creating a new ad hoc harness:

- extend the existing `vi.mock("@/lib/runner/tools", ...)` barrel mock to include `createViewTools`
- add a hoisted `mockCreateViewTools`
- verify `createRunnerTools(..., { isSubagent: true })` omits `show_view`
- verify the main runner tool registry includes `show_view`

This keeps the diff small and avoids duplicating runner test scaffolding.

**Step 7: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No type errors.

**Step 8: Commit**

```bash
git add src/lib/runner/tools/views/ src/lib/runner/tools/index.ts src/lib/runner/tool-registry.ts
git commit -m "feat(pr42a): add show_view tool with catalog validation, 4KB size cap, main-runner only"
```

---

## Task 6: Build ViewCard and Wire into Chat (Outside Accordion)

This is the frontend rendering piece. Two things happen:

1. **ViewCard** component: wraps json-render's `Renderer` + `StateProvider` with styling.
2. **message-bubble.tsx extraction**: `tool-show_view` parts are extracted from `intermediateParts` and rendered outside the `StepsSummary` accordion — exactly like `ask_user_question`.
3. **tool-call-inline.tsx fallback**: When the user expands the accordion, `show_view` still renders a ViewCard (not raw JSON) inside the tool details.

**Key decision (review #8):** Views render OUTSIDE the collapsed steps accordion, not inside it. The user sees the rendered view directly in the chat flow. This follows the same pattern as `ask_user_question` extraction in `message-bubble.tsx` (lines 44-53).

**Files:**
- Create: `src/components/views/view-card.tsx`
- Create: `src/components/views/view-card.test.tsx`
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/tool-call-inline.tsx`

**Reference:**
- `src/components/chat/message-bubble.tsx:44-53` — the `ask_user_question` extraction pattern to replicate
- `src/components/chat/message-bubble.tsx:125-137` — where `askQuestionParts` render inline
- `src/components/chat/tool-call-inline.tsx:108-118` — the `JsonView` render path for accordion fallback
- `src/components/chat/ask-user-question-inline.tsx` — reference for inline component pattern

### Task 6a: ViewCard Component

**Step 1: Write failing test**

Create `src/components/views/view-card.test.tsx`:

```typescript
/**
 * Tests for the ViewCard component that renders json-render specs inline in chat.
 * @module components/views/view-card.test
 */
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

// Mock json-render to avoid full rendering pipeline in unit tests
vi.mock("@json-render/react", () => ({
  Renderer: ({ spec }: { spec: unknown }) => (
    <div data-testid="json-render-renderer" data-spec={JSON.stringify(spec)} />
  ),
  StateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/views/registry", () => ({
  registry: {},
}));

import { ViewCard } from "./view-card";

describe("ViewCard", () => {
  const mockSpec = {
    root: "card",
    elements: {
      card: { type: "StatMetric", props: { label: "Test", value: 42 } },
    },
  };
  const mockState = { val: 42 };

  it("renders the json-render Renderer", () => {
    render(<ViewCard spec={mockSpec} state={mockState} />);
    expect(screen.getByTestId("json-render-renderer")).toBeInTheDocument();
  });

  it("passes the spec to the Renderer", () => {
    render(<ViewCard spec={mockSpec} state={mockState} />);
    const renderer = screen.getByTestId("json-render-renderer");
    expect(renderer.dataset.spec).toBe(JSON.stringify(mockSpec));
  });

  it("wraps content in a styled container", () => {
    render(<ViewCard spec={mockSpec} state={mockState} />);
    const container = screen.getByTestId("view-card");
    expect(container).toBeInTheDocument();
  });
});
```

**Step 2: Implement ViewCard**

Create `src/components/views/view-card.tsx`:

```typescript
/**
 * ViewCard — renders a json-render spec inline in the chat message stream.
 * Wraps the json-render Renderer + StateProvider with a styled container.
 * @module components/views/view-card
 */
"use client";

import { Renderer, StateProvider } from "@json-render/react";

import { registry } from "@/lib/views/registry";

interface ViewCardProps {
  spec: {
    root: string;
    elements: Record<string, unknown>;
  };
  state: Record<string, unknown>;
}

export function ViewCard({ spec, state }: ViewCardProps) {
  return (
    <div
      data-testid="view-card"
      className="my-2 rounded-lg border bg-card p-4 shadow-sm"
    >
      <StateProvider initialState={state}>
        <Renderer spec={spec} registry={registry} />
      </StateProvider>
    </div>
  );
}
```

**Step 3: Run tests to verify they pass**

```bash
pnpm exec vitest run src/components/views/view-card.test.tsx
```

Expected: All tests PASS.

### Task 6b: Extract show_view Parts in message-bubble.tsx

Modify `src/components/chat/message-bubble.tsx` to extract `tool-show_view` parts from the intermediate parts and render them outside the `StepsSummary` accordion, just like `ask_user_question`.

**Important:** Keep `show_view` in the `StepsSummary` part list as well. The inline render is the primary surface, but the expanded accordion fallback in Task 6c only works if the tool part is still present there.

**Step 1: Add ViewCard import**

At the top of `message-bubble.tsx`, add:

```typescript
import { ViewCard } from "@/components/views/view-card";
```

**Step 2: Extract show_view parts alongside ask_user_question**

Find lines 44-53 (the existing extraction logic):

```typescript
// Extract ask_user_question tool parts — these render inline (not collapsed in StepsSummary)
const allIntermediateParts = message.parts.filter(
  (p) => p.type === "reasoning" || p.type.startsWith("tool-"),
);
const askQuestionParts = allIntermediateParts.filter(
  (p) => p.type === "tool-ask_user_question" && (p as { state?: string }).state === "output-available",
);
const intermediateParts = allIntermediateParts.filter(
  (p) => p.type !== "tool-ask_user_question",
);
```

Replace with:

```typescript
// Extract ask_user_question and show_view tool parts — these render inline (not collapsed in StepsSummary)
const allIntermediateParts = message.parts.filter(
  (p) => p.type === "reasoning" || p.type.startsWith("tool-"),
);
const askQuestionParts = allIntermediateParts.filter(
  (p) => p.type === "tool-ask_user_question" && (p as { state?: string }).state === "output-available",
);
const showViewParts = allIntermediateParts.filter(
  (p) => p.type === "tool-show_view" && (p as { state?: string }).state === "output-available",
);
const intermediateParts = allIntermediateParts.filter(
  (p) => p.type !== "tool-ask_user_question",
);
```

**Step 3: Render show_view parts inline**

After the `askQuestionParts` rendering block (lines 125-137), add the show_view rendering block:

```typescript
{showViewParts.length > 0 &&
  showViewParts.map((part, i) => {
    const output = (part as { output?: { success?: boolean; spec?: unknown; state?: unknown } }).output;
    if (!output?.success || !output.spec || !output.state) return null;
    return (
      <ViewCard
        key={`${message.id}-view-${i}`}
        spec={output.spec as { root: string; elements: Record<string, unknown> }}
        state={output.state as Record<string, unknown>}
      />
    );
  })}
```

**Step 4: Extend the existing `message-bubble.test.tsx` coverage**

Add tests to `src/components/chat/message-bubble.test.tsx` that:

- render a `tool-show_view` part with `state="output-available"` and assert `ViewCard` renders inline
- assert the same message still leaves the `show_view` part inside `StepsSummary` so the expanded fallback remains reachable

Follow the existing test style in that file: add a module-scope mock for `@/components/views/view-card` and extend the current assistant-message coverage instead of creating a new harness.

### Task 6c: ToolCallInline Fallback (Inside Accordion)

When the user expands the steps accordion, `show_view` tool calls should still render a ViewCard rather than raw JSON. This is the fallback rendering inside `tool-call-inline.tsx`.

**Step 1: Add imports**

At the top of `tool-call-inline.tsx`, add:

```typescript
import { ViewCard } from "@/components/views/view-card";
```

**Step 2: Add type guard**

Add above the `ToolCallInline` component:

```typescript
/** Type guard: checks if tool output is a valid show_view response. */
function isViewOutput(
  output: unknown,
): output is { success: true; spec: { root: string; elements: Record<string, unknown> }; state: Record<string, unknown> } {
  if (typeof output !== "object" || output === null) return false;
  const o = output as Record<string, unknown>;
  return (
    o.success === true &&
    typeof o.spec === "object" &&
    o.spec !== null &&
    typeof (o.spec as Record<string, unknown>).root === "string" &&
    typeof o.state === "object" &&
    o.state !== null
  );
}
```

**Step 3: Replace the result rendering section**

Find lines 108-118 (current result display):

```typescript
) : !isDenied && output !== undefined ? (
  <div>
    <p className="text-xs font-medium text-muted-foreground/70 mb-0.5">Result</p>
    <div
      data-testid="tool-result"
      className="rounded bg-muted/30 px-2 py-1.5 overflow-x-auto"
    >
      <JsonView data={output} />
    </div>
  </div>
) : null}
```

Replace with:

```typescript
) : !isDenied && output !== undefined ? (
  name === "show_view" && isViewOutput(output) ? (
    <ViewCard spec={output.spec} state={output.state} />
  ) : (
    <div>
      <p className="text-xs font-medium text-muted-foreground/70 mb-0.5">Result</p>
      <div
        data-testid="tool-result"
        className="rounded bg-muted/30 px-2 py-1.5 overflow-x-auto"
      >
        <JsonView data={output} />
      </div>
    </div>
  )
) : null}
```

**Step 4: Write ToolCallInline branching test**

Add to the existing `tool-call-inline.test.tsx`. Do this with the file's existing test style:

1. add a **module-scope** mock for `@/components/views/view-card`
2. keep using `userEvent`, not `fireEvent`
3. extend the current `ToolCallInline` test file instead of creating a second test harness

```typescript
vi.mock("@/components/views/view-card", () => ({
  ViewCard: ({ spec }: { spec: unknown }) => (
    <div data-testid="view-card" data-spec={JSON.stringify(spec)} />
  ),
}));

describe("ToolCallInline show_view branching", () => {
  it("renders ViewCard for show_view with valid output", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="show_view"
        state="output-available"
        input={{}}
        output={{
          success: true,
          spec: { root: "x", elements: { x: { type: "Card", props: {} } } },
          state: { val: 1 },
        }}
      />,
    );

    await user.click(screen.getByTestId("tool-expand-trigger"));

    // Should render ViewCard, not JsonView
    expect(screen.getByTestId("view-card")).toBeInTheDocument();
    expect(screen.queryByTestId("tool-result")).not.toBeInTheDocument();
  });

  it("renders JsonView for non-show_view tools", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="search_deals"
        state="output-available"
        input={{}}
        output={{ success: true, data: [] }}
      />,
    );

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-result")).toBeInTheDocument();
    expect(screen.queryByTestId("view-card")).not.toBeInTheDocument();
  });
});
```

**Step 5: Run all tests**

```bash
pnpm exec vitest run src/components/views/ src/components/chat/ src/lib/views/ src/lib/runner/tools/views/
```

Expected: All tests PASS.

**Step 6: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No type errors.

**Step 7: Commit**

```bash
git add src/components/views/view-card.tsx src/components/views/view-card.test.tsx src/components/chat/message-bubble.tsx src/components/chat/tool-call-inline.tsx
git commit -m "feat(pr42a): render views outside accordion (message-bubble extraction) + accordion fallback"
```

---

## Task 7: Add System Prompt View Guidance

The agent needs to know when to use `show_view`. Without guidance in the system prompt, it will default to text/table responses even when a visual view would be better.

**Key decision (review #5):** Keep a short behavioral `<view-guidance>` block, but also inject a compact catalog-derived prompt so the model sees the same component contract the runtime validator enforces.

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Reference: `src/lib/views/catalog.ts` (`getViewCatalogPrompt()`)

**Step 1: Add view guidance block**

In `src/lib/ai/system-prompt.ts`, find the `</output-guidance>` closing tag (line 141). Import `getViewCatalogPrompt` from `@/lib/views/catalog`, then insert a short behavioral block plus a compact catalog-derived block just before `</output-guidance>`:

```
<view-guidance>
When the user asks for an overview, dashboard, board, or visual summary of CRM data:
1. Query the data first using CRM search tools.
2. Call show_view with a json-render spec + state.
3. Prefer repeat + $item for repeated rows/cards. Do not create one element per record when a repeat-based spec works.
4. For analytics-style answers, prefer compact snapshot charts (bar, donut, funnel) backed by aggregated data plus a short insight sentence.
5. Keep the full serialized show_view result under about 4KB — summarize, limit records, or remove unnecessary fields if needed.
6. Follow show_view with a brief text summary or offer to drill deeper.

Use show_view for: pipeline overviews, deal lists, contact summaries, task boards, stat dashboards, stage/source breakdown snapshots, conversion funnel snapshots.
Do NOT use show_view for: simple single-value answers, yes/no questions, or when the user asks for text.
Do NOT imply live analytics behavior in PR42a: no fake refresh controls, filter chips, pinned report affordances, or "live" badges.
</view-guidance>

<view-catalog>
${getViewCatalogPrompt()}
</view-catalog>
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr42a): add view-guidance block to system prompt for show_view usage"
```

---

## Task 8: Integration Test — Manual Smoke Test

This task verifies the full flow end-to-end in the browser. No automated test — this is a manual verification.

**Step 1: Start the dev server**

```bash
pnpm dev
```

**Step 2: Open the app and navigate to chat**

Open `http://localhost:3000/chat` in your browser. Log in if needed.

**Step 3: Trigger a view generation**

Type a message that should trigger the agent to use `show_view`. Examples:
- "Show me my deals pipeline"
- "Give me an overview of my contacts"
- "What tasks are overdue?"
- "Show me pipeline analytics for the last 30 days"

> **Note:** The agent now has system prompt guidance for when to use `show_view`. If it still responds with text, try: "Show me my deals pipeline as a visual dashboard."

**Step 4: Verify the view renders outside the accordion**

Expected behavior:
1. Agent calls CRM search tools (visible in "Done in N steps" collapsed area)
2. Agent calls `show_view` with a spec + state
3. The rendered view appears **outside** the collapsed steps accordion, inline in the chat flow
4. Text response from the agent appears above or below the view
5. If the prompt asked for analytics, the view uses compact snapshot charts with strong panel titles, a timeframe badge, and a short insight strip
6. The view is styled with borders, proper spacing, and matches the existing app theme

**Step 5: Verify accordion fallback**

Expand the "Done in N steps" section. The `show_view` tool call should NOT show raw JSON — it should show a ViewCard. Other tool calls (like `search_deals`) should still show `JsonView` as before.

**Step 6: Verify refresh/reopen resilience**

Hard-refresh the page or navigate away and reopen the same thread. The previously rendered view should still appear. If the `show_view` result is replaced by a truncation marker or disappears after reload, the size guard is still too weak.

**Step 7: Verify responsiveness**

Resize the browser window to mobile width (~375px). The view should reflow and remain readable.

**Step 7a: Verify snapshot-only honesty**

If the rendered view includes charts, confirm it does **not** pretend to be a live analytics dashboard. There should be no refresh button, no filter chips, no "live" badge, and no pin/save report affordances in PR42a.

**Step 8: Verify size cap error handling**

If possible, trigger a query that would produce a large view (many deals). The agent should either:
- Use `repeat` + `$item` and succeed with a compact spec
- Summarize / limit results and succeed
- Or get a size cap error from the tool and retry with less data

**Step 9: Verify subagent exclusion**

If there's a way to trigger a subagent run, verify it does NOT have access to `show_view`. The subagent should respond with text only.

---

## Task 9: Final Verification and Commit

**Step 1: Run the full test suite**

```bash
pnpm exec vitest run
```

Expected: All existing tests still pass. No regressions.

**Step 2: Run TypeScript check**

```bash
pnpm exec tsc --noEmit
```

Expected: No type errors.

**Step 3: Run linter**

```bash
pnpm lint
```

Expected: No lint errors.

**Step 4: Final commit**

If any fixes were needed during integration testing, commit them:

```bash
git add -A
git commit -m "fix(pr42a): integration fixes for agent-generated views"
```

---

## Notes for the Engineer

### Review Decisions Summary

9 decisions from code review and scope refinement, all incorporated:

| # | Issue | Decision |
|---|-------|----------|
| 1 | Catalog too broad | Narrow allowlist: 13 components (6 documented ShadCN + 4 CRM + 3 snapshot charts). Built-in `Chart` remains out; use custom chart panels instead. |
| 2 | StatMetric `valuePath` binding wrong | StatMetric accepts resolved `value` prop. json-render resolves `$state` before props reach components. |
| 3 | Validation too weak, wrong field name | `inputSchema` (not `parameters`). Runtime acceptance uses `catalog.validate(spec)`. Invalid spec test added. |
| 4 | Large views break on refresh | ~4KB cap applies to the **full serialized success payload**, not just state. Manual hard-refresh check added. |
| 5 | No system prompt guidance | Keep a short `<view-guidance>` block and inject a compact catalog-derived prompt. |
| 6 | Tests too light | Full TDD: all custom components (CRM + chart panels), `message-bubble` extraction, ToolCallInline branching, runner registration, malformed spec rejection, size-cap coverage. |
| 7 | show_view in subagents | Main-runner only. viewTools NOT spread into isSubagent return. |
| 8 | Views hidden behind accordion | show_view renders inline outside the accordion **and** remains inside expanded `StepsSummary` as fallback. |
| 9 | Need Dench-like analytics feel without building analytics | Add compact snapshot chart panels + presentation cues (titles, timeframe badge, insight strip), but keep no live queries, refresh, filters, or pinned reports. |

### json-render API Caveats

The `@json-render/core`, `@json-render/react`, and `@json-render/shadcn` packages are from Vercel Labs and may have API differences from what's documented here. After installing (Task 1), check:

1. `node_modules/@json-render/core/dist/index.d.ts` — verify `defineCatalog` signature
2. `node_modules/@json-render/react/schema` — verify `schema` export
3. `node_modules/@json-render/react/dist/index.d.ts` — verify `defineRegistry`, `Renderer`, `StateProvider` exports
4. `node_modules/@json-render/shadcn/catalog` — verify `shadcnComponentDefinitions` export
5. `node_modules/@json-render/shadcn/dist/index.d.ts` — verify `shadcnComponents` export
6. `package.json` / lockfile already provide `recharts`; reuse that for custom chart panels rather than relying on an upstream `Chart` abstraction.

If APIs differ, adapt the catalog, registry, and ViewCard accordingly. The design intent stays the same — the exact import paths and function signatures may vary. Do **not** swap in a package-provided `Chart` unless this tasklist is deliberately rewritten.

### How `$state` Bindings Work

In the spec, components reference data from the `state` object using `$state` expressions:

```json
{ "props": { "value": { "$state": "/stats/activeDeals" } } }
```

json-render resolves `{ "$state": "/stats/activeDeals" }` to the actual value (e.g., `29`) before passing it to the component as a prop. The `StateProvider` wrapping the `Renderer` makes this work. Your custom components receive **resolved** prop values, not raw `$state` expressions.

This is why StatMetric accepts `value: string | number` (already resolved), not `valuePath: string`.

### Size Cap Rationale

`ARTIFACT_SIZE_THRESHOLD_BYTES = 5_000` (5KB) in `src/lib/runner/compaction.ts`. Tool outputs larger than this get truncated by `truncateOversizedParts()` in `src/lib/runner/toolcall-artifacts.ts`, replacing content with a `<context-removed>` marker. This breaks the view on page refresh because the spec/state data is lost.

`truncateOversizedParts()` measures the **serialized full tool result**, and the serialization path pretty-prints JSON before measuring. The conservative ~4KB cap should therefore apply to the whole successful `{ success, spec, state }` payload, leaving headroom for formatting overhead and the surrounding envelope.

### Canonical Repeat Pattern

Prefer repeated views to use json-render's documented `repeat` field instead of expanding one element per row. Example:

```json
{
  "root": "deal-grid",
  "elements": {
    "deal-grid": {
      "type": "Grid",
      "repeat": { "statePath": "/deals", "key": "id" },
      "children": ["deal-card"]
    },
    "deal-card": {
      "type": "DealCard",
      "props": {
        "address": { "$item": "address" },
        "price": { "$item": "price" },
        "stage": { "$item": "stage" }
      }
    }
  }
}
```

This is smaller, more DRY, and less likely to exceed the persisted artifact threshold than generating one element entry per record.

### Testing Strategy

- **Unit tests** cover: catalog allowlist/validation, all custom components (4 CRM + 3 chart panels), show_view tool (valid spec, malformed spec rejection, size cap, repeat-based acceptance), ViewCard rendering, `message-bubble` extraction, ToolCallInline branching, runner registration
- **Integration** is manual: trigger the agent in chat, verify views render outside accordion, survive a hard refresh, and still render inside expanded `StepsSummary`
- **No E2E tests** for this PR — the LLM's decision to call `show_view` is non-deterministic. Manual smoke testing is more reliable.

### What NOT to Build

Per the design doc's "What We Cut" section:
- No `save_view` tool or `saved_views` DB table
- No `/views/[viewId]` page route
- No sidebar VIEWS section
- No `useViewData` or generic data-fetching hook
- No live report controls (`refresh`, `filters`, `pin`, `save report`, `live` badge)
- No streaming/progressive rendering
- No `pipeJsonRender` Chat Mode integration
