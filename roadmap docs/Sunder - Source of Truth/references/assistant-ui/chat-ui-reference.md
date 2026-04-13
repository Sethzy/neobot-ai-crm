# assistant-ui Chat UI Reference

> **Source:** [`assistant-ui/assistant-ui`](https://github.com/assistant-ui/assistant-ui) — the leading open-source chat UI component library for React.
> **Commit:** `main` branch, fetched 2026-04-13.
> **Purpose:** Reference for cleaning up Sunder's chat UI to match a clean, stable, ChatGPT-like interface.

---

## 1. Architecture Overview

assistant-ui uses a **primitives + composition** pattern (similar to Radix UI / ShadCN):

```
AssistantRuntimeProvider          ← runtime context (wraps app)
  └─ Thread                       ← full chat container
       ├─ ThreadWelcome           ← empty-state screen
       ├─ ThreadMessages          ← scrollable message list
       │    ├─ UserMessage        ← right-aligned user bubble
       │    ├─ AssistantMessage   ← left-aligned assistant response
       │    └─ EditComposer       ← inline message editing
       ├─ ThreadScrollToBottom    ← floating scroll button
       └─ Composer                ← input area with attachments
```

Every visible element is a **thin wrapper** around an unstyled primitive (`ThreadPrimitive.Root`, `MessagePrimitive.Parts`, `ComposerPrimitive.Input`, etc.) from `@assistant-ui/react`. Styling is pure Tailwind CSS classes on the wrappers.

### Key Design Decisions

| Decision | assistant-ui | Sunder today |
|----------|-------------|--------------|
| Component library | `@assistant-ui/react` primitives | Custom components + `ai-elements` wrappers |
| Scroll management | `ThreadPrimitive.Viewport` (built-in) | `use-stick-to-bottom` via `Conversation` wrapper |
| Markdown rendering | `@assistant-ui/react-markdown` (`MarkdownTextPrimitive`) | `@streamdown/*` plugins |
| Message state | `useAuiState()` reactive selectors | `useChat()` from `@ai-sdk/react` + manual dedup |
| Composer input | `ComposerPrimitive.Input` (auto-resize) | `PromptInputTextarea` custom component |
| Tool display | `ToolFallback` compound component | `ToolCallInline` custom component |
| Thread list | `ThreadListPrimitive` | Custom thread rail in dashboard layout |
| Attachment system | `AttachmentPrimitive` + adapters | Custom upload to `/api/files/upload` |
| CSS variable theming | `--thread-max-width`, `--composer-radius`, `--composer-padding` | Hardcoded `max-w-2xl`, custom padding |

---

## 2. Reference Files to Copy

All source files are from `packages/ui/src/components/assistant-ui/` in the assistant-ui repo. These are the **canonical implementations** meant to be copied into your project (ShadCN-style).

### 2.1 Thread (`thread.tsx`) — Main Container

**Source:** `packages/ui/src/components/assistant-ui/thread.tsx`
**Full code:** [thread.tsx on GitHub](https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/assistant-ui/thread.tsx)

```tsx
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronLeftIcon,
  ChevronRightIcon, CopyIcon, DownloadIcon, MoreHorizontalIcon,
  PencilIcon, RefreshCwIcon, SquareIcon,
} from "lucide-react";
import type { FC } from "react";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-radius" as string]: "24px",
        ["--composer-padding" as string]: "10px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {() => <ThreadMessage />}
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible rounded-t-(--composer-radius) bg-background pb-4 md:pb-6">
          <ThreadScrollToBottom />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};
```

**Key patterns:**
- CSS variables for theming (`--thread-max-width: 44rem`, `--composer-radius: 24px`, `--composer-padding: 10px`)
- `@container` query for responsive suggestion grid
- `turnAnchor="top"` on Viewport — anchors scroll position to top of newest turn
- Sticky composer footer with `rounded-t-(--composer-radius)` using CSS var
- `AuiIf` conditional rendering (reactive, no unnecessary re-renders)

### 2.2 Composer — Input Area

```tsx
const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="composer-shell"
          className="flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-background p-(--composer-padding) transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50"
        >
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder="Send a message..."
            className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 text-sm outline-none placeholder:text-muted-foreground/80"
            rows={1}
            autoFocus
            aria-label="Message input"
          />
          <ComposerAction />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <ComposerAddAttachment />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full"
            aria-label="Send message"
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full"
            aria-label="Stop generating"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};
```

**Key patterns:**
- Attachment dropzone wraps the entire shell (drag-to-upload anywhere in composer)
- `focus-within:` ring for accessibility
- `data-[dragging=true]:` visual feedback during drag
- Send/Cancel toggle via `AuiIf` — no useState flicker
- Round send button (`size-8 rounded-full`) with ArrowUp icon (ChatGPT-style)

### 2.3 Messages — User & Assistant

**UserMessage:**
```tsx
const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />
      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word peer rounded-2xl bg-muted px-4 py-2.5 text-foreground empty:hidden">
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
          <UserActionBar />
        </div>
      </div>
      <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};
```

**AssistantMessage:**
```tsx
const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-3 duration-150"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content wrap-break-word px-2 text-foreground leading-relaxed">
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") return <MarkdownText />;
            if (part.type === "tool-call")
              return part.toolUI ?? <ToolFallback {...part} />;
            return null;
          }}
        </MessagePrimitive.Parts>
        <MessageError />
      </div>
      <div className="aui-assistant-message-footer mt-1 ml-2 flex min-h-6 items-center">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};
```

**Key patterns:**
- **User message:** right-aligned via CSS Grid (`grid-cols-[minmax(72px,1fr)_auto]`), `bg-muted rounded-2xl` bubble, edit action bar positioned absolutely to left
- **Assistant message:** full-width, no bubble — just `px-2 leading-relaxed`
- Both use `fade-in slide-in-from-bottom-1 animate-in duration-150` entrance animation
- `max-w-(--thread-max-width)` — consistent width from CSS variable
- `wrap-break-word` — prevents long URLs from breaking layout
- `data-role` attribute for CSS targeting

### 2.4 Action Bars

**AssistantActionBar** — Copy, Refresh, More (Export):
```tsx
const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton tooltip="More" className="data-[state=open]:bg-accent">
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom" align="start"
          className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};
```

**Key patterns:**
- `hideWhenRunning` — hides during streaming
- `autohide="not-last"` — only shows on hover for non-last messages (last message always visible)
- Copy button toggles between CopyIcon and CheckIcon reactively
- "More" dropdown for less-common actions (export)

**UserActionBar** — Edit only:
```tsx
const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="aui-user-action-bar-root flex flex-col items-end">
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};
```

### 2.5 Inline Edit Composer

```tsx
const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-edit-composer-wrapper mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2 py-3">
      <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Update</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};
```

### 2.6 Welcome Screen

```tsx
const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-2xl duration-200">
            Hello there!
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground text-xl delay-75 duration-200">
            How can I help you today?
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full @md:grid-cols-2 gap-2 pb-4">
      <ThreadPrimitive.Suggestions>
        {() => <ThreadSuggestionItem />}
      </ThreadPrimitive.Suggestions>
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 @md:nth-[n+3]:block nth-[n+3]:hidden animate-in fill-mode-both duration-200">
      <SuggestionPrimitive.Trigger send asChild>
        <Button
          variant="ghost"
          className="aui-thread-welcome-suggestion h-auto w-full @md:flex-col flex-wrap items-start justify-start gap-1 rounded-3xl border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
        >
          <SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1 font-medium" />
          <SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 text-muted-foreground empty:hidden" />
        </Button>
      </SuggestionPrimitive.Trigger>
    </div>
  );
};
```

### 2.7 Scroll-to-Bottom Button

```tsx
const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};
```

### 2.8 Branch Picker

```tsx
const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs", className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous"><ChevronLeftIcon /></TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next"><ChevronRightIcon /></TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
```

---

## 3. Supporting Components

### 3.1 TooltipIconButton (`tooltip-icon-button.tsx`)

Shared utility used everywhere for icon buttons with tooltips.

```tsx
"use client";

import { ComponentPropsWithRef, forwardRef } from "react";
import { Slot } from "radix-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            {...rest}
            className={cn("aui-button-icon size-6 p-1", className)}
            ref={ref}
          >
            <Slot.Slottable>{children}</Slot.Slottable>
            <span className="aui-sr-only sr-only">{tooltip}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);
TooltipIconButton.displayName = "TooltipIconButton";
```

### 3.2 MarkdownText (`markdown-text.tsx`)

Memoized markdown renderer with GFM support and copy-to-clipboard code headers.

```tsx
"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { type FC, memo, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={defaultComponents}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
```

**Markdown element styles (key classes):**

| Element | Tailwind Classes |
|---------|-----------------|
| `h1` | `mb-2 scroll-m-20 font-semibold text-base first:mt-0 last:mb-0` |
| `h2` | `mt-3 mb-1.5 scroll-m-20 font-semibold text-sm first:mt-0 last:mb-0` |
| `p` | `my-2.5 leading-normal first:mt-0 last:mb-0` |
| `a` | `text-primary underline underline-offset-2 hover:text-primary/80` |
| `blockquote` | `my-2.5 border-muted-foreground/30 border-l-2 pl-3 text-muted-foreground italic` |
| `ul` | `my-2 ml-4 list-disc marker:text-muted-foreground [&>li]:mt-1` |
| `ol` | `my-2 ml-4 list-decimal marker:text-muted-foreground [&>li]:mt-1` |
| `table` | `my-2 w-full border-separate border-spacing-0 overflow-y-auto` |
| `pre` (code block) | `overflow-x-auto rounded-t-none rounded-b-lg border border-border/50 border-t-0 bg-muted/30 p-3 text-xs leading-relaxed` |
| inline `code` | `rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em]` |
| code header | `mt-2.5 flex items-center justify-between rounded-t-lg border border-border/50 border-b-0 bg-muted/50 px-3 py-1.5 text-xs` |

### 3.3 Attachment Components (`attachment.tsx`)

See full source in Section 2 references. Key sub-components:

- **`ComposerAttachments`** — horizontal scrollable row of attachment tiles in composer
- **`UserMessageAttachments`** — right-aligned row above user message text
- **`ComposerAddAttachment`** — round "+" button, `size-8 rounded-full`
- **`AttachmentUI`** — individual tile with thumbnail and remove button
- **`AttachmentPreviewDialog`** — fullscreen image preview dialog
- **`AttachmentRemove`** — small X button positioned `absolute top-1.5 right-1.5`

### 3.4 Tool Fallback (`tool-fallback.tsx`)

Compound component for rendering tool calls:

- `ToolFallback.Root` — Collapsible with border, animated open/close
- `ToolFallback.Trigger` — "Used tool: **toolName**" with status icon (spinner/check/error)
- `ToolFallback.Content` — animated collapsible body
- `ToolFallback.Args` — pre-formatted args JSON
- `ToolFallback.Result` — pre-formatted result JSON
- `ToolFallback.Error` — error/cancellation display

Uses `useScrollLock` from `@assistant-ui/react` to prevent scroll jumps on collapse.

### 3.5 Reasoning (`reasoning.tsx`)

Compound component for thinking/reasoning blocks:

- `Reasoning.Root` — Collapsible with variant styles (outline/ghost/muted)
- `Reasoning.Trigger` — "Reasoning (Ns)" with brain icon and shimmer animation
- `Reasoning.Content` — animated collapsible with gradient fade at bottom
- `Reasoning.Text` — scrollable text area, max-h-64

### 3.6 Thread List (`thread-list.tsx`)

Sidebar thread list with New, Archive, Delete:

- `ThreadListPrimitive.Root` — list container
- `ThreadListPrimitive.New` — "New Thread" button with PlusIcon
- `ThreadListPrimitive.Items` — thread list items with title, hover menu
- `ThreadListItemMorePrimitive` — dropdown with Archive and Delete

---

## 4. CSS Variable Theming System

assistant-ui uses a small set of CSS variables for layout customization, set on `ThreadPrimitive.Root`:

```css
--thread-max-width: 44rem;      /* max width of messages and composer */
--composer-radius: 24px;        /* border radius of composer shell */
--composer-padding: 10px;       /* inner padding of composer shell */
```

These are consumed throughout via Tailwind's `max-w-(--thread-max-width)`, `rounded-(--composer-radius)`, `p-(--composer-padding)` syntax.

### aui-* Class Convention

Every component gets a descriptive `aui-*` class for external CSS targeting:
- `aui-root`, `aui-thread-root`
- `aui-thread-viewport`, `aui-thread-viewport-footer`
- `aui-composer-root`, `aui-composer-input`, `aui-composer-send`
- `aui-user-message-root`, `aui-assistant-message-root`
- `aui-md` (markdown container), `aui-md-h1`, `aui-md-p`, etc.
- `aui-button-icon`, `aui-sr-only`

These classes carry no styles themselves — they're hooks for custom CSS overrides.

---

## 5. Required Dependencies

To adopt assistant-ui components, install:

```bash
pnpm add @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown
```

Optional for the full shadcn example:
```bash
pnpm add @assistant-ui/react-lexical   # rich text composer (mentions, slash commands)
```

### ShadCN Components Used

The assistant-ui components depend on these ShadCN primitives:
- `Button` (`@/components/ui/button`)
- `Tooltip`, `TooltipContent`, `TooltipTrigger` (`@/components/ui/tooltip`)
- `Dialog`, `DialogContent`, `DialogTrigger`, `DialogTitle` (`@/components/ui/dialog`)
- `Avatar`, `AvatarImage`, `AvatarFallback` (`@/components/ui/avatar`)
- `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` (`@/components/ui/collapsible`)
- `Skeleton` (`@/components/ui/skeleton`)
- `Sheet`, `SheetContent`, `SheetTrigger` (`@/components/ui/sheet`) — for mobile sidebar

### Runtime Setup

Connect to Vercel AI SDK:

```tsx
"use client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";

export default function ChatPage() {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

---

## 6. Drift Analysis: Sunder vs. assistant-ui

### Must-Drift (Sunder-specific features with no equivalent)

| Feature | Reason |
|---------|--------|
| **Tool approval flow** | Sunder's `ToolCallInline` with `onToolApproval` callback and `agent.requires_action` round-trip has no equivalent in assistant-ui. Must keep custom. |
| **`ask_user_question` tool** | Custom interactive widget (single-select, multi-select, ranking). No equivalent. |
| **Agent-generated views (`json-render`)** | Spec data parts rendered via `ViewRenderer`. assistant-ui has no spec rendering. |
| **Managed Agents runtime** | Sunder uses Anthropic Managed Agents (session-runner.ts), not a standard `useChat` → API flow. The runtime adapter would need custom work. |
| **Browser-Use embed** | Live embedded browser in chat for authenticated browsing. Custom feature. |
| **Skill badges** | MessageBubble extracts skill slugs from tool-read_file parts and shows skill badges. Custom. |
| **Message quota system** | Quota pill, quota-gated composer, quota error handling. Custom. |
| **Realtime message sync** | Supabase Realtime subscription on `conversation_messages` for background-job messages. |
| **Data stream parts** | Custom `data-chat-title` and `data-appendMessage` stream parts for title generation. |
| **Flexoki design tokens** | Sunder uses Flexoki semantic tokens, not ShadCN defaults. Styling classes need adaptation. |

### Can Adopt (no drift needed)

| Pattern | Status |
|---------|--------|
| **Message layout** — user right-aligned bubble, assistant full-width | Adopt as-is. Sunder's current `bg-foreground` dark user bubble should change to `bg-muted rounded-2xl`. |
| **Composer layout** — border shell, attachment dropzone, send/stop toggle | Adopt as-is. Replace `PromptInput` wrapper with `ComposerPrimitive` structure. |
| **Action bar** — copy/refresh below assistant message, edit on user message | Adopt. Sunder currently only has copy. Add refresh + edit + export. |
| **Scroll-to-bottom** — floating round button above composer | Adopt. Replace `ConversationScrollButton`. |
| **Welcome screen** — centered greeting + suggestion grid | Adopt layout. Replace category-tabbed templates with simpler suggestion cards. |
| **Markdown rendering** — heading sizes, code blocks with header, tables | Adopt. The `@assistant-ui/react-markdown` styles are cleaner than `@streamdown`. |
| **CSS variables** — `--thread-max-width`, `--composer-radius`, etc. | Adopt. Replace hardcoded `max-w-2xl` (32rem) with variable `44rem`. |
| **Entrance animations** — `fade-in slide-in-from-bottom-1 animate-in` | Adopt. Sunder currently has no message entrance animations. |
| **TooltipIconButton** — shared utility | Adopt exactly. |
| **Thread list** — sidebar with new/archive/delete | Adopt pattern for thread rail. |

### Partial Adoption (keep structure, adapt internals)

| Pattern | What to keep | What to change |
|---------|-------------|----------------|
| **ToolFallback** | Collapsible layout, status icons, shimmer | Wire to Sunder's `ToolCallInline` approval flow |
| **Reasoning** | Collapsible with brain icon, shimmer, gradient fade | Connect to Sunder's `ReasoningContent` data |
| **Attachments** | Tile layout, preview dialog, remove button | Keep Sunder's upload-to-supabase flow, adopt UI |
| **Thread component** | Full structure | Wrap in Sunder's `ChatPanel` with quota, model selector, data stream |

---

## 7. File Mapping: What to Touch

### New Files to Create

| File | Source | Notes |
|------|--------|-------|
| `src/components/assistant-ui/thread.tsx` | `packages/ui/.../thread.tsx` | Core thread component — adapt for Sunder features |
| `src/components/assistant-ui/tooltip-icon-button.tsx` | Copy exactly | Shared utility |
| `src/components/assistant-ui/markdown-text.tsx` | `packages/ui/.../markdown-text.tsx` | Replace `@streamdown` usage |
| `src/components/assistant-ui/attachment.tsx` | `packages/ui/.../attachment.tsx` | Adapt for Sunder upload flow |
| `src/components/assistant-ui/tool-fallback.tsx` | `packages/ui/.../tool-fallback.tsx` | Already exists — assistant-ui version |
| `src/components/assistant-ui/reasoning.tsx` | `packages/ui/.../reasoning.tsx` | Already exists — assistant-ui version |
| `src/components/assistant-ui/thread-list.tsx` | `packages/ui/.../thread-list.tsx` | For sidebar thread rail |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/chat/chat-panel.tsx` | Wrap content in `AssistantRuntimeProvider` or adapt to use new Thread component |
| `src/components/chat/chat-composer.tsx` | Replace with new Composer or refactor to match assistant-ui layout |
| `src/components/chat/message-bubble.tsx` | Replace with UserMessage/AssistantMessage pattern |
| `src/components/chat/message-list.tsx` | Replace manual dedup + `Conversation` wrapper with `ThreadPrimitive.Messages` |
| `src/components/chat/chat-welcome.tsx` | Simplify to match ThreadWelcome pattern |
| `src/components/chat/preview-attachment.tsx` | Replace with assistant-ui attachment UI |
| `src/components/ai-elements/conversation.tsx` | May be removable if adopting ThreadPrimitive.Viewport |
| `package.json` | Add `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `@assistant-ui/react-markdown` |

### Files to Keep As-Is

| File | Reason |
|------|--------|
| `src/components/chat/tool-call-inline.tsx` | Custom approval flow — no assistant-ui equivalent |
| `src/components/chat/ask-user-question-inline.tsx` | Custom interactive widget |
| `src/components/chat/image-lightbox.tsx` | Can be replaced by AttachmentPreviewDialog |
| `src/lib/chat/attachment-config.ts` | Sunder-specific MIME type config |
| `src/lib/managed-agents/session-runner.ts` | Agent runtime — unrelated to UI |

### Testing & Docs

- **Unit tests:** `src/components/chat/chat-composer.test.tsx` needs full rewrite
- **Storybook:** If exists, update for new component structure
- **Docs to check:**
  - [assistant-ui docs](https://www.assistant-ui.com/docs)
  - [AI SDK integration guide](https://www.assistant-ui.com/docs/runtimes/ai-sdk)
  - [Styling guide](https://www.assistant-ui.com/docs/ui/styling)
  - [Component registry](https://www.assistant-ui.com/docs/ui/registry)

---

## 8. Implementation Order

1. **Install deps** — `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `@assistant-ui/react-markdown`
2. **Copy utilities** — `tooltip-icon-button.tsx` (exact copy)
3. **Copy markdown** — `markdown-text.tsx` (exact copy, replaces `@streamdown`)
4. **Copy attachment UI** — `attachment.tsx` (adapt upload flow)
5. **Build Thread** — `thread.tsx` with Sunder customizations (quota, model selector, tool approval)
6. **Replace MessageBubble** — split into UserMessage + AssistantMessage pattern
7. **Replace ChatComposer** — adopt Composer layout with existing model selector
8. **Replace ChatWelcome** — adopt ThreadWelcome with Sunder templates
9. **Replace MessageList** — remove manual dedup, adopt ThreadPrimitive.Messages
10. **Wire runtime** — connect `useChatRuntime` or custom adapter to Managed Agents
11. **Polish** — entrance animations, CSS variables, dark mode

---

## 9. Full Example: shadcn.tsx (from docs)

The `apps/docs/components/examples/shadcn.tsx` is the full "ChatGPT-like" demo that includes:
- Collapsible sidebar with thread list
- Mobile sheet menu
- Header with model picker and share button
- Lexical rich text input with slash commands and mentions
- All message types with action bars
- Selection toolbar for quoting

**This is the target UI to replicate.** Source: [shadcn.tsx](https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/components/examples/shadcn.tsx)

The simpler starting point is the core `thread.tsx` from `packages/ui/` — it has all the essentials without the sidebar chrome.
