# PR 31: Agent-Generated Views — Design Doc

## Problem

The user says "show me my deals pipeline" in chat and gets a text wall. They want an actual kanban board, stat cards, charts — real interactive components rendered inline in the conversation.

## Solution

Use [json-render](https://github.com/vercel-labs/json-render) (Vercel Labs) as the rendering layer. The agent outputs a JSON recipe describing what to show. json-render turns it into real ShadCN components. The agent pre-computes the data.

Views live **inline in chat only**. No pinned views, no saved views, no sidebar section, no extra DB table. User wants a fresh view? Ask the agent again.

### Three Jobs

| Job | Who Does It | How |
|-----|------------|-----|
| 1. Decide what to show | Agent (LLM) | Outputs a JSON spec via `show_view` tool |
| 2. Turn recipe into components | json-render | `Renderer` + `registry` + `@json-render/shadcn` |
| 3. Provide CRM data | Agent (LLM) | Pre-computes data via CRM tools, embeds in `state` |

## Architecture

```
User: "Show me my pipeline"
         |
         v
+---------------------------------+
|        Agent (LLM)              |
|                                 |
|  1. Calls CRM tools to get data|
|     (search_deals, etc.)        |
|                                 |
|  2. Calls show_view tool with   |
|     JSON spec + pre-computed    |
|     state data                  |
+----------------+----------------+
                 |
                 v
+---------------------------------+
|     Chat Message Stream         |
|                                 |
|  Tool part: tool-show_view      |
|  output: { spec, state }        |
+----------------+----------------+
                 |
                 v
+---------------------------------+
|     ToolCallInline (modified)   |
|                                 |
|  Detects tool-show_view         |
|  Instead of JsonView, renders:  |
|                                 |
|  +---------------------------+  |
|  | <ViewCard>                |  |
|  |   <StateProvider>         |  |
|  |     <Renderer             |  |
|  |       spec={output.spec}  |  |
|  |       registry={registry} |  |
|  |     />                    |  |
|  |   </StateProvider>        |  |
|  +---------------------------+  |
+---------------------------------+
```

## Data Strategy

### Decision: Agent pre-computes state

The agent already has CRM search tools. When it decides to show a view, it:
1. Queries the data it needs (search_deals, search_contacts, etc.)
2. Packages the results into the spec's `state` object
3. Outputs the full spec + state via `show_view`

No generic data-fetching layer needed. No `useViewData` hook. No query builder. The agent does the data work — the frontend just renders.

### Example spec + state

```json
{
  "spec": {
    "root": "dashboard",
    "elements": {
      "dashboard": {
        "type": "Card",
        "props": { "title": "Pipeline Health" },
        "children": ["stats", "kanban"]
      },
      "stats": {
        "type": "Grid",
        "props": { "columns": 3 },
        "children": ["stat1", "stat2", "stat3"]
      },
      "stat1": {
        "type": "StatMetric",
        "props": {
          "label": "Active Deals",
          "valuePath": "/stats/activeDeals"
        }
      },
      "stat2": {
        "type": "StatMetric",
        "props": {
          "label": "Pipeline Value",
          "valuePath": "/stats/pipelineValue"
        }
      },
      "stat3": {
        "type": "StatMetric",
        "props": {
          "label": "Stale >14d",
          "valuePath": "/stats/staleDeals",
          "trend": "up"
        }
      },
      "kanban": {
        "type": "Tabs",
        "props": {},
        "children": ["leads_tab", "nego_tab", "offer_tab"]
      }
    }
  },
  "state": {
    "stats": {
      "activeDeals": 29,
      "pipelineValue": "$4.2M",
      "staleDeals": 3
    },
    "deals": {
      "leads": [
        { "address": "Blk 322 Jurong", "price": "$1.2M" },
        { "address": "Marine Parade", "price": "$2.1M" }
      ],
      "negotiation": [
        { "address": "Bishan St 23", "price": "$800K" }
      ]
    }
  }
}
```

### Why this works without live data

Views are contextual to the conversation. The agent just queried the data — it's fresh. If the user comes back tomorrow and wants updated numbers, they ask again and get a new view with current data. No stale snapshot problem because there's nothing persisted outside the chat.

## What json-render Gives Us (free)

- 36 ShadCN components: `Card`, `Grid`, `Tabs`, `Table`, `Text`, `Badge`, `Alert`, `Chart`, `Button`, `Link`, `Progress`, etc.
- Zod validation of specs — LLM can't output invalid components
- `StateProvider` + `$state` bindings — components read from the pre-computed state object
- `Renderer` + `defineRegistry` — maps spec to React components

## What We Build

| Component | Purpose | Effort |
|-----------|---------|--------|
| `show_view` tool | Agent outputs spec + state | Small |
| `ViewCard` | Wraps Renderer inside chat message | Small |
| `catalog.ts` | json-render catalog definition | Small |
| `registry.tsx` | Maps component names to ShadCN + CRM components | Medium (one-time) |

### Custom CRM Components for Registry

4 thin wrappers around existing CRM UI, registered in the catalog so the LLM knows they exist:

| Component | Renders | Reuses From |
|-----------|---------|-------------|
| `StatMetric` | Big number + label + optional trend arrow | New (~30 lines) |
| `DealCard` | Address + price + stage badge | Deals kanban page |
| `ContactCard` | Name + type + last interaction | Contacts list page |
| `TaskItem` | Title + due date + status | Tasks list page |

## Agent Tool

One tool. That's it.

```typescript
// src/lib/runner/tools/views/show-view.ts

{
  name: "show_view",
  description: "Display an interactive view to the user in chat. " +
    "Use after querying data with CRM tools. " +
    "Compose from: Card, Grid, Tabs, Table, Chart, Text, Badge, " +
    "StatMetric, DealCard, ContactCard, TaskItem.",
  parameters: z.object({
    spec: z.object({
      root: z.string(),
      elements: z.record(z.object({
        type: z.string(),
        props: z.record(z.unknown()).optional(),
        children: z.array(z.string()).optional(),
      })),
    }),
    state: z.record(z.unknown()),
  }),
  execute: async ({ spec, state }) => {
    // Validate spec against catalog schema
    return { success: true, spec, state };
  }
}
```

## Chat Mode vs Tool-Based

json-render has a Chat Mode (`pipeJsonRender`) that streams specs inline with text. We use the **tool-based approach** instead:

- Fits our existing tool rendering pipeline (ToolCallInline)
- No changes to chat route or AI SDK message format
- Works with our approval system
- json-render stays a frontend-only dependency

Trade-off: no progressive rendering of views. But specs are small (~500-1000 tokens), so they generate in 1-2 seconds and render instantly. Not worth the integration complexity for v1.

## UI Wireframe

```
+-- Chat ------------------------------------------------+
|                                                         |
|  You: Show me my pipeline                               |
|                                                         |
|  Agent: Here's your pipeline overview.                  |
|                                                         |
|  Done in 4 steps v                                      |
|                                                         |
|  +-- Pipeline Health --------------------------------+  |
|  |                                                   |  |
|  |  +----------+ +----------+ +----------+           |  |
|  |  | Active   | |  Value   | |  Stale   |           |  |
|  |  |   29     | |  $4.2M   | |    3     |           |  |
|  |  +----------+ +----------+ +----------+           |  |
|  |                                                   |  |
|  |  +- Leads --+- Nego ----+- Offer ---+            |  |
|  |  | Blk 322  | Bishan    | Toa Payoh |            |  |
|  |  | $1.2M    | $800K     | $650K     |            |  |
|  |  |          |           |           |            |  |
|  |  | Marine P | Jurong    |           |            |  |
|  |  | $2.1M    | $450K     |           |            |  |
|  |  +----------+-----------+-----------+            |  |
|  +---------------------------------------------------+  |
|                                                         |
|  3 deals haven't moved in 2 weeks.                      |
|  Want me to follow up on any of them?                   |
|                                                         |
|  +--------------------------------------------------+  |
|  | Send a message...                                 |  |
|  +--------------------------------------------------+  |
+---------------------------------------------------------+
```

## File Plan

```
New files:
  src/lib/views/catalog.ts              -- json-render catalog definition
  src/lib/views/registry.tsx            -- maps catalog to ShadCN + CRM components
  src/components/views/view-card.tsx     -- inline chat wrapper (StateProvider + Renderer)
  src/components/views/stat-metric.tsx   -- custom StatMetric component
  src/components/views/deal-card.tsx     -- custom DealCard (extract from deals page)
  src/components/views/contact-card.tsx  -- custom ContactCard (extract from contacts page)
  src/components/views/task-item.tsx     -- custom TaskItem (extract from tasks page)
  src/lib/runner/tools/views/show-view.ts -- show_view tool definition

Modified files:
  src/components/chat/tool-call-inline.tsx -- detect show_view, render ViewCard
  src/lib/runner/run-agent.ts             -- register show_view tool
```

## Dependencies

```
@json-render/core     -- catalog, spec validation, types
@json-render/react    -- Renderer, StateProvider, defineRegistry
@json-render/shadcn   -- 36 pre-built ShadCN component implementations
```

## What We Cut (and why)

| Cut | Why |
|-----|-----|
| `save_view` tool | No pinned views |
| `saved_views` DB table + migration | No persistence outside chat |
| `/views/[viewId]` page route | No standalone view pages |
| `useSavedViews` hook | No saved views to query |
| Sidebar VIEWS section | No pinned views to list |
| `useViewData` generic hook | Agent pre-computes data, no frontend fetching |
| Chat Mode / `pipeJsonRender` | Tool-based approach is simpler |
| Streaming progressive render | Specs are small, not worth the complexity |

## Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | json-render for rendering | Gives us 36 ShadCN components + catalog + validation for free |
| 2 | Tool-based, not Chat Mode | Fits existing pipeline, no chat route changes |
| 3 | Agent pre-computes state | No generic data layer needed, data is always fresh in context |
| 4 | No pinned/saved views | Eliminates stale data problem, DB table, sidebar section, page route |
| 5 | No streaming | Specs are small, instant render after tool completes |
| 6 | 4 custom CRM components | StatMetric, DealCard, ContactCard, TaskItem — extract from existing pages |
| 7 | Start narrow, expand later | Only add catalog components when real users need them |

## Future Enhancements (only if needed)

- **Pinned views:** Add `saved_views` table + `save_view` tool + sidebar section + `useViewData` for live data
- **Streaming:** Switch to Chat Mode with `pipeJsonRender` for progressive rendering
- **More components:** Calendar, Timeline, Gallery — add to catalog when requested
- **Interactive actions:** Button clicks in views trigger agent actions (e.g., "mark task done" from a TaskItem)
