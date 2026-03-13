# json-render Inline Mode — Reference for Sunder Migration

> **Purpose:** Zero-drift reference document for migrating Sunder's agent views from the custom `show_view` tool-call pattern to json-render's native **Inline Mode**. All patterns documented here are extracted from the official `json-render` repo (`examples/chat/`).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Reference Patterns (from `examples/chat/`)](#2-reference-patterns)
3. [Files to Copy / Reference](#3-files-to-copy--reference)
4. [Drift Analysis: Sunder Today vs Reference](#4-drift-analysis)
5. [Migration Checklist](#5-migration-checklist)

---

## 1. Architecture Overview

### How Inline Mode Works

In **Inline Mode**, the LLM writes both prose text **and** JSONL UI specs in its output stream. The flow:

```
LLM output (text + ```spec fences)
  → pipeJsonRender() transform stream
    → classifies prose vs JSONL patches
    → emits SpecDataPart chunks (type: "data-spec")
  → AI SDK UIMessageStream
    → client receives message.parts[]
  → useJsonRenderMessage(parts)
    → returns { spec, text, hasSpec }
  → <Renderer spec={spec} registry={registry} />
```

Key insight: **There is no tool call.** The LLM is instructed via `catalog.prompt({ mode: "inline" })` to emit `\`\`\`spec` code fences containing RFC 6902 JSON Patch lines. The `pipeJsonRender()` transform detects these fences and converts them to structured `SpecDataPart` chunks.

### Reference Repo Structure

```
examples/chat/
├── app/
│   ├── api/generate/route.ts   ← Server: pipeJsonRender()
│   └── page.tsx                ← Client: useJsonRenderMessage + MessageBubble
├── lib/
│   ├── agent.ts                ← Agent: catalog.prompt() in instructions
│   └── render/
│       ├── catalog.ts          ← Catalog: defineCatalog(schema, { components, actions })
│       ├── registry.tsx        ← Registry: defineRegistry(catalog, { components })
│       └── renderer.tsx        ← Renderer: ExplorerRenderer wrapper
```

---

## 2. Reference Patterns

### 2.1 Catalog Definition (`catalog.ts`)

The catalog defines **what the LLM can generate** — component types with Zod schemas.

```typescript
// examples/chat/lib/render/catalog.ts
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

export const explorerCatalog = defineCatalog(schema, {
  components: {
    // Reuse shadcn definitions directly
    Stack: shadcnComponentDefinitions.Stack,
    Card: shadcnComponentDefinitions.Card,
    Grid: shadcnComponentDefinitions.Grid,
    // ... more shadcn components

    // Custom components with full Zod schemas
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable(),
        trend: z.enum(["up", "down", "neutral"]).nullable(),
      }),
      description: "Single metric display with label, value, and optional trend indicator",
      example: { label: "Temperature", value: "72F", detail: "Feels like 68F", trend: "up" },
    },

    Table: {
      props: z.object({
        data: z.array(z.record(z.string(), z.unknown())),
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        emptyMessage: z.string().nullable(),
      }),
      description: 'Data table. Use { "$state": "/path" } to bind read-only data from state.',
      example: {
        data: { $state: "/stories" },
        columns: [{ key: "title", label: "Title" }, { key: "score", label: "Score" }],
      },
    },
    // ... more components
  },
  actions: {},
});
```

**Key patterns:**
- Uses `defineCatalog(schema, { components, actions })` — `schema` comes from `@json-render/react/schema`
- Each component has `props` (Zod schema), `description`, and optional `example`
- `shadcnComponentDefinitions` provides pre-built definitions for layout components
- Components with children use `slots: ["default"]`
- All nullable props use `.nullable()` (not `.optional()`)

### 2.2 Registry Definition (`registry.tsx`)

The registry maps catalog component names to React implementations.

```typescript
// examples/chat/lib/render/registry.tsx
"use client";

import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import { explorerCatalog } from "./catalog";

export const { registry, handlers } = defineRegistry(explorerCatalog, {
  components: {
    // Reuse shadcn implementations directly
    Stack: shadcnComponents.Stack,
    Card: shadcnComponents.Card,
    Grid: shadcnComponents.Grid,
    // ... more shadcn components

    // Custom implementations
    Metric: ({ props }) => (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{props.label}</p>
        <span className="text-2xl font-bold">{props.value}</span>
        {props.detail && <p className="text-xs text-muted-foreground">{props.detail}</p>}
      </div>
    ),

    Table: ({ props }) => {
      // Full table implementation with sorting
      const rawData = props.data;
      const items: Array<Record<string, unknown>> = Array.isArray(rawData) ? rawData : [];
      // ... renders <Table> from shadcn
    },

    // Components with children receive them as `children` prop
    Tabs: ({ props, children }) => (
      <Tabs defaultValue={props.defaultValue ?? (props.tabs ?? [])[0]?.value}>
        <TabsList>
          {(props.tabs ?? []).map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
        {children}
      </Tabs>
    ),

    // Interactive components use useBoundProp for two-way binding
    RadioGroup: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(props.value as string | undefined, bindings?.value);
      // ... renders RadioGroup
    },

    // Button uses emit for actions
    Button: ({ props, emit }) => (
      <Button onClick={() => emit("press")}>{props.label}</Button>
    ),
  },
});
```

**Key patterns:**
- `defineRegistry(catalog, { components })` — typed against the catalog
- Returns `{ registry, handlers }` (handlers are for action dispatch)
- Component render functions receive `{ props, children, bindings, emit }`
- `useBoundProp` from `@json-render/react` for two-way state binding
- `emit("press")` for action dispatch (used with `on.press` in specs)
- Defensive data handling: `Array.isArray(rawData) ? rawData : []`

### 2.3 Agent Instructions (`agent.ts`)

The agent uses `catalog.prompt({ mode: "inline" })` to generate LLM instructions.

```typescript
// examples/chat/lib/agent.ts
import { ToolLoopAgent, stepCountIs } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { explorerCatalog } from "./render/catalog";

const AGENT_INSTRUCTIONS = `You are a knowledgeable assistant...

WORKFLOW:
1. Call the appropriate tools to gather relevant data.
2. Respond with a brief, conversational summary of what you found.
3. Then output the JSONL UI spec wrapped in a \`\`\`spec fence to render a rich visual experience.

RULES:
- Always call tools FIRST to get real data. Never make up data.
- Embed the fetched data directly in /state paths so components can reference it.
- Use Card components to group related information.
// ... domain-specific rules

DATA BINDING:
- The state model is the single source of truth.
- Put fetched data in /state, then reference it with { "$state": "/json/pointer" } in any prop.
- Always emit /state patches BEFORE the elements that reference them.

${explorerCatalog.prompt({
  mode: "inline",
  customRules: [
    "NEVER use viewport height classes — the UI renders inside a fixed-size container.",
    "Prefer Grid with columns='2' or columns='3' for side-by-side layouts.",
    // ... more rules
  ],
})}`;

export const agent = new ToolLoopAgent({
  model: gateway(process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL),
  instructions: AGENT_INSTRUCTIONS,
  tools: { getWeather, getGitHubRepo, /* ... */ },
  stopWhen: stepCountIs(5),
  temperature: 0.7,
});
```

**Key patterns:**
- `catalog.prompt({ mode: "inline" })` generates the full spec format instructions, component catalog, and JSONL patch syntax automatically
- `customRules` array for domain-specific additions
- The agent instructions explicitly tell the LLM the workflow: tools → summary → spec fence
- Data binding guidance: "emit /state patches BEFORE elements that reference them"
- The catalog prompt is **appended** to custom instructions (not the entire system prompt)

### 2.4 Server Route (`route.ts`)

The server route pipes the LLM stream through `pipeJsonRender()`.

```typescript
// examples/chat/app/api/generate/route.ts
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { pipeJsonRender } from "@json-render/core";
import { agent } from "@/lib/agent";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const uiMessages: UIMessage[] = body.messages;

  if (!uiMessages || !Array.isArray(uiMessages) || uiMessages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const modelMessages = await convertToModelMessages(uiMessages);
  const result = await agent.stream({ messages: modelMessages });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

**Key patterns:**
- `pipeJsonRender(result.toUIMessageStream())` — wraps the AI SDK stream
- `writer.merge()` pipes the transformed stream into the UIMessageStream writer
- No manual parsing — `pipeJsonRender` handles all `\`\`\`spec` fence detection and JSONL patch parsing
- This is the **only server-side change** needed for inline mode

### 2.5 Renderer Wrapper (`renderer.tsx`)

The renderer wraps json-render's `<Renderer>` with the required providers.

```typescript
// examples/chat/lib/render/renderer.tsx
"use client";

import { type ReactNode } from "react";
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";
import { registry, Fallback } from "./registry";

interface ExplorerRendererProps {
  spec: Spec | null;
  loading?: boolean;
}

const fallback: ComponentRenderer = ({ element }) => (
  <Fallback type={element.type} />
);

export function ExplorerRenderer({ spec, loading }: ExplorerRendererProps): ReactNode {
  if (!spec) return null;

  return (
    <StateProvider initialState={spec.state ?? {}}>
      <VisibilityProvider>
        <ActionProvider>
          <Renderer
            spec={spec}
            registry={registry}
            fallback={fallback}
            loading={loading}
          />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
```

**Key patterns:**
- `StateProvider initialState={spec.state ?? {}}` — state comes from the spec itself
- `ActionProvider` has **no** `handlers` prop (empty)
- `fallback` component renders unknown types gracefully
- `loading` prop passed through for streaming skeleton states
- Provider order: `StateProvider > VisibilityProvider > ActionProvider > Renderer`

### 2.6 Client Page (`page.tsx`)

The client uses `useJsonRenderMessage` to extract specs from message parts.

```typescript
// examples/chat/app/page.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { SPEC_DATA_PART, SPEC_DATA_PART_TYPE, type SpecDataPart } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import { ExplorerRenderer } from "@/lib/render/renderer";

type AppDataParts = { [SPEC_DATA_PART]: SpecDataPart };
type AppMessage = UIMessage<unknown, AppDataParts>;

const transport = new DefaultChatTransport({ api: "/api/generate" });

function MessageBubble({ message, isLast, isStreaming }: {
  message: AppMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const { spec, text, hasSpec } = useJsonRenderMessage(message.parts);

  // Build ordered segments from parts (text, tools, spec)
  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "tools"; tools: Array<{ toolCallId: string; toolName: string; state: string; output?: unknown }> }
    | { kind: "spec" }
  > = [];

  let specInserted = false;

  for (const part of message.parts) {
    if (part.type === "text") {
      if (!part.text.trim()) continue;
      const last = segments[segments.length - 1];
      if (last?.kind === "text") {
        last.text += part.text;
      } else {
        segments.push({ kind: "text", text: part.text });
      }
    } else if (part.type.startsWith("tool-")) {
      // ... collapse adjacent tool calls into a single segment
    } else if (part.type === SPEC_DATA_PART_TYPE && !specInserted) {
      segments.push({ kind: "spec" });
      specInserted = true;
    }
  }

  // Render segments in order
  return (
    <div className="w-full flex flex-col gap-3">
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <div key={`text-${i}`}>/* markdown rendering */</div>;
        }
        if (seg.kind === "spec") {
          if (!hasSpec) return null;
          return (
            <div key="spec" className="w-full">
              <ExplorerRenderer spec={spec} loading={isLast && isStreaming} />
            </div>
          );
        }
        return <div key={`tools-${i}`}>/* tool call display */</div>;
      })}

      {/* Fallback: render spec at end if no inline position was found */}
      {hasSpec && !specInserted && (
        <div className="w-full">
          <ExplorerRenderer spec={spec} loading={isLast && isStreaming} />
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat<AppMessage>({ transport });
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    // ... render messages with <MessageBubble />
  );
}
```

**Key patterns:**
- `useJsonRenderMessage(message.parts)` returns `{ spec, text, hasSpec }`
- `SPEC_DATA_PART_TYPE` (= `"data-spec"`) is used to detect where the spec appears in the parts array
- Segments are built by iterating `message.parts` — this determines inline positioning of the rendered UI
- `loading={isLast && isStreaming}` enables skeleton states during streaming
- Fallback: if `hasSpec` but no `SPEC_DATA_PART_TYPE` was found in parts, render at end

---

## 3. Files to Copy / Reference

### 3.1 Direct Copy Targets

| Reference File | Sunder Target | Action |
|---|---|---|
| `examples/chat/lib/render/renderer.tsx` | `src/lib/views/renderer.tsx` (new) | **Copy** — replace `ViewCard` with this pattern |
| `examples/chat/lib/render/catalog.ts` | `src/lib/views/catalog.ts` | **Rewrite** — keep Sunder's CRM components, adopt pattern |
| `examples/chat/lib/render/registry.tsx` | `src/lib/views/registry.tsx` | **Update** — adopt `defineRegistry` pattern, keep CRM components |

### 3.2 Integration Points (Modify Existing)

| Reference File | Sunder File | Change |
|---|---|---|
| `examples/chat/app/api/generate/route.ts` | `app/api/chat/route.ts` | Add `pipeJsonRender()` wrapping `result.streamResult.toUIMessageStream()` |
| `examples/chat/lib/agent.ts` | `src/lib/ai/system-prompt.ts` | Replace `getViewCatalogPrompt()` with `catalog.prompt({ mode: "inline" })` |
| `examples/chat/app/page.tsx` | `src/components/chat/message-list.tsx` (or equivalent) | Add `useJsonRenderMessage` + segment-based rendering |

### 3.3 Files to Remove (After Migration)

| File | Reason |
|---|---|
| `src/lib/runner/tools/views/show-view.ts` | Tool-call pattern replaced by inline mode |
| `src/lib/runner/tools/views/show-view.test.ts` | Tests for removed tool |
| `src/components/chat/show-view-inline.tsx` | Lazy ViewCard wrapper no longer needed |
| `src/components/views/view-card.tsx` | Replaced by `renderer.tsx` |
| `src/components/views/view-card.test.tsx` | Tests for removed component |
| `src/components/chat/tool-call-inline.tsx` | Remove `show_view` special-casing (lines ~67-72) |

---

## 4. Drift Analysis

### 4.1 Current Sunder Approach (Tool-Call Pattern)

```
LLM decides to show a view
  → calls show_view tool with { spec, state } params
  → tool validates spec structure + catalog membership
  → returns { success, spec, state } as tool result
  → client detects show_view in tool-call parts
  → renders ShowViewInline > ViewCard > Renderer
```

**Problems with this approach:**
1. `z.unknown()` on the spec param gives the LLM no structural schema guidance
2. Manual `getViewCatalogPrompt()` duplicates what `catalog.prompt()` generates automatically
3. The LLM frequently produces invalid specs because it has no schema to follow
4. Spec validation happens post-generation (in the tool handler), not via schema
5. State is passed as a separate param and must be manually merged into the spec
6. No streaming — the entire spec arrives as a single tool result

### 4.2 Drift Points

| Area | Sunder Current | Reference Pattern | Drift Needed? |
|---|---|---|---|
| **Spec delivery** | Tool call (`show_view`) | Inline `\`\`\`spec` fences via `pipeJsonRender` | **No drift** — adopt reference pattern |
| **Prompt generation** | Manual `getViewCatalogPrompt()` | `catalog.prompt({ mode: "inline" })` | **No drift** — adopt reference pattern |
| **State injection** | Separate `state` param, merged in `ViewCard` via `useMemo` | State embedded in spec (`spec.state`), `StateProvider initialState={spec.state ?? {}}` | **No drift** — adopt reference pattern |
| **Renderer wrapper** | `ViewCard` with `ActionProvider handlers={{}}` | `ExplorerRenderer` with `ActionProvider` (no handlers prop) | **No drift** — adopt reference pattern |
| **Registry** | `defineRegistry(catalog, { components })` | Same | Already aligned |
| **Catalog** | `defineCatalog(schema, { components, actions: {} })` | Same | Already aligned |
| **Agent orchestration** | `runAgent()` → `streamText()` → `toUIMessageStream()` | `ToolLoopAgent` → `agent.stream()` → `toUIMessageStream()` | **Justified drift** — see below |
| **Chat transport** | Custom `useChat` with `useAgentChat` patterns | `DefaultChatTransport({ api })` | **Justified drift** — see below |
| **CRM-specific components** | StatMetric, DealCard, ContactCard, TaskItem, chart panels | Not in reference (reference has Metric, generic charts) | **Justified drift** — domain-specific |
| **Approval system** | Tool approval flow in chat route | Not in reference | **Justified drift** — Sunder feature |

### 4.3 Justified Drift (Reasons to Diverge)

#### 1. Agent Orchestration (`runAgent` vs `ToolLoopAgent`)

**Reference:** Uses `ToolLoopAgent` from `ai` SDK directly.
**Sunder:** Uses custom `runAgent()` with queue management, tenant isolation, quota tracking, approval gating, and CRM context assembly.

**Reason:** Sunder's runner is the core orchestration engine. It handles:
- Thread-level queue serialization
- Per-client message quotas
- Approval gates for external-facing tools
- 7-layer context assembly (system prompt, memory, CRM context)
- Langfuse tracing

**Drift:** Keep `runAgent()`. The only change is wrapping its output with `pipeJsonRender()`.

#### 2. Chat Transport and Client

**Reference:** Uses `DefaultChatTransport` and simple `useChat`.
**Sunder:** Uses custom chat hooks with thread management, resumable streams (Redis), approval UI, and data-chat-title handling.

**Reason:** Sunder's chat client handles threads, approvals, titles, and resumable streams. The reference's simple transport doesn't support these.

**Drift:** Keep Sunder's chat client architecture. Add `useJsonRenderMessage` and segment-based rendering to the message display layer only.

#### 3. CRM-Specific Components

**Reference:** Generic data components (Metric, Table, BarChart, etc.).
**Sunder:** Domain-specific CRM components (StatMetric, DealCard, ContactCard, TaskItem, chart panels).

**Reason:** CRM views need domain-specific rendering (deal stages, contact types, formatted prices). These are value-adds for the product.

**Drift:** Keep CRM components in the catalog and registry. Follow the same pattern (Zod schema + description + example) as the reference.

### 4.4 No-Drift Items (Must Align Exactly)

1. **`pipeJsonRender()` in the server route** — wrap stream output identically to reference
2. **`catalog.prompt({ mode: "inline" })` for LLM instructions** — replace manual prompt generation
3. **`useJsonRenderMessage(parts)` in the client** — extract spec from message parts
4. **Renderer wrapper pattern** — `StateProvider > VisibilityProvider > ActionProvider > Renderer` with `spec.state ?? {}`
5. **`SPEC_DATA_PART_TYPE` detection** — for inline positioning of rendered UI
6. **`fallback` component** — graceful unknown-type rendering
7. **`loading` prop** — pass `isLast && isStreaming` for streaming skeletons

---

## 5. Migration Checklist

### Phase 1: Server-Side (pipeJsonRender)

- [ ] **`app/api/chat/route.ts`** — Wrap stream with `pipeJsonRender()`:
  ```typescript
  // Before:
  writer.merge(result.streamResult.toUIMessageStream());

  // After:
  import { pipeJsonRender } from "@json-render/core";
  writer.merge(pipeJsonRender(result.streamResult.toUIMessageStream()));
  ```

### Phase 2: Catalog + Prompt

- [ ] **`src/lib/views/catalog.ts`** — Add `example` fields to component definitions (helps LLM produce valid output)
- [ ] **`src/lib/ai/system-prompt.ts`** — Replace `getViewCatalogPrompt()` with `catalog.prompt({ mode: "inline", customRules: [...] })`:
  ```typescript
  // Before:
  const VIEW_GUIDANCE_PROMPT = getViewCatalogPrompt();

  // After:
  import { catalog } from "@/lib/views/catalog";
  const VIEW_GUIDANCE_PROMPT = catalog.prompt({
    mode: "inline",
    customRules: [
      "Charts are snapshot-only. Use compact aggregated data, do not imply refresh or live dashboards.",
      "Keep the full UI spec under about 4KB.",
      "For repeated rows, prefer repeat + $item over one element per record.",
    ],
  });
  ```
- [ ] **Remove `getViewCatalogPrompt()`** from catalog.ts — no longer needed
- [ ] **Add agent workflow instructions** to system prompt telling the LLM to emit `\`\`\`spec` fences after gathering data

### Phase 3: Renderer Wrapper

- [ ] **Create `src/lib/views/renderer.tsx`** — copy ExplorerRenderer pattern:
  ```typescript
  "use client";

  import { type ReactNode } from "react";
  import {
    Renderer,
    type ComponentRenderer,
    type Spec,
    StateProvider,
    VisibilityProvider,
    ActionProvider,
  } from "@json-render/react";
  import { registry } from "./registry";

  interface ViewRendererProps {
    spec: Spec | null;
    loading?: boolean;
  }

  const fallback: ComponentRenderer = ({ element }) => (
    <div className="p-3 border border-dashed rounded-lg text-muted-foreground text-sm">
      Unknown component: {element.type}
    </div>
  );

  export function ViewRenderer({ spec, loading }: ViewRendererProps): ReactNode {
    if (!spec) return null;

    return (
      <StateProvider initialState={spec.state ?? {}}>
        <VisibilityProvider>
          <ActionProvider>
            <Renderer
              spec={spec}
              registry={registry}
              fallback={fallback}
              loading={loading}
            />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    );
  }
  ```

### Phase 4: Client-Side Message Rendering

- [ ] **Import `useJsonRenderMessage`** in the message display component
- [ ] **Import `SPEC_DATA_PART_TYPE`** for inline positioning
- [ ] **Add segment-based rendering** — iterate `message.parts`, detect `SPEC_DATA_PART_TYPE`, render `ViewRenderer` inline
- [ ] **Pass `loading={isLast && isStreaming}`** to the renderer

### Phase 5: Cleanup

- [ ] Remove `show_view` tool definition and registration from the runner
- [ ] Remove `show-view.ts` and `show-view.test.ts`
- [ ] Remove `ViewCard` component and its test
- [ ] Remove `ShowViewInline` component
- [ ] Remove `show_view` special-casing from `tool-call-inline.tsx`
- [ ] Remove `getViewCatalogPrompt()` function

### Phase 6: Testing

- [ ] Unit test: ViewRenderer renders with spec.state
- [ ] Unit test: catalog.prompt({ mode: "inline" }) produces valid output
- [ ] Integration test: pipeJsonRender transforms spec fences into SpecDataParts
- [ ] E2E test: Ask agent to show CRM data → renders inline view

---

## Appendix: Key Imports

```typescript
// @json-render/core
import { defineCatalog, pipeJsonRender, SPEC_DATA_PART, SPEC_DATA_PART_TYPE, type SpecDataPart } from "@json-render/core";

// @json-render/react
import { Renderer, StateProvider, VisibilityProvider, ActionProvider, useJsonRenderMessage, defineRegistry, useBoundProp, type Spec, type ComponentRenderer } from "@json-render/react";

// @json-render/react/schema
import { schema } from "@json-render/react/schema";

// @json-render/shadcn
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { shadcnComponents } from "@json-render/shadcn";
```
