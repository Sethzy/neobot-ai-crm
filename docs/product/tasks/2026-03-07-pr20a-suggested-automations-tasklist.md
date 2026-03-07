# Suggested Automations — Template Prompt Cards Implementation Plan

**PR:** PR 20a: Suggested automations — template prompt cards
**Decisions:** TRIG-03
**Goal:** Solve the blank-canvas problem by showing suggested automation cards that pre-fill chat with a prompt, then let the agent handle setup conversationally.

**Architecture:** Follows Tasklet pattern exactly — a template is just a pre-filled chat message. User clicks a card → navigates to `/chat?prompt=...` → sends it → agent handles everything (asks clarifying questions, writes subagent .md to storage via `write_file`, creates trigger via `setup_trigger`). No template engine. No activation flow. Templates are a hardcoded TypeScript array.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 4, ShadCN, Vitest, React Testing Library

---

## Relevant Files

**Create:**
- `src/lib/automations/templates.ts` — template catalog array
- `src/lib/automations/__tests__/templates.test.ts` — catalog validation tests
- `src/components/automations/suggested-templates.tsx` — card grid component
- `src/components/automations/__tests__/suggested-templates.test.tsx` — card grid tests

**Modify:**
- `app/(dashboard)/automations/page.tsx` — add Suggested section below trigger table
- `app/(dashboard)/automations/page.test.tsx` — update to assert Suggested section renders
- `app/(dashboard)/chat/chat-draft-page.tsx` — read `?prompt` query param, pass to ChatPanel
- `src/components/chat/chat-composer.tsx` — accept `initialValue` prop
- `src/components/chat/chat-composer.test.tsx` — test initialValue pre-fill
- `src/components/chat/chat-panel.tsx` — accept + forward `initialPrompt` prop
- `src/components/chat/chat-panel.test.tsx` — test initialPrompt wiring
- `src/components/chat/message-list.tsx` — add suggestion chips to empty state
- `src/components/chat/message-list.test.tsx` — test suggestion chips render + click

---

## Task 1: Template Catalog Data

The static array of automation templates. Pure data, no UI.

**Files:**
- Create: `src/lib/automations/templates.ts`
- Create: `src/lib/automations/__tests__/templates.test.ts`

### Step 1: Write the failing test for the catalog shape

```typescript
// src/lib/automations/__tests__/templates.test.ts
/**
 * Tests for the automation template catalog.
 * @module lib/automations/__tests__/templates
 */
import { describe, expect, it } from "vitest";

import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "../templates";

describe("AUTOMATION_TEMPLATES", () => {
  it("exports a non-empty array of templates", () => {
    expect(Array.isArray(AUTOMATION_TEMPLATES)).toBe(true);
    expect(AUTOMATION_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });

  it("every template has required fields with non-empty strings", () => {
    for (const t of AUTOMATION_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.prompt).toBeTruthy();
      expect(t.prompt.length).toBeGreaterThan(20);
    }
  });

  it("all template IDs are unique", () => {
    const ids = AUTOMATION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every category is one of the allowed values", () => {
    const allowedCategories = ["sales", "operations", "research", "marketing"];
    for (const t of AUTOMATION_TEMPLATES) {
      expect(allowedCategories).toContain(t.category);
    }
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/automations/__tests__/templates.test.ts
```

Expected: FAIL — module `../templates` does not exist.

### Step 3: Write the template catalog

```typescript
// src/lib/automations/templates.ts
/**
 * Static catalog of suggested automation templates.
 * Each template is a pre-filled chat prompt the agent executes conversationally.
 * @module lib/automations/templates
 */

/** Shape of a suggested automation template. */
export interface AutomationTemplate {
  /** Unique identifier. */
  id: string;
  /** Short display title for the card. */
  title: string;
  /** One-line description shown below the title. */
  description: string;
  /** Grouping category for filtering/display. */
  category: "sales" | "operations" | "research" | "marketing";
  /** The full prompt text pre-filled into the chat composer. */
  prompt: string;
}

/** Pre-built automation templates for real estate agents. */
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "morning-crm-briefing",
    title: "Morning CRM briefing",
    description: "Daily summary of your pipeline, overdue tasks, and today's follow-ups.",
    category: "sales",
    prompt:
      "Set up a daily morning briefing automation. Every weekday at 8 AM, review my CRM pipeline: summarize any overdue tasks, deals that need attention, and contacts I should follow up with today. Write the briefing to this thread.",
  },
  {
    id: "listing-alert-monitor",
    title: "New listing monitor",
    description: "Watch RSS feeds for new property listings matching your criteria.",
    category: "research",
    prompt:
      "Set up an RSS monitor for new property listings. I want to track new listings from PropertyGuru and 99.co. When new listings appear, summarize the key details (price, location, size, PSF) and flag anything that matches my active buyer requirements in the CRM.",
  },
  {
    id: "follow-up-reminder-sweep",
    title: "Follow-up reminder sweep",
    description: "Check for contacts that haven't been reached in 7+ days.",
    category: "sales",
    prompt:
      "Set up a daily follow-up reminder automation. Every weekday at 9 AM, search my CRM for contacts that haven't had any interaction in the last 7 days. For each one, draft a personalized follow-up message I can review and send.",
  },
  {
    id: "weekly-pipeline-summary",
    title: "Weekly pipeline summary",
    description: "End-of-week recap of deals, wins, and what needs attention next week.",
    category: "sales",
    prompt:
      "Set up a weekly pipeline summary automation. Every Friday at 4 PM, compile a summary of my deal pipeline: new deals this week, deals that moved stages, any deals at risk, and recommended priorities for next week.",
  },
  {
    id: "post-viewing-follow-up",
    title: "Post-viewing follow-up drafter",
    description: "Draft follow-up messages after property viewings.",
    category: "sales",
    prompt:
      "Set up a daily automation that checks for any property viewings I had yesterday (look for viewing-related tasks or calendar events in the CRM). For each viewing, draft a personalized follow-up message to the client thanking them and asking about their interest level.",
  },
  {
    id: "competitor-monitoring",
    title: "Market news digest",
    description: "Weekly roundup of real estate market news and competitor activity.",
    category: "research",
    prompt:
      "Set up a weekly market intelligence automation. Every Monday morning, search for recent Singapore real estate market news, new launches, policy changes, and notable transactions. Compile a brief digest I can reference during client conversations.",
  },
  {
    id: "birthday-anniversary-reminder",
    title: "Birthday & anniversary reminders",
    description: "Never miss a client's birthday or transaction anniversary.",
    category: "operations",
    prompt:
      "Set up a daily automation that checks my CRM contacts for upcoming birthdays and transaction anniversaries in the next 7 days. For each one, draft a personalized greeting message I can send.",
  },
];
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/automations/__tests__/templates.test.ts
```

Expected: PASS — all 4 tests green.

### Step 5: Commit

```bash
git add src/lib/automations/templates.ts src/lib/automations/__tests__/templates.test.ts
git commit -m "feat(pr20a): add automation template catalog"
```

---

## Task 2: SuggestedTemplates Card Grid Component

A reusable card grid that renders templates and navigates to `/chat?prompt=...` on click.

**Files:**
- Create: `src/components/automations/suggested-templates.tsx`
- Create: `src/components/automations/__tests__/suggested-templates.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/automations/__tests__/suggested-templates.test.tsx
/**
 * Tests for SuggestedTemplates card grid.
 * @module components/automations/__tests__/suggested-templates
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SuggestedTemplates } from "../suggested-templates";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock the template catalog with a minimal set
vi.mock("@/lib/automations/templates", () => ({
  AUTOMATION_TEMPLATES: [
    {
      id: "test-briefing",
      title: "Morning briefing",
      description: "Daily CRM summary",
      category: "sales",
      prompt: "Set up a daily morning briefing automation.",
    },
    {
      id: "test-monitor",
      title: "Listing monitor",
      description: "Watch for new listings",
      category: "research",
      prompt: "Set up an RSS monitor for listings.",
    },
  ],
}));

describe("SuggestedTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a heading and template cards", () => {
    render(<SuggestedTemplates />);

    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByText("Morning briefing")).toBeInTheDocument();
    expect(screen.getByText("Listing monitor")).toBeInTheDocument();
    expect(screen.getByText("Daily CRM summary")).toBeInTheDocument();
  });

  it("navigates to /chat with encoded prompt on card click", async () => {
    const user = userEvent.setup();
    render(<SuggestedTemplates />);

    await user.click(screen.getByText("Morning briefing"));

    expect(mockPush).toHaveBeenCalledWith(
      `/chat?prompt=${encodeURIComponent("Set up a daily morning briefing automation.")}`,
    );
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/components/automations/__tests__/suggested-templates.test.tsx
```

Expected: FAIL — module `../suggested-templates` does not exist.

### Step 3: Write the component

```typescript
// src/components/automations/suggested-templates.tsx
/**
 * Card grid showing suggested automation templates.
 * Click navigates to /chat with the template prompt pre-filled.
 * @module components/automations/suggested-templates
 */
"use client";

import { useRouter } from "next/navigation";

import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";

/** Renders a grid of suggested automation template cards. */
export function SuggestedTemplates() {
  const router = useRouter();

  return (
    <div>
      <p className="mb-4 text-sm font-medium text-muted-foreground">Suggested</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUTOMATION_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              router.push(`/chat?prompt=${encodeURIComponent(template.prompt)}`);
            }}
            className="group flex flex-col items-start rounded-xl border border-border/40 bg-card p-5 text-left shadow-sm transition-colors hover:border-border hover:bg-secondary/30"
          >
            <span className="text-sm font-semibold text-foreground">{template.title}</span>
            <span className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {template.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/components/automations/__tests__/suggested-templates.test.tsx
```

Expected: PASS — both tests green.

### Step 5: Commit

```bash
git add src/components/automations/suggested-templates.tsx src/components/automations/__tests__/suggested-templates.test.tsx
git commit -m "feat(pr20a): add SuggestedTemplates card grid component"
```

---

## Task 3: Wire SuggestedTemplates into Automations Page

Add the Suggested section below the trigger table (and in empty state).

**Files:**
- Modify: `app/(dashboard)/automations/page.tsx`
- Modify: `app/(dashboard)/automations/page.test.tsx`

### Step 1: Write the failing test

Add a new test to the existing test file:

```typescript
// Add to app/(dashboard)/automations/page.test.tsx

// Add this mock at the top with the other mocks:
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Add these test cases inside the existing describe block:

  it("renders suggested templates section when no automations exist", () => {
    mockUseTriggers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseSetTriggerEnabled.mockReturnValue({
      mutate: vi.fn(),
      variables: null,
    });

    render(<AutomationsPage />);

    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByText("Morning CRM briefing")).toBeInTheDocument();
  });

  it("renders suggested templates section below triggers table when automations exist", () => {
    const mutate = vi.fn();
    mockUseTriggers.mockReturnValue({
      data: [
        {
          id: "trigger-1",
          thread_id: "thread-1",
          name: "Test trigger",
          trigger_type: "schedule",
          cron_expression: "0 8 * * *",
          payload: null,
          enabled: true,
          next_fire_at: "2026-03-08T00:00:00.000Z",
          last_fired_at: null,
          last_status: null,
          invocation_message: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseSetTriggerEnabled.mockReturnValue({
      mutate,
      variables: null,
    });

    render(<AutomationsPage />);

    expect(screen.getByText("Test trigger")).toBeInTheDocument();
    expect(screen.getByText("Suggested")).toBeInTheDocument();
  });
```

### Step 2: Run test to verify it fails

```bash
npx vitest run app/\(dashboard\)/automations/page.test.tsx
```

Expected: FAIL — "Suggested" text not found (not rendered yet).

### Step 3: Update the automations page

In `app/(dashboard)/automations/page.tsx`, add the import and render `SuggestedTemplates` below the table/empty-state section. The key change: in the empty state, replace the generic "No automations yet" with `SuggestedTemplates`. Below the table, also show `SuggestedTemplates`.

```typescript
// app/(dashboard)/automations/page.tsx
/**
 * Automations page for browsing triggers and discovering suggested automations.
 * @module app/(dashboard)/automations/page
 */
"use client";

import { AutomationsTable } from "@/components/automations/automations-table";
import { SuggestedTemplates } from "@/components/automations/suggested-templates";
import { Button } from "@/components/ui/button";
import { useSetTriggerEnabled, useTriggers } from "@/hooks/use-triggers";

export default function AutomationsPage() {
  const { data: triggers = [], isLoading, isError, refetch } = useTriggers();
  const setTriggerEnabled = useSetTriggerEnabled();
  const pendingTriggerId = setTriggerEnabled.variables?.triggerId ?? null;

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Automations</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Review scheduled jobs, inbound webhooks, and RSS monitors created from chat.
        </p>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load automations</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : triggers.length > 0 ? (
          <AutomationsTable
            triggers={triggers}
            pendingTriggerId={pendingTriggerId}
            onToggleEnabled={(triggerId, enabled) => {
              setTriggerEnabled.mutate({ triggerId, enabled });
            }}
          />
        ) : null}
      </div>

      {!isLoading && !isError ? (
        <div className="mt-10">
          <SuggestedTemplates />
        </div>
      ) : null}
    </div>
  );
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run app/\(dashboard\)/automations/page.test.tsx
```

Expected: PASS — all tests green (existing + new).

### Step 5: Commit

```bash
git add app/\(dashboard\)/automations/page.tsx app/\(dashboard\)/automations/page.test.tsx
git commit -m "feat(pr20a): wire SuggestedTemplates into automations page"
```

---

## Task 4: Chat Prompt Pre-fill — Composer + Draft Page

Wire the `?prompt=` query param so clicking a template card pre-fills the chat composer.

**Files:**
- Modify: `src/components/chat/chat-composer.tsx`
- Modify: `src/components/chat/chat-composer.test.tsx`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `src/components/chat/chat-panel.test.tsx`
- Modify: `app/(dashboard)/chat/chat-draft-page.tsx`

### Step 1: Write the failing test for ChatComposer initialValue

Add to the existing test file `src/components/chat/chat-composer.test.tsx`:

```typescript
  it("pre-fills the textarea when initialValue is provided", () => {
    render(<ChatComposer {...baseProps} initialValue="Set up a morning briefing" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toHaveValue(
      "Set up a morning briefing",
    );
  });

  it("submits the pre-filled initialValue on send", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <ChatComposer {...baseProps} onSubmit={onSubmit} initialValue="Set up a morning briefing" />,
    );

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Set up a morning briefing",
      files: [],
    });
  });
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/components/chat/chat-composer.test.tsx
```

Expected: FAIL — `initialValue` prop not recognized, textarea value is empty.

### Step 3: Add initialValue prop to ChatComposer

In `src/components/chat/chat-composer.tsx`, add `initialValue` to the props interface and use it as the initial state for `value`:

1. Add to `ChatComposerProps`:
```typescript
interface ChatComposerProps {
  status: ChatStatus;
  onSubmit: (message: ChatSubmitInput) => void;
  onStop: () => void;
  /** Optional initial value to pre-fill the textarea (e.g. from template prompt). */
  initialValue?: string;
}
```

2. Update the component signature and `useState`:
```typescript
export function ChatComposer({ status, onSubmit, onStop, initialValue = "" }: ChatComposerProps) {
  const [value, setValue] = useState(initialValue);
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/components/chat/chat-composer.test.tsx
```

Expected: PASS — all tests green.

### Step 5: Write the failing test for ChatPanel initialPrompt

Add to `src/components/chat/chat-panel.test.tsx`:

```typescript
  it("passes initialPrompt through to ChatComposer as initialValue", () => {
    render(<ChatPanel chatId="thread-1" initialPrompt="Set up a daily briefing" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toHaveValue(
      "Set up a daily briefing",
    );
  });
```

### Step 6: Run test to verify it fails

```bash
npx vitest run src/components/chat/chat-panel.test.tsx
```

Expected: FAIL — `initialPrompt` prop not recognized, textarea is empty.

### Step 7: Add initialPrompt prop to ChatPanel

In `src/components/chat/chat-panel.tsx`:

1. Add to `ChatPanelProps`:
```typescript
interface ChatPanelProps {
  chatId: string;
  initialMessages?: UIMessage[];
  autoResume?: boolean;
  /** Pre-filled prompt text for the composer (e.g. from ?prompt= query param). */
  initialPrompt?: string;
}
```

2. Update the component signature:
```typescript
export function ChatPanel({
  chatId,
  initialMessages = [],
  autoResume = false,
  initialPrompt,
}: ChatPanelProps) {
```

3. Pass it to `ChatComposer`:
```typescript
<ChatComposer status={status} onSubmit={handleSubmit} onStop={stop} initialValue={initialPrompt} />
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/components/chat/chat-panel.test.tsx
```

Expected: PASS — all tests green.

### Step 9: Wire the query param in ChatDraftPage

In `app/(dashboard)/chat/chat-draft-page.tsx`, read `?prompt=` from the URL and pass it through:

```typescript
// app/(dashboard)/chat/chat-draft-page.tsx
/**
 * Client chat draft wrapper rendered by /chat server page.
 * Reads optional ?prompt= query param to pre-fill the composer.
 * @module app/(dashboard)/chat/chat-draft-page
 */
"use client";

import { useSearchParams } from "next/navigation";

import { ChatPanel } from "@/components/chat/chat-panel";

interface ChatDraftPageProps {
  id: string;
}

export function ChatDraftPage({ id }: ChatDraftPageProps) {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") ?? undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatPanel chatId={id} initialMessages={[]} autoResume={false} initialPrompt={initialPrompt} />
    </div>
  );
}
```

> **Note:** `useSearchParams()` requires the page to be wrapped in `<Suspense>` in Next.js App Router. The `/chat` server page (`app/(dashboard)/chat/page.tsx`) already uses `force-dynamic`. If you see a hydration warning, wrap `<ChatDraftPage>` in `<Suspense>` in the server page.

### Step 10: Run all chat tests to verify nothing broke

```bash
npx vitest run src/components/chat/ app/\(dashboard\)/chat/
```

Expected: PASS — all existing + new tests green.

### Step 11: Commit

```bash
git add src/components/chat/chat-composer.tsx src/components/chat/chat-composer.test.tsx src/components/chat/chat-panel.tsx src/components/chat/chat-panel.test.tsx app/\(dashboard\)/chat/chat-draft-page.tsx
git commit -m "feat(pr20a): wire ?prompt= query param to pre-fill chat composer"
```

---

## Task 5: Suggestion Chips in Chat Empty State

Show 3-4 suggestion chips in the empty chat state using the existing `Suggestion` component.

**Files:**
- Modify: `src/components/chat/message-list.tsx`
- Modify: `src/components/chat/message-list.test.tsx`

### Step 1: Write the failing tests

Add to `src/components/chat/message-list.test.tsx`:

```typescript
// Add this mock at the top with other mocks:
const mockOnSuggestionClick = vi.fn();

vi.mock("@/lib/automations/templates", () => ({
  AUTOMATION_TEMPLATES: [
    { id: "t1", title: "Morning briefing", description: "Daily summary", category: "sales", prompt: "Set up morning briefing" },
    { id: "t2", title: "Follow-up sweep", description: "Check stale leads", category: "sales", prompt: "Set up follow-up sweep" },
    { id: "t3", title: "Pipeline summary", description: "Weekly recap", category: "sales", prompt: "Set up pipeline summary" },
    { id: "t4", title: "Listing monitor", description: "Watch feeds", category: "research", prompt: "Set up listing monitor" },
  ],
}));

// Add these tests inside the describe block:

  it("renders suggestion chips in empty state", () => {
    render(<MessageList messages={[]} status="ready" onSuggestionClick={mockOnSuggestionClick} />);

    expect(screen.getByText("Morning briefing")).toBeInTheDocument();
    expect(screen.getByText("Follow-up sweep")).toBeInTheDocument();
    expect(screen.getByText("Pipeline summary")).toBeInTheDocument();
  });

  it("calls onSuggestionClick with the template prompt when a chip is clicked", async () => {
    const user = userEvent.setup();
    render(<MessageList messages={[]} status="ready" onSuggestionClick={mockOnSuggestionClick} />);

    await user.click(screen.getByText("Morning briefing"));

    expect(mockOnSuggestionClick).toHaveBeenCalledWith("Set up morning briefing");
  });

  it("does not render suggestion chips when messages exist", () => {
    render(
      <MessageList
        messages={[userMessage]}
        status="ready"
        onSuggestionClick={mockOnSuggestionClick}
      />,
    );

    expect(screen.queryByText("Morning briefing")).not.toBeInTheDocument();
  });
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/components/chat/message-list.test.tsx
```

Expected: FAIL — `onSuggestionClick` prop not recognized, suggestion chips not rendered.

### Step 3: Add suggestion chips to MessageList

In `src/components/chat/message-list.tsx`:

1. Add imports:
```typescript
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";
```

2. Add `onSuggestionClick` to the props:
```typescript
interface MessageListProps {
  messages: ChatUIMessage[];
  status: ChatStatus;
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Called when user clicks a suggestion chip in the empty state. Receives the prompt text. */
  onSuggestionClick?: (prompt: string) => void;
}
```

3. Update the component signature:
```typescript
export function MessageList({ messages, status, onToolApproval, onSuggestionClick }: MessageListProps) {
```

4. In the empty state block (the `else` branch), add suggestion chips after the description paragraph, before the `endRef` div. Show the first 4 templates as clickable buttons:
```typescript
{onSuggestionClick ? (
  <div className="mt-4 flex flex-wrap justify-center gap-2">
    {AUTOMATION_TEMPLATES.slice(0, 4).map((template) => (
      <button
        key={template.id}
        type="button"
        onClick={() => onSuggestionClick(template.prompt)}
        className="rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-secondary/30 hover:text-foreground"
      >
        {template.title}
      </button>
    ))}
  </div>
) : null}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/components/chat/message-list.test.tsx
```

Expected: PASS — all tests green. You may need to add `import userEvent from "@testing-library/user-event"` to the test file if not already present.

### Step 5: Wire onSuggestionClick in ChatPanel

In `src/components/chat/chat-panel.tsx`, add a callback that sets the composer value when a suggestion chip is clicked. The simplest approach: use a state variable for the suggestion prompt and pass it to `ChatComposer` as `initialValue`. But since `initialValue` only sets the initial state, we need a different approach.

Instead, add a `onSuggestionClick` callback that calls `handleSubmit` directly — clicking a suggestion chip should immediately send the message (like Tasklet: click → send → agent starts working).

Update `ChatPanel`:

1. Create the callback:
```typescript
const handleSuggestionClick = useCallback(
  (prompt: string) => {
    if (isLoading) return;
    handleSubmit({ text: prompt, files: [] });
  },
  [handleSubmit, isLoading],
);
```

2. Pass it to `MessageList`:
```typescript
<MessageList
  messages={messages}
  status={status}
  onToolApproval={handleToolApproval}
  onSuggestionClick={handleSuggestionClick}
/>
```

### Step 6: Add test for ChatPanel suggestion wiring

Add to `src/components/chat/chat-panel.test.tsx`. Update the existing test that asserts suggestion chips are NOT rendered:

```typescript
  it("renders suggestion chips in empty state and sends message on click", async () => {
    const user = userEvent.setup();
    render(<ChatPanel chatId="thread-1" />);

    // Suggestion chips should be visible in empty state
    expect(screen.getByText("Morning CRM briefing")).toBeInTheDocument();

    await user.click(screen.getByText("Morning CRM briefing"));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
    });
  });
```

> **Note:** The existing test `"uses MessageList as the single empty-state source and does not render suggestion chips"` asserts that specific hardcoded chip texts do NOT exist. This test needs updating — the assertion text ("Brief me on today's tasks", etc.) doesn't match our template titles, so it should still pass. But verify and update if needed.

### Step 7: Run all tests

```bash
npx vitest run src/components/chat/message-list.test.tsx src/components/chat/chat-panel.test.tsx
```

Expected: PASS — all tests green.

### Step 8: Commit

```bash
git add src/components/chat/message-list.tsx src/components/chat/message-list.test.tsx src/components/chat/chat-panel.tsx src/components/chat/chat-panel.test.tsx
git commit -m "feat(pr20a): add suggestion chips to chat empty state"
```

---

## Task 6: Final Integration Test + Cleanup

Run the full test suite, verify the end-to-end flow manually, and do a final commit.

**Files:**
- All files from Tasks 1-5

### Step 1: Run the full test suite

```bash
npx vitest run
```

Expected: PASS — no regressions.

### Step 2: Manual smoke test

1. Open `http://localhost:3000/automations` — should see Suggested section with 7 template cards
2. Click "Morning CRM briefing" card — should navigate to `/chat?prompt=Set%20up%20a%20daily...`
3. Chat composer should be pre-filled with the prompt text
4. Send the message — agent should start responding in a new thread
5. Go to `/chat` (new draft) — should see suggestion chips in the empty state
6. Click a chip — message should send immediately

### Step 3: Final commit with PR number

```bash
git add -A
git commit -m "feat(pr20a): suggested automations — template prompt cards

- Hardcoded template catalog (7 real estate agent templates)
- SuggestedTemplates card grid on /automations page
- ?prompt= query param pre-fills chat composer
- Suggestion chips in chat empty state
- Click template → navigate to chat → agent handles setup conversationally"
```

---

## Notes

- **No migrations needed.** This is pure frontend — templates are hardcoded, triggers are created by the agent via existing `setup_trigger` tool.
- **No new API routes.** The `?prompt=` param is read client-side only.
- **Tasklet pattern:** Templates are just pre-filled chat messages. The agent does all the real work conversationally using existing tools (`setup_trigger`, `write_file`, `search_triggers`).
- **Existing components reused:** The card pattern follows `QuickActionCards` from `src/components/analyst/`. The suggestion chips follow the `Suggestion` component pattern from `src/components/ai-elements/suggestion.tsx`.
- **Adding more templates later:** Just add entries to the `AUTOMATION_TEMPLATES` array in `src/lib/automations/templates.ts` and deploy.
