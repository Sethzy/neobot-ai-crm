# PR 22b: Tool Output Rendering — JsonView + Tool Approval UI

**PR:** PR 22b: Tool output rendering — json-render + tool approval UI
**Decisions:** (none — follows vercel/chatbot reference patterns)
**Reference:** `roadmap docs/Sunder - Source of Truth/references/vercel-chatbot/generative-ui-hooks-reference.md`
**Goal:** Two improvements to tool display in chat: (1) Replace raw `JSON.stringify` in ToolCallInline and Tool components with a readable JSON viewer. (2) Wire `addToolApprovalResponse` with approve/deny buttons for tools in `approval-requested` state.

**Scope change — json-render pivot:** The original plan called for `@vercel-labs/json-render`. Research confirmed this is a **generative UI framework** (renders LLM-generated UI specs as components), NOT a JSON data viewer. It requires defining component registries and feeding it structured specs — it cannot accept `data={myObject}` and render a readable tree. The vercel/chatbot reference repo also does not use it (it uses bespoke per-tool components). **Replacement:** Build a lightweight custom `<JsonView>` component (zero dependencies, Tailwind-native, ~60 lines). This renders tool input/output as a formatted key-value tree with type-appropriate coloring. Matches project principles: boring solution, zero new deps, YAGNI.

**AI SDK approval API (verified from `ai@^6.0.111` types):**
- `addToolApprovalResponse({ id, approved, reason? })` — `ChatAddToolApproveResponseFunction`
- When `state === "approval-requested"`, the tool part has `approval: { id: string }` — this `approval.id` is passed as the `id` to `addToolApprovalResponse`
- `approved: boolean` — whether the user approved or denied
- `reason?: string` — optional reason for denial

**Tech Stack:** React 19, Tailwind 4, ShadCN UI, Vitest + React Testing Library, Vercel AI SDK v6 (`useChat`, `addToolApprovalResponse`)

---

## Relevant Files

### Create
- `src/components/ui/json-view.tsx` — Lightweight recursive JSON viewer component
- `src/components/ui/__tests__/json-view.test.tsx` — Tests for JsonView

### Modify
- `src/components/chat/tool-call-inline.tsx` — Replace `<pre>{JSON.stringify(...)}</pre>` with `<JsonView>`, add approval buttons, add denial state
- `src/components/chat/tool-call-inline.test.tsx` — Update tests for JsonView rendering + approval buttons + denial state
- `src/components/ai-elements/tool.tsx` — Replace `CodeBlock` JSON rendering in ToolInput/ToolOutput with `<JsonView>`
- `src/components/ai-elements/__tests__/tool.test.tsx` — Create tests for ToolInput and ToolOutput
- `src/components/chat/chat-panel.tsx` — Destructure `addToolApprovalResponse` from `useChat`, create handler, pass to MessageList
- `src/components/chat/chat-panel.test.tsx` — Test approval handler is created and passed
- `src/components/chat/message-list.tsx` — Accept + forward `onToolApproval` to MessageBubble
- `src/components/chat/message-list.test.tsx` — Update mock + add forwarding test
- `src/components/chat/message-bubble.tsx` — Accept + forward `onToolApproval` to StepsSummary
- `src/components/chat/message-bubble.test.tsx` — Update mock + add forwarding test
- `src/components/chat/steps-summary.tsx` — Accept + forward `onToolApproval` to ToolCallInline, pass `toolCallId` and `approval`
- `src/components/chat/steps-summary.test.tsx` — Update mock + add forwarding test

### Reference (do not modify)
- `roadmap docs/Sunder - Source of Truth/references/vercel-chatbot/generative-ui-hooks-reference.md` — Generative UI patterns
- `src/components/ai-elements/code-block.tsx` — Existing code viewer (heavy Shiki — stays for actual code blocks, not data)

---

## Task 1: Create JsonView Component

**Files:**
- Create: `src/components/ui/__tests__/json-view.test.tsx`
- Create: `src/components/ui/json-view.tsx`

**Context:** A lightweight recursive JSON viewer that replaces `JSON.stringify(data, null, 2)` in `<pre>` blocks. Renders objects as key-value pairs, arrays as indexed items, and primitives with type-appropriate coloring (green for strings, blue for numbers, amber for booleans, muted for null). Zero dependencies. Tailwind-native.

**Step 1: Write failing tests for JsonView**

Create `src/components/ui/__tests__/json-view.test.tsx`:

```typescript
/**
 * Tests for the lightweight JSON viewer component.
 * @module components/ui/__tests__/json-view.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JsonView } from "../json-view";

describe("JsonView", () => {
  it("renders string primitives with quotes", () => {
    render(<JsonView data="hello" />);
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it("renders number primitives", () => {
    render(<JsonView data={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders boolean primitives", () => {
    render(<JsonView data={true} />);
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("renders null", () => {
    render(<JsonView data={null} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("renders object keys and values", () => {
    render(<JsonView data={{ name: "John", age: 30 }} />);
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText('"John"')).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders array items", () => {
    render(<JsonView data={["a", "b", "c"]} />);
    expect(screen.getByText('"a"')).toBeInTheDocument();
    expect(screen.getByText('"b"')).toBeInTheDocument();
    expect(screen.getByText('"c"')).toBeInTheDocument();
  });

  it("renders nested objects", () => {
    render(<JsonView data={{ contact: { name: "John" } }} />);
    expect(screen.getByText("contact")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText('"John"')).toBeInTheDocument();
  });

  it("renders empty object as {}", () => {
    render(<JsonView data={{}} />);
    expect(screen.getByTestId("json-view")).toHaveTextContent("{}");
  });

  it("renders empty array as []", () => {
    render(<JsonView data={[]} />);
    expect(screen.getByTestId("json-view")).toHaveTextContent("[]");
  });

  it("handles undefined data gracefully", () => {
    render(<JsonView data={undefined} />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });

  it("applies type-specific colors to values", () => {
    render(<JsonView data={{ name: "John", count: 5, active: true, note: null }} />);
    const stringValue = screen.getByText('"John"');
    expect(stringValue.className).toMatch(/text-green/);
    const numberValue = screen.getByText("5");
    expect(numberValue.className).toMatch(/text-blue/);
    const boolValue = screen.getByText("true");
    expect(boolValue.className).toMatch(/text-amber/);
  });
});
```

Run:

```bash
npx vitest run src/components/ui/__tests__/json-view.test.tsx
```

Verify: Tests fail because `../json-view` doesn't exist yet.

**Step 2: Implement JsonView**

Create `src/components/ui/json-view.tsx`:

```typescript
/**
 * Lightweight recursive JSON viewer with type-appropriate coloring.
 * Replaces raw JSON.stringify in tool output displays.
 * @module components/ui/json-view
 */
"use client";

import { cn } from "@/lib/utils";

interface JsonViewProps {
  /** The data to render. Accepts any JSON-serializable value. */
  data: unknown;
  className?: string;
}

/**
 * Renders arbitrary JSON data as a formatted key-value tree.
 * Strings are green, numbers blue, booleans amber, null muted.
 * Objects and arrays are rendered as indented blocks.
 */
export function JsonView({ data, className }: JsonViewProps) {
  return (
    <div data-testid="json-view" className={cn("font-mono text-xs", className)}>
      <JsonNode value={data} />
    </div>
  );
}

function JsonNode({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-muted-foreground/60">null</span>;
  }

  if (value === undefined) {
    return <span className="text-muted-foreground/60">undefined</span>;
  }

  if (typeof value === "string") {
    return <span className="text-green-600 dark:text-green-400">&quot;{value}&quot;</span>;
  }

  if (typeof value === "number") {
    return <span className="text-blue-600 dark:text-blue-400">{String(value)}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{"[]"}</span>;
    return (
      <div className="pl-3">
        {value.map((item, index) => (
          <div key={index} className="flex gap-1">
            <span className="shrink-0 select-none text-muted-foreground">{index}:</span>
            <JsonNode value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span>{"{}"}</span>;
    return (
      <div className="pl-3">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-1">
            <span className="shrink-0 text-muted-foreground">{key}:</span>
            <JsonNode value={val} />
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}
```

Run:

```bash
npx vitest run src/components/ui/__tests__/json-view.test.tsx
```

Verify: All tests pass.

---

## Task 2: Replace JSON.stringify in ToolCallInline with JsonView

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx`
- Modify: `src/components/chat/tool-call-inline.test.tsx`

**Context:** ToolCallInline currently uses `<pre>{JSON.stringify(input, null, 2)}</pre>` for arguments and `<pre>{JSON.stringify(output, null, 2)}</pre>` for results. Replace both with `<JsonView data={...} />` for a more readable display with type coloring. No more `<pre>` blocks.

**Step 1: Write failing tests**

Add to `src/components/chat/tool-call-inline.test.tsx`:

```typescript
it("renders tool arguments with JsonView instead of raw JSON", async () => {
  const user = userEvent.setup();
  render(<ToolCallInline {...defaultProps} />);
  await user.click(screen.getByTestId("tool-expand-trigger"));

  // Should use JsonView component, not <pre>
  expect(screen.getByTestId("tool-arguments").querySelector("[data-testid='json-view']")).toBeInTheDocument();
  expect(screen.getByTestId("tool-arguments").querySelector("pre")).not.toBeInTheDocument();
});

it("renders tool result with JsonView instead of raw JSON", async () => {
  const user = userEvent.setup();
  render(<ToolCallInline {...defaultProps} />);
  await user.click(screen.getByTestId("tool-expand-trigger"));

  expect(screen.getByTestId("tool-result").querySelector("[data-testid='json-view']")).toBeInTheDocument();
  expect(screen.getByTestId("tool-result").querySelector("pre")).not.toBeInTheDocument();
});
```

Run:

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Verify: New tests fail (still using `<pre>`).

**Step 2: Update ToolCallInline to use JsonView**

In `src/components/chat/tool-call-inline.tsx`:

1. Add import at top:
   ```typescript
   import { JsonView } from "@/components/ui/json-view";
   ```

2. Replace the arguments `<pre>` block (lines 49-54):
   ```typescript
   // Before:
   <pre
     data-testid="tool-arguments"
     className="rounded bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground overflow-x-auto"
   >
     {JSON.stringify(input, null, 2)}
   </pre>

   // After:
   <div
     data-testid="tool-arguments"
     className="rounded bg-muted/30 px-2 py-1.5 overflow-x-auto"
   >
     <JsonView data={input} />
   </div>
   ```

3. Replace the result `<pre>` block (lines 66-72):
   ```typescript
   // Before:
   <pre
     data-testid="tool-result"
     className="rounded bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground overflow-x-auto"
   >
     {JSON.stringify(output, null, 2)}
   </pre>

   // After:
   <div
     data-testid="tool-result"
     className="rounded bg-muted/30 px-2 py-1.5 overflow-x-auto"
   >
     <JsonView data={output} />
   </div>
   ```

4. Update existing tests that relied on `JSON.stringify` text content. In the test file:
   - `"shows formatted input arguments when expanded"` — now checks for `"John"` via JsonView's quoted rendering instead of raw JSON text
   - `"shows formatted output when expanded"` — now checks for `"John Doe"` via JsonView

   Replace the assertions:
   ```typescript
   // Before:
   expect(screen.getByTestId("tool-arguments")).toHaveTextContent('"query": "John"');
   // After:
   expect(screen.getByTestId("tool-arguments")).toHaveTextContent('query:');
   expect(screen.getByTestId("tool-arguments")).toHaveTextContent('"John"');
   ```

   ```typescript
   // Before:
   expect(screen.getByTestId("tool-result")).toHaveTextContent("John Doe");
   // After (unchanged — still contains "John Doe"):
   expect(screen.getByTestId("tool-result")).toHaveTextContent('"John Doe"');
   ```

Run:

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Verify: All tests pass.

---

## Task 3: Replace JSON.stringify in Tool Component (ToolInput/ToolOutput) with JsonView

**Files:**
- Modify: `src/components/ai-elements/tool.tsx`
- Create: `src/components/ai-elements/__tests__/tool.test.tsx`

**Context:** The `ToolInput` component uses `<CodeBlock code={JSON.stringify(input, null, 2)} language="json" />` and `ToolOutput` conditionally wraps output in `<CodeBlock>`. Replace both with `<JsonView>` for consistent rendering across all tool displays. `CodeBlock` (with full Shiki syntax highlighting pipeline) is overkill for structured data — it should be reserved for actual source code blocks.

**Step 1: Write failing tests**

Create `src/components/ai-elements/__tests__/tool.test.tsx`:

```typescript
/**
 * Tests for Tool UI components — ToolInput and ToolOutput rendering.
 * @module components/ai-elements/__tests__/tool.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolInput, ToolOutput } from "../tool";

describe("ToolInput", () => {
  it("renders input data with JsonView", () => {
    render(<ToolInput input={{ query: "test" }} />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
    expect(screen.getByText("query")).toBeInTheDocument();
  });

  it("does not use CodeBlock for JSON data", () => {
    const { container } = render(<ToolInput input={{ key: "value" }} />);
    // CodeBlock wraps in a container with data-language attribute
    expect(container.querySelector("[data-language]")).not.toBeInTheDocument();
  });
});

describe("ToolOutput", () => {
  it("renders object output with JsonView", () => {
    render(<ToolOutput output={{ success: true }} errorText="" />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });

  it("renders string output with JsonView", () => {
    render(<ToolOutput output="plain text result" errorText="" />);
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
    expect(screen.getByText('"plain text result"')).toBeInTheDocument();
  });

  it("renders error text when present", () => {
    render(<ToolOutput output={undefined} errorText="Connection failed" />);
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("returns null when no output and no error", () => {
    const { container } = render(<ToolOutput output={undefined} errorText="" />);
    expect(container.firstChild).toBeNull();
  });
});
```

Run:

```bash
npx vitest run src/components/ai-elements/__tests__/tool.test.tsx
```

Verify: Tests fail (ToolInput still uses CodeBlock, no JsonView test ID).

**Step 2: Update ToolInput and ToolOutput**

In `src/components/ai-elements/tool.tsx`:

1. Add import:
   ```typescript
   import { JsonView } from "@/components/ui/json-view";
   ```

2. Remove the CodeBlock import (line 23) — no longer needed in this file:
   ```typescript
   // Remove: import { CodeBlock } from "./code-block";
   ```

3. Remove the `isValidElement` import if no longer needed (check usage).

4. Update `ToolInput` component (lines 120-129):
   ```typescript
   // Before:
   export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
     <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
       <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
         Parameters
       </h4>
       <div className="rounded-md bg-muted/50">
         <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
       </div>
     </div>
   );

   // After:
   export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
     <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
       <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
         Parameters
       </h4>
       <div className="rounded-md bg-muted/50 px-3 py-2">
         <JsonView data={input} />
       </div>
     </div>
   );
   ```

5. Update `ToolOutput` component (lines 136-174). Simplify the output rendering:
   ```typescript
   // Before: complex conditional with CodeBlock, isValidElement, ReactNode cast
   // After:
   export const ToolOutput = ({
     className,
     output,
     errorText,
     ...props
   }: ToolOutputProps) => {
     if (!(output || errorText)) {
       return null;
     }

     return (
       <div className={cn("space-y-2", className)} {...props}>
         <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
           {errorText ? "Error" : "Result"}
         </h4>
         <div
           className={cn(
             "overflow-x-auto rounded-md text-xs",
             errorText
               ? "bg-destructive/10 text-destructive"
               : "bg-muted/50 text-foreground"
           )}
         >
           {errorText ? (
             <div className="px-3 py-2">{errorText}</div>
           ) : (
             <div className="px-3 py-2">
               <JsonView data={output} />
             </div>
           )}
         </div>
       </div>
     );
   };
   ```

Run:

```bash
npx vitest run src/components/ai-elements/__tests__/tool.test.tsx
```

Verify: All tests pass.

---

## Task 4: Wire addToolApprovalResponse Through Component Chain

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx` — Add `toolCallId`, `approvalId`, `onToolApproval` props
- Modify: `src/components/chat/tool-call-inline.test.tsx` — Test new props
- Modify: `src/components/chat/steps-summary.tsx` — Accept + forward `onToolApproval`, pass `toolCallId` and `approvalId`
- Modify: `src/components/chat/steps-summary.test.tsx` — Update mock + add forwarding test
- Modify: `src/components/chat/message-bubble.tsx` — Accept + forward `onToolApproval`
- Modify: `src/components/chat/message-bubble.test.tsx` — Update mock + add forwarding test
- Modify: `src/components/chat/message-list.tsx` — Accept + forward `onToolApproval`
- Modify: `src/components/chat/message-list.test.tsx` — Update mock + add forwarding test
- Modify: `src/components/chat/chat-panel.tsx` — Destructure `addToolApprovalResponse`, create handler, pass to MessageList
- Modify: `src/components/chat/chat-panel.test.tsx` — Test handler creation

**Context:** Thread `addToolApprovalResponse` from `useChat()` down to `ToolCallInline` through the component chain: ChatPanel → MessageList → MessageBubble → StepsSummary → ToolCallInline. We define a callback type `OnToolApproval` and pass it through each layer. The AI SDK function signature is `addToolApprovalResponse({ id: approvalId, approved: boolean, reason?: string })`.

The approval ID comes from the tool part's `approval.id` field when `state === "approval-requested"`. We extract it in StepsSummary (which already casts tool parts) and pass it to ToolCallInline.

**Callback type (used everywhere):**
```typescript
type OnToolApproval = (approvalId: string, approved: boolean) => void;
```

**Step 1: Write failing test for ToolCallInline accepting new props**

Add to `src/components/chat/tool-call-inline.test.tsx`:

```typescript
it("accepts onToolApproval and approvalId props without error", () => {
  const onToolApproval = vi.fn();
  render(
    <ToolCallInline
      {...defaultProps}
      toolCallId="tc-1"
      approvalId="approval-1"
      onToolApproval={onToolApproval}
    />,
  );
  expect(screen.getByTestId("tool-call-inline")).toBeInTheDocument();
});
```

Run:

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Verify: Test fails (ToolCallInline doesn't accept `toolCallId`, `approvalId`, or `onToolApproval` props yet — TypeScript error).

**Step 2: Add new props to ToolCallInline interface**

In `src/components/chat/tool-call-inline.tsx`, update the interface:

```typescript
interface ToolCallInlineProps {
  name: string;
  state: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
  /** The tool call ID from the AI SDK part. */
  toolCallId?: string;
  /** The approval ID from `part.approval.id` when state is approval-requested. */
  approvalId?: string;
  /** Callback for approve/deny actions. Receives (approvalId, approved). */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
}

export function ToolCallInline({ name, state, input, output, errorText, toolCallId, approvalId, onToolApproval }: ToolCallInlineProps) {
  // ... existing code unchanged
}
```

Run test → verify pass.

**Step 3: Write failing test for StepsSummary forwarding**

Update the ToolCallInline mock in `src/components/chat/steps-summary.test.tsx` to capture the new props:

```typescript
vi.mock("./tool-call-inline", () => ({
  ToolCallInline: ({ name, state, toolCallId, approvalId, onToolApproval }: {
    name: string;
    state: string;
    toolCallId?: string;
    approvalId?: string;
    onToolApproval?: unknown;
  }) => (
    <div
      data-testid="tool-call-inline"
      data-name={name}
      data-state={state}
      data-tool-call-id={toolCallId}
      data-approval-id={approvalId}
      data-has-approval={!!onToolApproval}
    >
      {name}
    </div>
  ),
}));
```

Add test:

```typescript
it("forwards onToolApproval and approval metadata to ToolCallInline", async () => {
  const user = userEvent.setup();
  const onToolApproval = vi.fn();
  const approvalParts = [
    {
      type: "tool-write_file" as const,
      toolCallId: "tc-1",
      state: "approval-requested" as const,
      input: { path: "/memory.md" },
      approval: { id: "approval-abc" },
    },
  ];
  render(
    <StepsSummary
      parts={approvalParts}
      isStreaming={false}
      hasTextParts={false}
      messageId="1"
      onToolApproval={onToolApproval}
    />,
  );

  await user.click(screen.getByTestId("steps-summary-trigger"));

  const toolCall = screen.getByTestId("tool-call-inline");
  expect(toolCall).toHaveAttribute("data-has-approval", "true");
  expect(toolCall).toHaveAttribute("data-tool-call-id", "tc-1");
  expect(toolCall).toHaveAttribute("data-approval-id", "approval-abc");
});
```

Run:

```bash
npx vitest run src/components/chat/steps-summary.test.tsx
```

Verify: Test fails (StepsSummary doesn't accept/forward `onToolApproval` or extract `approval.id`).

**Step 4: Update StepsSummary**

In `src/components/chat/steps-summary.tsx`:

1. Update interface:
   ```typescript
   interface StepsSummaryProps {
     parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
     isStreaming: boolean;
     hasTextParts: boolean;
     messageId: string;
     /** Callback for tool approval actions. */
     onToolApproval?: (approvalId: string, approved: boolean) => void;
   }
   ```

2. Accept prop in function signature:
   ```typescript
   export function StepsSummary({ parts, isStreaming, hasTextParts, messageId, onToolApproval }: StepsSummaryProps) {
   ```

3. Update the tool part cast and ToolCallInline call (lines 93-105):
   ```typescript
   if (part.type.startsWith("tool-")) {
     const toolPart = part as {
       type: string;
       toolCallId: string;
       state: string;
       input: unknown;
       output?: unknown;
       errorText?: string;
       approval?: { id: string };
     };
     const toolName = toolPart.type.replace(/^tool-/, "");
     return (
       <ToolCallInline
         key={key}
         name={toolName}
         state={toolPart.state}
         input={toolPart.input}
         output={toolPart.output}
         errorText={toolPart.errorText}
         toolCallId={toolPart.toolCallId}
         approvalId={toolPart.approval?.id}
         onToolApproval={onToolApproval}
       />
     );
   }
   ```

Run tests → verify pass.

**Step 5: Write failing test for MessageBubble forwarding**

Update the StepsSummary mock in `src/components/chat/message-bubble.test.tsx`:

```typescript
vi.mock("./steps-summary", () => ({
  StepsSummary: ({ parts, isStreaming, hasTextParts, messageId, onToolApproval }: {
    parts: Array<{ type: string }>;
    isStreaming: boolean;
    hasTextParts: boolean;
    messageId: string;
    onToolApproval?: unknown;
  }) => (
    <div
      data-testid="steps-summary"
      data-parts-count={parts.length}
      data-streaming={isStreaming}
      data-has-text-parts={hasTextParts}
      data-message-id={messageId}
      data-has-approval={!!onToolApproval}
    />
  ),
}));
```

Add test:

```typescript
it("forwards onToolApproval to StepsSummary", () => {
  const onToolApproval = vi.fn();
  render(
    <MessageBubble
      message={{
        id: "3",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "..." },
          { type: "text", text: "Answer." },
        ],
      }}
      onToolApproval={onToolApproval}
    />,
  );

  expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-has-approval", "true");
});
```

Run:

```bash
npx vitest run src/components/chat/message-bubble.test.tsx
```

Verify: Test fails.

**Step 6: Update MessageBubble**

In `src/components/chat/message-bubble.tsx`:

1. Update interface:
   ```typescript
   interface MessageBubbleProps {
     message: ChatUIMessage;
     isStreaming?: boolean;
     /** Callback for tool approval actions. */
     onToolApproval?: (approvalId: string, approved: boolean) => void;
   }
   ```

2. Accept prop:
   ```typescript
   export function MessageBubble({ message, isStreaming = false, onToolApproval }: MessageBubbleProps) {
   ```

3. Forward to StepsSummary:
   ```typescript
   <StepsSummary
     parts={intermediateParts}
     isStreaming={isStreaming}
     hasTextParts={textParts.length > 0}
     messageId={message.id}
     onToolApproval={onToolApproval}
   />
   ```

Run tests → verify pass.

**Step 7: Write failing test for MessageList forwarding**

Update the MessageBubble mock in `src/components/chat/message-list.test.tsx`:

```typescript
// Replace the existing message-bubble mock with:
vi.mock("./message-bubble", () => ({
  MessageBubble: ({ message, isStreaming, onToolApproval }: {
    message: { id: string; role: string; parts: Array<{ type: string; text?: string }> };
    isStreaming?: boolean;
    onToolApproval?: unknown;
  }) => (
    <div data-testid={`bubble-${message.id}`} data-streaming={isStreaming} data-has-approval={!!onToolApproval}>
      {message.parts.map((p, i) => p.type === "text" ? <span key={i}>{p.text}</span> : null)}
    </div>
  ),
}));
```

**Note:** Also remove or update the existing separate `vi.mock("./steps-summary")` and `vi.mock("./tool-call-inline")` in message-list.test.tsx since MessageBubble is now fully mocked and those nested mocks are unnecessary.

Add test:

```typescript
it("forwards onToolApproval to MessageBubble", () => {
  const onToolApproval = vi.fn();
  render(
    <MessageList
      messages={[userMessage]}
      status="ready"
      onToolApproval={onToolApproval}
    />,
  );

  expect(screen.getByTestId("bubble-1")).toHaveAttribute("data-has-approval", "true");
});
```

Run:

```bash
npx vitest run src/components/chat/message-list.test.tsx
```

Verify: Test fails.

**Step 8: Update MessageList**

In `src/components/chat/message-list.tsx`:

1. Update interface:
   ```typescript
   interface MessageListProps {
     messages: ChatUIMessage[];
     status: ChatStatus;
     /** Callback for tool approval actions. */
     onToolApproval?: (approvalId: string, approved: boolean) => void;
   }
   ```

2. Accept prop:
   ```typescript
   export function MessageList({ messages, status, onToolApproval }: MessageListProps) {
   ```

3. Forward to MessageBubble:
   ```typescript
   <MessageBubble
     key={message.id}
     message={message}
     isStreaming={isStreaming && isLastAssistantMessage}
     onToolApproval={onToolApproval}
   />
   ```

Run tests → verify pass.

**Step 9: Write failing test for ChatPanel wiring**

Add to `src/components/chat/chat-panel.test.tsx`:

```typescript
it("destructures addToolApprovalResponse from useChat and passes handler to MessageList", () => {
  const mockApprovalResponse = vi.fn();
  mockUseChat.mockReturnValue({
    id: "thread-1",
    messages: [
      {
        id: "a1",
        role: "assistant",
        parts: [{
          type: "tool-write_file" as const,
          toolCallId: "tc-1",
          state: "approval-requested",
          input: { path: "/memory.md" },
          approval: { id: "approval-123" },
        }],
      },
    ],
    status: "ready",
    error: undefined,
    sendMessage,
    setMessages,
    regenerate: vi.fn(),
    clearError: vi.fn(),
    stop: vi.fn(),
    resumeStream: vi.fn(),
    addToolResult: vi.fn(),
    addToolOutput: vi.fn(),
    addToolApprovalResponse: mockApprovalResponse,
  });

  render(<ChatPanel chatId="thread-1" />);

  // Verify the component renders without error when approval-requested tools exist
  expect(screen.getByTestId("message-scroll-container")).toBeInTheDocument();
});
```

Run:

```bash
npx vitest run src/components/chat/chat-panel.test.tsx
```

Verify: Test should pass (ChatPanel already works — this is a smoke test). The actual functional test is in Task 5.

**Step 10: Update ChatPanel to destructure and pass approval handler**

In `src/components/chat/chat-panel.tsx`:

1. Destructure `addToolApprovalResponse`:
   ```typescript
   const { messages, sendMessage, status, error, resumeStream, setMessages, addToolApprovalResponse } = useChat({
     // ... existing config
   });
   ```

2. Create a stable handler with `useCallback`:
   ```typescript
   const handleToolApproval = useCallback(
     (approvalId: string, approved: boolean) => {
       addToolApprovalResponse({ id: approvalId, approved });
     },
     [addToolApprovalResponse],
   );
   ```

3. Pass to MessageList:
   ```typescript
   <MessageList messages={messages} status={status} onToolApproval={handleToolApproval} />
   ```

Run all chat tests:

```bash
npx vitest run src/components/chat/
```

Verify: All tests pass.

---

## Task 5: Add Approve/Deny Buttons for approval-requested State

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx` — Add approve/deny buttons
- Modify: `src/components/chat/tool-call-inline.test.tsx` — Test button rendering and callbacks

**Context:** When a tool part has `state === "approval-requested"`, show inline approve/deny buttons below the tool name. This follows the vercel/chatbot pattern (reference doc section 4.1). The buttons are always visible (not hidden behind the expand toggle) since approval is a time-sensitive action. The tool's dot pulses amber to indicate pending approval.

**Step 1: Write failing tests for approval buttons**

Add to `src/components/chat/tool-call-inline.test.tsx`:

```typescript
describe("approval-requested state", () => {
  const approvalProps = {
    name: "write_file",
    state: "approval-requested" as const,
    input: { path: "/memory.md", content: "Updated notes" },
    toolCallId: "tc-approve-1",
    approvalId: "approval-abc",
    onToolApproval: vi.fn(),
  };

  it("shows approve and deny buttons when state is approval-requested", () => {
    render(<ToolCallInline {...approvalProps} />);

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });

  it("calls onToolApproval with (approvalId, true) when approve clicked", async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    render(<ToolCallInline {...approvalProps} onToolApproval={onToolApproval} />);

    await user.click(screen.getByRole("button", { name: /approve/i }));

    expect(onToolApproval).toHaveBeenCalledWith("approval-abc", true);
  });

  it("calls onToolApproval with (approvalId, false) when deny clicked", async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    render(<ToolCallInline {...approvalProps} onToolApproval={onToolApproval} />);

    await user.click(screen.getByRole("button", { name: /deny/i }));

    expect(onToolApproval).toHaveBeenCalledWith("approval-abc", false);
  });

  it("does not show approve/deny buttons for other states", () => {
    render(<ToolCallInline name="search" state="output-available" input={{}} output={{}} />);

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });

  it("does not show buttons when onToolApproval is not provided", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="approval-requested"
        input={{}}
        toolCallId="tc-1"
        approvalId="approval-1"
      />,
    );

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows amber pulsing dot when awaiting approval", () => {
    render(<ToolCallInline {...approvalProps} />);

    const dot = screen.getByTestId("tool-dot");
    expect(dot.className).toMatch(/animate-pulse/);
    expect(dot.className).toMatch(/bg-amber/);
  });
});
```

Run:

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Verify: Tests fail (no approve/deny buttons rendered).

**Step 2: Implement approval buttons in ToolCallInline**

In `src/components/chat/tool-call-inline.tsx`, update the component:

```typescript
export function ToolCallInline({ name, state, input, output, errorText, toolCallId, approvalId, onToolApproval }: ToolCallInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = state === "input-available" || state === "input-streaming";
  const isAwaitingApproval = state === "approval-requested";
  const hasError = state === "output-error";

  return (
    <div data-testid="tool-call-inline">
      <button
        type="button"
        data-testid="tool-expand-trigger"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          data-testid="tool-dot"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50",
            isRunning && "animate-pulse bg-foreground/50",
            isAwaitingApproval && "animate-pulse bg-amber-500",
          )}
        />
        <span>{name}</span>
        <span data-testid="tool-chevron" className="text-[10px] text-muted-foreground/40">›</span>
      </button>

      {/* Approval buttons — always visible (not behind expand) since approval is time-sensitive */}
      {isAwaitingApproval && onToolApproval && approvalId && (
        <div data-testid="tool-approval-actions" className="ml-3 mt-1 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
            aria-label="Approve"
            onClick={() => onToolApproval(approvalId, true)}
          >
            Approve
          </button>
          <button
            type="button"
            className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
            aria-label="Deny"
            onClick={() => onToolApproval(approvalId, false)}
          >
            Deny
          </button>
        </div>
      )}

      {isOpen && (
        <div data-testid="tool-details" className="ml-3 mt-0.5 space-y-1.5">
          {/* ... existing args/result sections unchanged ... */}
        </div>
      )}
    </div>
  );
}
```

Run:

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Verify: All tests pass.

---

## Task 6: Show Denial State in ToolCallInline

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx` — Add denial state visual indicator
- Modify: `src/components/chat/tool-call-inline.test.tsx` — Test denial state

**Context:** When `state === "output-denied"`, show the tool with a visual denial indicator: orange dot (non-pulsing), "Denied" label after the tool name, and no result section when expanded (since the tool was never executed). Follows the vercel/chatbot pattern where denied tools display as distinct from completed or errored tools (reference doc section 3.2, `statusLabels["output-denied"] = "Denied"` in our `ai-elements/tool.tsx`).

**Step 1: Write failing tests for denial state**

Add to `src/components/chat/tool-call-inline.test.tsx`:

```typescript
describe("output-denied state", () => {
  it("shows an orange denial indicator dot (not pulsing)", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    const dot = screen.getByTestId("tool-dot");
    expect(dot.className).toMatch(/bg-orange/);
    expect(dot.className).not.toMatch(/animate-pulse/);
  });

  it("shows 'Denied' label after tool name", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    expect(screen.getByText(/denied/i)).toBeInTheDocument();
  });

  it("does not show result section when denied and expanded", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.queryByText("Result")).not.toBeInTheDocument();
  });

  it("does not show approval buttons when denied", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });
});
```

Run:

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Verify: Tests fail (no denial state handling — orange dot missing, no "Denied" label).

**Step 2: Implement denial state in ToolCallInline**

In `src/components/chat/tool-call-inline.tsx`:

1. Add denial detection:
   ```typescript
   const isDenied = state === "output-denied";
   ```

2. Update dot styling to include denial state:
   ```typescript
   <span
     data-testid="tool-dot"
     className={cn(
       "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50",
       isRunning && "animate-pulse bg-foreground/50",
       isAwaitingApproval && "animate-pulse bg-amber-500",
       isDenied && "bg-orange-500",
     )}
   />
   ```

3. Add "Denied" label after tool name:
   ```typescript
   <span>{name}</span>
   {isDenied && (
     <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
       Denied
     </span>
   )}
   <span data-testid="tool-chevron" className="text-[10px] text-muted-foreground/40">›</span>
   ```

4. In the expanded view, don't show result for denied tools. Update the result section condition:
   ```typescript
   {/* In the existing expanded section: */}
   {hasError && errorText ? (
     <div>
       <p className="text-xs font-medium text-destructive/70 mb-0.5">Error</p>
       <pre className="rounded bg-destructive/5 px-2 py-1.5 text-xs text-destructive overflow-x-auto">
         {errorText}
       </pre>
     </div>
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

Run:

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Verify: All tests pass.

**Step 3: Run full test suite**

```bash
npx vitest run src/components/chat/ src/components/ai-elements/__tests__/ src/components/ui/__tests__/
```

Verify: All tests pass across all modified files.

---

## Final Checklist

- [x] `JsonView` component renders all JSON types with type-appropriate coloring
- [x] `ToolCallInline` uses `JsonView` instead of `JSON.stringify` in `<pre>` blocks
- [x] `ToolInput`/`ToolOutput` in `ai-elements/tool.tsx` use `JsonView` instead of `CodeBlock` for JSON
- [x] `addToolApprovalResponse` destructured from `useChat()` in `ChatPanel`
- [x] Approval handler threaded through: ChatPanel → MessageList → MessageBubble → StepsSummary → ToolCallInline
- [x] Approve/Deny buttons shown when `state === "approval-requested"` with correct `approvalId` routing
- [x] Denied state shows orange dot + "Denied" label + no result section
- [x] All existing tests still pass (no regressions)
- [x] No new dependencies added (zero-dep JsonView component)
