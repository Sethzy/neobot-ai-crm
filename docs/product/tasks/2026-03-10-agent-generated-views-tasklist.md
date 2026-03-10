# Agent-Generated Views Implementation Plan

**PR:** PR 42a: Agent-generated views (inline, json-render)
**Decisions:** UX-10
**Goal:** Let the agent respond with visual components (stat cards, tables, kanban boards, charts) rendered inline in chat using Vercel Labs json-render.

**Architecture:** The agent calls a `show_view` tool that outputs a JSON spec + pre-computed state. The frontend detects `tool-show_view` in `ToolCallInline` and renders it via json-render's `Renderer` + `StateProvider` instead of `JsonView`. No saved/pinned views, no DB migration, no sidebar changes. Views live in chat only. (UX-10: Tier 1 catalog-based JSON specs.)

**Tech Stack:** `@json-render/core`, `@json-render/react`, `@json-render/shadcn`, Vitest, React Testing Library

**Design Doc:** `docs/product/designs/pr31-agent-generated-views.md`

---

## Relevant Files

### New Files
- `src/lib/views/catalog.ts` — json-render catalog definition (Zod schemas for allowed components)
- `src/lib/views/catalog.test.ts` — catalog validation tests
- `src/lib/views/registry.tsx` — maps catalog component names to React implementations
- `src/components/views/view-card.tsx` — inline chat wrapper (StateProvider + Renderer)
- `src/components/views/view-card.test.tsx` — ViewCard rendering tests
- `src/components/views/stat-metric.tsx` — custom StatMetric component
- `src/components/views/stat-metric.test.tsx` — StatMetric tests
- `src/components/views/deal-card.tsx` — custom DealCard component (extracted from deals page)
- `src/components/views/contact-card.tsx` — custom ContactCard component
- `src/components/views/task-item.tsx` — custom TaskItem component
- `src/lib/runner/tools/views/index.ts` — view tool barrel
- `src/lib/runner/tools/views/show-view.ts` — show_view tool definition
- `src/lib/runner/tools/views/show-view.test.ts` — show_view tool tests

### Modified Files
- `src/lib/runner/tools/index.ts` — add `createViewTools` export
- `src/lib/runner/tool-registry.ts` — register view tools in `createRunnerTools()`
- `src/components/chat/tool-call-inline.tsx` — detect `show_view`, render ViewCard instead of JsonView

### Reference Files (read-only, for context)
- `docs/product/designs/pr31-agent-generated-views.md` — full design doc with decisions log
- `src/components/crm/deal-kanban-card.tsx` — existing DealKanbanCard to extract from
- `src/components/crm/task-kanban-card.tsx` — existing TaskKanbanCard to extract from
- `src/components/crm/contacts-table.tsx` — existing contact rendering patterns
- `src/components/crm/stage-badge.tsx` — stage badge styling
- `src/components/crm/task-status-badge.tsx` — task status badge styling
- `src/lib/crm/display.ts` — formatCrmPrice, formatCrmDate, getAvatarColor utilities
- `src/components/ui/json-view.tsx` — what ViewCard replaces for show_view output
- `src/lib/runner/tools/utility/send-message.ts` — reference for minimal tool factory pattern

---

## Task 1: Install json-render Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install the three json-render packages**

```bash
npm install @json-render/core @json-render/react @json-render/shadcn
```

**Step 2: Verify installation**

```bash
npm ls @json-render/core @json-render/react @json-render/shadcn
```

Expected: All three packages listed with resolved versions, no `MISSING` or `ERR`.

**Step 3: Verify the app still compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(pr42a): install json-render dependencies"
```

---

## Task 2: Define the View Catalog

The catalog tells json-render (and the LLM) which components are valid. It defines Zod schemas for each component's props. This is the contract between the agent and the frontend.

**Files:**
- Create: `src/lib/views/catalog.ts`
- Create: `src/lib/views/catalog.test.ts`

**Reference:**
- `docs/product/designs/pr31-agent-generated-views.md` — see "Example spec + state" section
- json-render docs: catalog uses `defineCatalog()` from `@json-render/core` with Zod prop schemas

**Step 1: Write failing tests for catalog validation**

Create `src/lib/views/catalog.test.ts`:

```typescript
/**
 * Tests for the json-render view catalog definition.
 * @module lib/views/catalog.test
 */
import { describe, expect, it } from "vitest";

import { catalog } from "./catalog";

describe("view catalog", () => {
  it("exports a catalog object", () => {
    expect(catalog).toBeDefined();
    expect(catalog.name).toBe("sunder-views");
  });

  it("includes StatMetric component in catalog", () => {
    const components = catalog.components;
    expect(components).toHaveProperty("StatMetric");
  });

  it("includes DealCard component in catalog", () => {
    const components = catalog.components;
    expect(components).toHaveProperty("DealCard");
  });

  it("includes ContactCard component in catalog", () => {
    const components = catalog.components;
    expect(components).toHaveProperty("ContactCard");
  });

  it("includes TaskItem component in catalog", () => {
    const components = catalog.components;
    expect(components).toHaveProperty("TaskItem");
  });

  it("generates a prompt string for the LLM", () => {
    const prompt = catalog.prompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("StatMetric");
    expect(prompt).toContain("DealCard");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/views/catalog.test.ts
```

Expected: FAIL — `Cannot find module './catalog'`

**Step 3: Implement the catalog**

Create `src/lib/views/catalog.ts`:

```typescript
/**
 * json-render catalog defining the allowed view components.
 * The agent can only produce components listed here — json-render's
 * Zod validation rejects anything outside the catalog.
 * @module lib/views/catalog
 */
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
  name: "sunder-views",
  components: {
    /**
     * Big number + label, used for summary stats like "Active Deals: 29".
     * `valuePath` is a JSON Pointer into the state object (e.g. "/stats/activeDeals").
     */
    StatMetric: {
      props: z.object({
        label: z.string().describe("Metric label, e.g. 'Active Deals'"),
        valuePath: z.string().describe("JSON Pointer into state, e.g. '/stats/activeDeals'"),
        trend: z.enum(["up", "down", "flat"]).optional().describe("Optional trend arrow"),
      }),
      description:
        "Display a single stat metric — a large number with a label and optional trend indicator.",
    },
    /**
     * Compact card for a CRM deal — shows address, price, stage badge.
     */
    DealCard: {
      props: z.object({
        address: z.string().describe("Property address"),
        price: z.string().describe("Formatted price, e.g. '$1.2M'"),
        stage: z.string().optional().describe("Deal stage, e.g. 'leads', 'negotiation'"),
      }),
      description: "Compact card showing a CRM deal with address, price, and stage badge.",
    },
    /**
     * Compact card for a CRM contact — name, type, optional subtitle.
     */
    ContactCard: {
      props: z.object({
        name: z.string().describe("Full contact name"),
        type: z.string().optional().describe("Contact type, e.g. 'buyer', 'seller'"),
        subtitle: z.string().optional().describe("Extra context, e.g. last interaction date"),
      }),
      description: "Compact card showing a CRM contact with name, type badge, and optional subtitle.",
    },
    /**
     * Single task row — title, due date, status.
     */
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
  },
});
```

> **Note:** The catalog will also include the 36 built-in ShadCN components from `@json-render/shadcn` when wired into the registry. The catalog above defines only our custom CRM components. The exact `defineCatalog` API may need adjustment based on the json-render version — check the `@json-render/core` types after installing. If `defineCatalog` accepts a `components` map differently, adapt accordingly. The key constraint: each component must have `props` (Zod schema) and `description` (string).

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/views/catalog.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/views/catalog.ts src/lib/views/catalog.test.ts
git commit -m "feat(pr42a): define json-render view catalog with 4 CRM components"
```

---

## Task 3: Build Custom CRM Components

4 small React components registered in the json-render catalog. These render the actual UI for CRM-specific data. They are **stateless, presentational** components.

**Files:**
- Create: `src/components/views/stat-metric.tsx`
- Create: `src/components/views/stat-metric.test.tsx`
- Create: `src/components/views/deal-card.tsx`
- Create: `src/components/views/contact-card.tsx`
- Create: `src/components/views/task-item.tsx`

**Reference:**
- `src/components/crm/deal-kanban-card.tsx` — existing deal card UI to reuse patterns from
- `src/components/crm/task-kanban-card.tsx` — existing task card UI
- `src/components/crm/stage-badge.tsx` — stage badge styling (reuse directly)
- `src/components/crm/task-status-badge.tsx` — task status badge (reuse directly)
- `src/lib/crm/display.ts` — `formatCrmPrice`, `formatCrmDate` utilities

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
  it("renders label and value", () => {
    render(<StatMetric label="Active Deals" value="29" />);
    expect(screen.getByText("Active Deals")).toBeInTheDocument();
    expect(screen.getByText("29")).toBeInTheDocument();
  });

  it("renders trend arrow when trend is up", () => {
    render(<StatMetric label="Stale" value="3" trend="up" />);
    expect(screen.getByTestId("trend-indicator")).toHaveTextContent("↑");
  });

  it("renders trend arrow when trend is down", () => {
    render(<StatMetric label="Lost" value="1" trend="down" />);
    expect(screen.getByTestId("trend-indicator")).toHaveTextContent("↓");
  });

  it("does not render trend when absent", () => {
    render(<StatMetric label="Value" value="$4.2M" />);
    expect(screen.queryByTestId("trend-indicator")).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/views/stat-metric.test.tsx
```

Expected: FAIL — `Cannot find module './stat-metric'`

**Step 3: Implement StatMetric**

Create `src/components/views/stat-metric.tsx`:

```typescript
/**
 * StatMetric — big number + label + optional trend arrow.
 * Used in agent-generated views for summary statistics.
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
npx vitest run src/components/views/stat-metric.test.tsx
```

Expected: All tests PASS.

### Task 3b: DealCard Component

**Step 1: Implement DealCard**

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

**Step 1: Implement ContactCard**

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

**Step 1: Implement TaskItem**

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

**Step 2: Run all component tests**

```bash
npx vitest run src/components/views/
```

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add src/components/views/
git commit -m "feat(pr42a): add 4 custom CRM view components (StatMetric, DealCard, ContactCard, TaskItem)"
```

---

## Task 4: Build the Registry

The registry maps json-render catalog component names to actual React implementations. This is where we wire the ShadCN built-in components and our 4 custom CRM components together.

**Files:**
- Create: `src/lib/views/registry.tsx`

**Reference:**
- json-render docs: `defineRegistry()` from `@json-render/react` takes a catalog + component map
- `@json-render/shadcn` exports pre-built component implementations for 36 ShadCN components

**Step 1: Implement the registry**

Create `src/lib/views/registry.tsx`:

```typescript
/**
 * json-render component registry — maps catalog names to React components.
 * Combines @json-render/shadcn built-ins with our 4 custom CRM components.
 * @module lib/views/registry
 */
import { defineRegistry } from "@json-render/react";
import { components as shadcnComponents } from "@json-render/shadcn";

import { ContactCard } from "@/components/views/contact-card";
import { DealCard } from "@/components/views/deal-card";
import { StatMetric } from "@/components/views/stat-metric";
import { TaskItem } from "@/components/views/task-item";
import { catalog } from "./catalog";

export const { registry } = defineRegistry(catalog, {
  components: {
    // Built-in ShadCN components from json-render (Card, Grid, Tabs, Table, Chart, etc.)
    ...shadcnComponents,
    // Custom CRM components
    StatMetric: ({ props }) => (
      <StatMetric
        label={props.label}
        value={String(props.valuePath)}
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
  },
});
```

> **Important:** The `StatMetric` wrapper receives `props.valuePath` (a JSON Pointer like `/stats/activeDeals`). json-render's `$state` binding should resolve this to the actual value before it reaches the component. If `defineRegistry` components receive **resolved** props (not raw `$state` expressions), change `value={String(props.valuePath)}` to `value={props.valuePath}`. Test this at integration time and adjust. The json-render `StateProvider` + `Renderer` pipeline handles `$state` resolution automatically.

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors. If the `defineRegistry` or `shadcnComponents` APIs differ from what's shown, adapt the imports based on the installed package's type exports. Check `node_modules/@json-render/react/dist/index.d.ts` and `node_modules/@json-render/shadcn/dist/index.d.ts`.

**Step 3: Commit**

```bash
git add src/lib/views/registry.tsx
git commit -m "feat(pr42a): build json-render registry mapping catalog to ShadCN + CRM components"
```

---

## Task 5: Build the `show_view` Agent Tool

This is the tool the agent calls to display a view. It validates the spec and returns it as the tool result. The frontend detects this tool's output and renders it visually (Task 6).

**Files:**
- Create: `src/lib/runner/tools/views/show-view.ts`
- Create: `src/lib/runner/tools/views/show-view.test.ts`
- Create: `src/lib/runner/tools/views/index.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/tool-registry.ts`

**Reference:**
- `src/lib/runner/tools/utility/send-message.ts` — minimal tool factory pattern
- `src/lib/runner/tool-registry.ts` — where tools are assembled and spread into the registry

**Step 1: Write failing test for the tool**

Create `src/lib/runner/tools/views/show-view.test.ts`:

```typescript
/**
 * Tests for the show_view agent tool.
 * @module lib/runner/tools/views/show-view.test
 */
import { describe, expect, it } from "vitest";

import { createViewTools } from "./index";

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
              props: { label: "Deals", valuePath: "/count" },
            },
          },
        },
        state: { count: 5 },
      },
      { toolCallId: "test-1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toEqual({
      success: true,
      spec: {
        root: "card",
        elements: {
          card: {
            type: "StatMetric",
            props: { label: "Deals", valuePath: "/count" },
          },
        },
      },
      state: { count: 5 },
    });
  });

  it("returns the spec and state as-is (passthrough)", async () => {
    const tools = createViewTools();
    const state = { deals: [{ address: "Blk 322", price: "$1.2M" }] };
    const spec = {
      root: "list",
      elements: {
        list: { type: "Card", props: { title: "Deals" }, children: ["d1"] },
        d1: { type: "DealCard", props: { address: "Blk 322", price: "$1.2M" } },
      },
    };
    const result = await tools.show_view.execute(
      { spec, state },
      { toolCallId: "test-2", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    expect(result.spec).toEqual(spec);
    expect(result.state).toEqual(state);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/views/show-view.test.ts
```

Expected: FAIL — `Cannot find module './index'`

**Step 3: Implement the tool**

Create `src/lib/runner/tools/views/show-view.ts`:

```typescript
/**
 * show_view tool — agent outputs a json-render spec + pre-computed state.
 * The frontend detects this tool's output and renders it visually
 * via json-render's Renderer instead of the default JsonView.
 * @module lib/runner/tools/views/show-view
 */
import { tool } from "ai";
import { z } from "zod";

/**
 * Creates the show_view tool. No dependencies — the tool is a pure
 * passthrough that validates and returns the spec + state.
 */
export function createShowViewTool() {
  return tool({
    description:
      "Display an interactive view to the user in chat. " +
      "Use after querying data with CRM tools. " +
      "Compose from: Card, Grid, Tabs, Table, Chart, Text, Badge, " +
      "StatMetric, DealCard, ContactCard, TaskItem. " +
      "The 'spec' is a json-render spec (root + elements tree). " +
      "The 'state' is the pre-computed data the view reads from via $state bindings.",
    parameters: z.object({
      spec: z.object({
        root: z.string().describe("Key of the root element in the elements map"),
        elements: z.record(
          z.object({
            type: z.string().describe("Component name from the catalog"),
            props: z.record(z.unknown()).optional().describe("Component props"),
            children: z.array(z.string()).optional().describe("Keys of child elements"),
          }),
        ).describe("Flat map of element keys to element definitions"),
      }).describe("json-render UI specification"),
      state: z.record(z.unknown()).describe("Pre-computed data for $state bindings"),
    }),
    execute: async ({ spec, state }) => {
      return { success: true as const, spec, state };
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
npx vitest run src/lib/runner/tools/views/show-view.test.ts
```

Expected: All tests PASS.

**Step 5: Register the tool in the runner**

Modify `src/lib/runner/tools/index.ts` — add the export:

```typescript
export { createViewTools } from "./views";
```

Modify `src/lib/runner/tool-registry.ts` — import and spread:

Add to imports at the top:
```typescript
import { createViewTools } from "@/lib/runner/tools/views";
```

Inside `createRunnerTools()`, create the view tools and spread them into the return objects. Add `const viewTools = createViewTools();` after the other tool creations, and spread `...viewTools` into both the subagent return (line ~62) and the main return (line ~76).

> **Note:** View tools are read-only (no mutations) so they're safe for subagents too.

**Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 7: Commit**

```bash
git add src/lib/runner/tools/views/ src/lib/runner/tools/index.ts src/lib/runner/tool-registry.ts
git commit -m "feat(pr42a): add show_view agent tool and register in runner"
```

---

## Task 6: Build ViewCard and Wire into ToolCallInline

This is the frontend rendering piece. When `ToolCallInline` sees a `show_view` tool result, it renders a `ViewCard` (json-render `Renderer` + `StateProvider`) instead of the default `JsonView`.

**Files:**
- Create: `src/components/views/view-card.tsx`
- Create: `src/components/views/view-card.test.tsx`
- Modify: `src/components/chat/tool-call-inline.tsx`

**Reference:**
- `src/components/chat/tool-call-inline.tsx:108-118` — the `JsonView` render path to intercept
- `src/components/ui/json-view.tsx` — what ViewCard replaces
- json-render docs: `<Renderer spec={spec} registry={registry} />` wrapped in `<StateProvider initialState={state}>`

**Step 1: Write failing test for ViewCard**

Create `src/components/views/view-card.test.tsx`:

```typescript
/**
 * Tests for the ViewCard component that renders json-render specs inline in chat.
 * @module components/views/view-card.test
 */
import { render, screen } from "@testing-library/react";
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
      card: { type: "StatMetric", props: { label: "Test", valuePath: "/val" } },
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

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/views/view-card.test.tsx
```

Expected: FAIL — `Cannot find module './view-card'`

**Step 3: Implement ViewCard**

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

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/views/view-card.test.tsx
```

Expected: All tests PASS.

**Step 5: Wire ViewCard into ToolCallInline**

Modify `src/components/chat/tool-call-inline.tsx`.

Add import at the top:
```typescript
import { ViewCard } from "@/components/views/view-card";
```

In the component body, find the result rendering section (lines 108-118). The current code:

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

Replace with logic that checks if the tool is `show_view` and the output has a valid spec:

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

Add the type guard function above the component (or at the bottom of the file):

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

**Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 7: Run all tests**

```bash
npx vitest run src/components/views/ src/components/chat/ src/lib/views/ src/lib/runner/tools/views/
```

Expected: All tests PASS.

**Step 8: Commit**

```bash
git add src/components/views/view-card.tsx src/components/views/view-card.test.tsx src/components/chat/tool-call-inline.tsx
git commit -m "feat(pr42a): build ViewCard and wire into ToolCallInline for inline view rendering"
```

---

## Task 7: Integration Test — Manual Smoke Test

This task verifies the full flow end-to-end in the browser. No automated test — this is a manual verification.

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Open the app and navigate to chat**

Open `http://localhost:3000/chat` in your browser. Log in if needed.

**Step 3: Trigger a view generation**

Type a message that should trigger the agent to use `show_view`. Examples:
- "Show me my deals pipeline"
- "Give me an overview of my contacts"
- "What tasks are overdue?"

> **Note:** The agent needs to learn when to use `show_view`. If it responds with text instead of a view, this is expected on first try — the tool is available but the LLM may not choose it without prompting. Try: "Show me my deals pipeline as a visual dashboard" or "Use the show_view tool to display my deals."

**Step 4: Verify the view renders**

Expected behavior:
1. Agent calls CRM search tools (visible in "Done in N steps" collapsed area)
2. Agent calls `show_view` with a spec + state
3. Instead of seeing raw JSON in the tool result, you see rendered components (stat cards, deal cards, etc.)
4. The view is styled with borders, proper spacing, and matches the existing app theme
5. Text response from the agent appears above or below the view

**Step 5: Verify responsiveness**

Resize the browser window to mobile width (~375px). The view should reflow and remain readable.

**Step 6: Verify fallback**

Expand the "Done in N steps" section. The `show_view` tool call should show the ViewCard, not raw JSON. Other tool calls (like `search_deals`) should still show `JsonView` as before.

---

## Task 8: Final Verification and Commit

**Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: All existing tests still pass. No regressions.

**Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Run linter**

```bash
npm run lint
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

### json-render API Caveats

The `@json-render/core`, `@json-render/react`, and `@json-render/shadcn` packages are from Vercel Labs and may have API differences from what's documented here. After installing (Task 1), check:

1. `node_modules/@json-render/core/dist/index.d.ts` — verify `defineCatalog` signature
2. `node_modules/@json-render/react/dist/index.d.ts` — verify `defineRegistry`, `Renderer`, `StateProvider` exports
3. `node_modules/@json-render/shadcn/dist/index.d.ts` — verify `components` export shape

If APIs differ, adapt the catalog, registry, and ViewCard accordingly. The design intent stays the same — the exact import paths and function signatures may vary.

### How `$state` Bindings Work

In the spec, components can reference data from the `state` object using JSON Pointers:

```json
{ "props": { "content": { "$state": "/stats/activeDeals" } } }
```

json-render resolves `{ "$state": "/stats/activeDeals" }` to the actual value (e.g., `29`) before passing it to the component as a prop. The `StateProvider` wrapping the `Renderer` makes this work. Your custom components receive **resolved** prop values, not raw `$state` expressions.

### Testing Strategy

- **Unit tests** cover: catalog definition, StatMetric rendering, show_view tool execute
- **Integration** is manual: trigger the agent in chat, verify the view renders
- **No E2E tests** for this PR — the LLM's decision to call `show_view` is non-deterministic. Manual smoke testing is more reliable here.

### What NOT to Build

Per the design doc's "What We Cut" section:
- No `save_view` tool or `saved_views` DB table
- No `/views/[viewId]` page route
- No sidebar VIEWS section
- No `useViewData` or generic data-fetching hook
- No streaming/progressive rendering
- No `pipeJsonRender` Chat Mode integration
