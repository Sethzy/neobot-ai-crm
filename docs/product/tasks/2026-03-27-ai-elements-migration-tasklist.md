# AI Elements Migration Implementation Plan (v2 — narrowed scope)

**PR:** Out-of-plan (infra improvement — AI Elements component adoption)
**Decisions:** FOUND-05 (Next.js + React + ShadCN)
**Goal:** Adopt AI Elements where it improves the stack with minimal risk: scroll container swap in chat, copy button on assistant messages, fix disableAttachments prop leak.

**Architecture:** AI Elements files in `src/components/ai-elements/` are never edited. All Sunder-specific behavior lives in `src/components/chat/` as thin wrappers. Storage-backed file uploads kept as-is. `streamdown-plugins.ts` kept (still imported by `message.tsx`). `use-scroll-to-bottom.ts` kept (used by `analyst-section.tsx`).

**Tech Stack:** AI Elements (shadcn registry for AI SDK v6), `use-stick-to-bottom`, Vitest + RTL

**Design doc:** `docs/plans/2026-03-27-ai-elements-migration-design.md`

**Reviewer findings incorporated:** See code-reviewer output from 2026-03-28. All 7 findings addressed.

---

## Scope (what changed from v1)

| Item | v1 tasklist | v2 (this) | Reason |
|---|---|---|---|
| Scroll swap | Replace hook + delete it | Replace in chat only, **keep hook** | `analyst-section.tsx` imports it |
| Composer simplification | Delete uploads, use data URLs | **Dropped** — just fix prop leak | Data URLs bloat `conversation_messages.parts` |
| Copy button | Add to assistant messages | Same | Purely additive |
| Streamdown cleanup | Delete `streamdown-plugins.ts` | **Dropped** | `message.tsx:15` still imports it |
| Upload endpoint | Delete `/api/files/upload` | **Keep** | Storage-backed uploads preserved |

---

## Relevant Files

| File | Action |
|---|---|
| `src/components/chat/message-list.tsx` | Rewrite: Conversation scroll swap |
| `src/components/chat/message-list.test.tsx` | Update: new mocks for Conversation |
| `src/components/chat/chat-composer.tsx` | Fix: remove `disableAttachments` prop |
| `src/components/chat/message-bubble.tsx` | Add: copy button on assistant messages |
| `src/components/chat/message-bubble.test.tsx` | Add: copy button tests |

---

## Task 1: Scroll swap — replace useScrollToBottom with Conversation (chat only)

**Files:**
- Modify: `src/components/chat/message-list.tsx`
- Modify: `src/components/chat/message-list.test.tsx`

**Note:** `src/hooks/use-scroll-to-bottom.ts` is NOT deleted — `src/components/analyst/analyst-section.tsx` still imports it.

### Step 1 — Update message-list.test.tsx mocks

Replace the `useScrollToBottom` mock with a mock for AI Elements `Conversation` components.

In `src/components/chat/message-list.test.tsx`, replace the `useScrollToBottom` mock block (lines 59-69):

```ts
// DELETE this block:
let isAtBottom = true;
const scrollToBottom = vi.fn();

vi.mock("@/hooks/use-scroll-to-bottom", () => ({
  useScrollToBottom: () => ({
    containerRef: { current: null },
    endRef: { current: null },
    isAtBottom,
    scrollToBottom,
  }),
}));
```

Replace with:

```ts
vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="conversation" className={className} {...props}>{children}</div>
  ),
  ConversationContent: ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="message-scroll-container" className={className} {...props}>{children}</div>
  ),
  ConversationScrollButton: () => (
    <button data-testid="scroll-to-bottom" aria-label="Scroll to bottom" type="button" />
  ),
}));
```

Remove `beforeEach(() => { isAtBottom = true; })`.

Replace the scroll button test (line 174-180):

```ts
// DELETE:
it("shows scroll button when user is not at bottom", () => {
  isAtBottom = false;
  render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);
  expect(screen.getByRole("button", { name: /scroll to bottom/i })).toBeInTheDocument();
});

// REPLACE WITH:
it("renders the scroll-to-bottom button", () => {
  render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);
  expect(screen.getByTestId("scroll-to-bottom")).toBeInTheDocument();
});
```

Run: `npx vitest run src/components/chat/message-list.test.tsx`
Expected: FAIL — `message-list.tsx` still imports `useScrollToBottom`

### Step 2 — Rewrite message-list.tsx to use Conversation

Replace the full content of `src/components/chat/message-list.tsx` with:

```tsx
/**
 * Scrollable chat message list with scroll-to-bottom button.
 * Uses AI Elements Conversation for scroll management.
 * @module components/chat/message-list
 */
"use client";

import { memo } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import type { ChatStatus } from "@/types/chat";

import { MessageBubble } from "./message-bubble";
import type { ChatUIMessage } from "./message-content";

/** Stable placeholder so the "Thinking..." shimmer renders inside the same MessageBubble DOM path as StepsSummary. */
const thinkingPlaceholder: ChatUIMessage = {
  id: "thinking-placeholder",
  role: "assistant",
  parts: [],
};

interface MessageListProps {
  messages: ChatUIMessage[];
  status: ChatStatus;
  /** Callback for tool approval actions. */
  onToolApproval?: (approvalId: string, approved: boolean) => void;
  /** Called when user selects an option from an ask_user_question tool call. Only wired to the last assistant message. */
  onQuestionSubmit?: (text: string) => void;
}

export const MessageList = memo(function MessageList({ messages, status, onToolApproval, onQuestionSubmit }: MessageListProps) {
  const isStreaming = status === "streaming";

  return (
    <Conversation className="relative flex-1 min-h-0">
      <ConversationContent className="mx-auto max-w-2xl space-y-3 px-4 py-6">
        {messages.map((message, index) => {
          const isLastMessage = index === messages.length - 1;
          const isLastAssistantMessage = isLastMessage && message.role === "assistant";

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={isStreaming && isLastAssistantMessage}
              isLast={isLastMessage}
              onToolApproval={onToolApproval}
              onQuestionSubmit={isLastAssistantMessage ? onQuestionSubmit : undefined}
            />
          );
        })}

        {status === "submitted" && (
          <MessageBubble
            message={thinkingPlaceholder}
            isStreaming
            isLast
          />
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
});
```

Run: `npx vitest run src/components/chat/message-list.test.tsx`
Expected: PASS

### Step 3 — Verify chat-panel test still passes

The `chat-panel.test.tsx` mocks `useScrollToBottom` — it shouldn't need that mock anymore since `message-list.tsx` no longer imports it. But the mock won't hurt if it's unused. Verify:

Run: `npx vitest run src/components/chat/chat-panel.test.tsx`
Expected: PASS (mock is unused but harmless)

### Step 4 — Run full chat test suite

Run: `npx vitest run src/components/chat/`
Expected: All PASS

---

## Task 2: Fix disableAttachments prop leak

**Files:**
- Modify: `src/components/chat/chat-composer.tsx`

### Step 1 — Remove disableAttachments from PromptInput call

In `src/components/chat/chat-composer.tsx`, find line 299:

```tsx
<PromptInput disableAttachments onSubmit={handleSubmit}>
```

Replace with:

```tsx
<PromptInput onSubmit={handleSubmit}>
```

That's it. The `disableAttachments` prop no longer exists in the updated AI Elements `prompt-input.tsx`. Removing it fixes the TypeScript error and the React DOM warning.

The built-in drag/drop handlers from AI Elements will now fire on the form, but since we don't render `PromptInputActionAddAttachments` or any attachment display, files dropped on the form go into AI Elements' internal state but are never submitted (our `handleSubmit` only reads from our own `attachments` state, not AI Elements'). This is harmless — dropped files are silently ignored, same as before.

### Step 2 — Verify tests pass

Run: `npx vitest run src/components/chat/chat-composer.test.tsx`
Expected: PASS

Run: `npx vitest run src/components/chat/`
Expected: All PASS

---

## Task 3: Copy button on assistant messages

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/message-bubble.test.tsx`

### Step 1 — Write failing tests for copy button

In `src/components/chat/message-bubble.test.tsx`, add these to the existing `@/components/ai-elements/message` mock (inside the `vi.mock` factory):

```ts
MessageAction: ({ children, label, onClick, ...props }: { children: React.ReactNode; label?: string; onClick?: () => void; tooltip?: string }) => (
  <button data-testid="message-action" aria-label={label} onClick={onClick} type="button" {...props}>{children}</button>
),
MessageActions: ({ children }: { children: React.ReactNode }) => (
  <div data-testid="message-actions">{children}</div>
),
MessageToolbar: ({ children }: { children: React.ReactNode }) => (
  <div data-testid="message-toolbar">{children}</div>
),
```

Add these tests at the end of the describe block:

```ts
it("renders a copy button on completed assistant messages", () => {
  const message = {
    id: "a1",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "Hello from the agent" }],
  };

  render(<MessageBubble message={message} />);

  expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
});

it("does not render a copy button on user messages", () => {
  const message = {
    id: "u1",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "Hello" }],
  };

  render(<MessageBubble message={message} />);

  expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
});

it("does not render a copy button while streaming", () => {
  const message = {
    id: "a1",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "Hello" }],
  };

  render(<MessageBubble message={message} isStreaming />);

  expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
});
```

Run: `npx vitest run src/components/chat/message-bubble.test.tsx`
Expected: FAIL — copy button not yet implemented

### Step 2 — Add copy button to message-bubble.tsx

Add imports at the top of `src/components/chat/message-bubble.tsx`:

```ts
import { CopyIcon } from "lucide-react";
import {
  MessageAction,
  MessageActions,
  MessageToolbar,
} from "@/components/ai-elements/message";
```

Inside the assistant message return block, after `</MessageContent>` and before the closing `</Message>` tag, add:

```tsx
{!isStreaming && textParts.length > 0 && (
  <MessageToolbar>
    <MessageActions>
      <MessageAction
        label="Copy"
        tooltip="Copy to clipboard"
        onClick={() => {
          const text = getMessageText(message);
          if (text) void navigator.clipboard.writeText(text);
        }}
      >
        <CopyIcon className="size-4" />
      </MessageAction>
    </MessageActions>
  </MessageToolbar>
)}
```

Run: `npx vitest run src/components/chat/message-bubble.test.tsx`
Expected: PASS

### Step 3 — Run full chat test suite

Run: `npx vitest run src/components/chat/`
Expected: All PASS

---

## Task 4: Verify + commit

### Step 1 — TypeScript check

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors from our changes

### Step 2 — Full chat test suite

Run: `npx vitest run src/components/chat/`
Expected: All PASS

### Step 3 — Commit

Stage only the files we touched:

```bash
git add \
  src/components/chat/message-list.tsx \
  src/components/chat/message-list.test.tsx \
  src/components/chat/chat-composer.tsx \
  src/components/chat/message-bubble.tsx \
  src/components/chat/message-bubble.test.tsx
```

```bash
git commit -m "$(cat <<'EOF'
feat: AI Elements adoption — Conversation scroll, copy button, fix disableAttachments

- Replace useScrollToBottom with AI Elements Conversation/ConversationContent/
  ConversationScrollButton in chat MessageList (hook kept for analyst)
- Add MessageToolbar with copy button on completed assistant messages
- Remove disableAttachments prop from PromptInput (no longer exists in AI Elements)
- Storage-backed file uploads preserved (no persistence change)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
