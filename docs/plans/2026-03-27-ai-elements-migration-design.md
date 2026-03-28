# AI Elements Migration Design

**Date:** 2026-03-27
**Goal:** Adopt AI Elements (Vercel's shadcn-based component registry for AI SDK v6) where it improves our stack, achieving zero drift on adopted components.

---

## Principle

AI Elements files in `src/components/ai-elements/` are **never edited**. All Sunder-specific behavior lives in `src/components/chat/` as thin wrappers that compose AI Elements primitives.

---

## Approved / Rejected Changes

| # | Change | Decision | Reason |
|---|---|---|---|
| 1 | Reasoning size bump (xs→sm, larger spacing) | **Accepted** | Already overwritten by AI Elements install, let it ride and evaluate visually |
| 2 | Tool + Confirmation cards replacing pills | **Rejected** | Pills are lighter, better hierarchy for consumer chat |
| 3 | Prompt input — built-in file handling, attachments inside composer | **Approved** | Deletes ~80 lines of custom upload logic, simpler UX |
| 4 | Scroll container — Conversation component | **Approved** | Same look, better library (use-stick-to-bottom) |
| 5 | Streamdown — CSS import relocation | **Approved** | Housekeeping only, no visual change |
| 6 | Message actions — Copy button on assistant messages | **Approved** | Uses AI Elements `MessageActions` / `MessageAction`. Copy only for now; like/dislike/retry deferred until feedback table exists |

---

## What's IN scope

### 1. Scroll swap (`message-list.tsx`)

Replace custom `useScrollToBottom` hook with AI Elements `Conversation` / `ConversationContent` / `ConversationScrollButton`. Visually identical. Delete `src/hooks/use-scroll-to-bottom.ts`.

### 2. File upload simplification (`chat-composer.tsx`)

Delete custom Supabase Storage upload logic (~80 lines: `uploadFile`, `uploadFiles`, `handleFileChange`, `handlePaste`, `removeQueuedFilenames`, `fileInputRef`, attachment state, upload queue state). Use AI Elements `PromptInput` built-in file handling (client-side blob→data URL). Remove `disableAttachments` prop.

Attachments move from above the composer to inside it. Chat API route already accepts data URLs — verified `getFilePartsFromUnknownParts()` checks `typeof part.url === "string"`, works with both `https://` and `data:` URLs.

Delete `/api/files/upload` endpoint and its test if no other consumers.

### 3. Streamdown CSS relocation

Delete `ai-elements/streamdown-plugins.ts` (dead code — new `MessageResponse` bundles plugins inline). Move the `streamdown-overrides.css` import to `message-bubble.tsx` so Flexoki overrides stay in the bundle. No visual change.

### 4. Copy button on assistant messages (`message-bubble.tsx`)

Add `MessageToolbar` with `MessageActions` containing a single `MessageAction` (Copy) on assistant messages. Pattern from AI Elements `message.tsx` example:

```tsx
import { CopyIcon } from "lucide-react";
import { MessageAction, MessageActions, MessageToolbar } from "@/components/ai-elements/message";

// Inside assistant message, after MessageContent:
<MessageToolbar>
  <MessageActions>
    <MessageAction
      label="Copy"
      tooltip="Copy to clipboard"
      onClick={() => navigator.clipboard.writeText(messageText)}
    >
      <CopyIcon className="size-4" />
    </MessageAction>
  </MessageActions>
</MessageToolbar>
```

Deferred for later (needs backend):
- Like/Dislike (`ThumbsUpIcon` / `ThumbsDownIcon`) — needs feedback table
- Retry (`RefreshCcwIcon`) — needs regeneration support

### 5. Verify overwritten files compile

The AI Elements install overwrote `message.tsx`, `prompt-input.tsx`, `reasoning.tsx`, `shimmer.tsx`, `suggestion.tsx`. Run tests, fix any type/import breakage.

---

## What's OUT of scope

### Kept as-is (our implementations are better for consumer chat)

| Component | Reason |
|---|---|
| `chat/tool-call-inline.tsx` | Pill design is lighter, better visual hierarchy than AI Elements card |
| `chat/steps-summary.tsx` | Composes our pills, works well |

### AI Elements features we don't use (additive, no action)

- `ConversationEmptyState` — we have `ChatWelcome`
- `ConversationDownload` — chat export not needed
- `MessageBranch` / branching — not in our product
- `PromptInputActionAddScreenshot` — screenshot capture, nice-to-have for later
- `PromptInputSelect` / model selector — we use single model routing
- `PromptInputCommand` / command palette — not needed
- `Tool` / `Confirmation` — rejected in favor of our pills

---

## Architecture (target)

```
chat-panel.tsx
├── MessageList
│   ├── ai-elements/Conversation              ← NEW (replaces useScrollToBottom)
│   │   ├── ai-elements/ConversationContent
│   │   │   ├── MessageBubble
│   │   │   │   ├── ai-elements/Message + MessageContent + MessageResponse
│   │   │   │   ├── StepsSummary (kept)
│   │   │   │   │   ├── ToolCallInline (kept — our pills)
│   │   │   │   │   └── ai-elements/Reasoning
│   │   │   │   ├── ai-elements/MessageToolbar ← NEW
│   │   │   │   │   └── MessageActions > MessageAction (Copy)
│   │   │   │   ├── ViewRenderer (json-render)
│   │   │   │   ├── AskUserQuestionInline
│   │   │   │   └── PreviewAttachment
│   │   │   └── {thinking placeholder}
│   │   └── ai-elements/ConversationScrollButton  ← NEW
└── ChatComposer
    ├── ai-elements/PromptInput (built-in file handling) ← CHANGED
    └── quota bar (Sunder layer)
```

### File changes

```
DELETE                                REASON
───────────────────────────────────── ──────────────────────────────
hooks/use-scroll-to-bottom.ts        → ai-elements/conversation
ai-elements/streamdown-plugins.ts    → built into MessageResponse
app/api/files/upload/route.ts        → AI Elements handles files client-side
app/api/files/upload/route.test.ts   → endpoint deleted

REWRITE
───────────────────────────────────── ──────────────────────────────
chat/message-list.tsx                 Conversation swap (small)
chat/chat-composer.tsx                Delete custom upload logic (medium)

ADD
───────────────────────────────────── ──────────────────────────────
chat/message-bubble.tsx               MessageToolbar + Copy action on assistant messages

MINOR EDIT
───────────────────────────────────── ──────────────────────────────
chat/message-bubble.tsx               Add streamdown-overrides.css import

VERIFY ONLY
───────────────────────────────────── ──────────────────────────────
chat/chat-panel.tsx                   No changes expected
ai-elements/message.tsx               No diff (identical)
ai-elements/reasoning.tsx             Overwritten — accept AI Elements version
ai-elements/shimmer.tsx               Import order only (no visual change)
ai-elements/suggestion.tsx            Import order only (no visual change)

UNTOUCHED (kept as-is)
─────────────────────────────────────
chat/tool-call-inline.tsx
chat/steps-summary.tsx
```

---

## Migration sequence

Five steps, each independently committable:

### Step 1: Scroll swap
- Rewrite `message-list.tsx` → `Conversation` / `ConversationContent` / `ConversationScrollButton`
- Delete `src/hooks/use-scroll-to-bottom.ts`
- Update `message-list.test.tsx`
- Smoke test: scroll behavior, button appears/disappears

### Step 2: Composer simplification
- Delete custom upload logic from `chat-composer.tsx`
- Remove `disableAttachments` prop usage
- Let AI Elements handle file attachments natively
- Delete `app/api/files/upload/route.ts` + test (verify no other consumers first)
- Update `chat-composer` tests if any
- Smoke test: attach image via button, paste image, drag-drop file

### Step 3: Copy button
- Add `MessageToolbar` + `MessageActions` + copy `MessageAction` to assistant messages in `message-bubble.tsx`
- Only show on non-streaming, completed assistant messages
- Test: click copy, verify clipboard contents

### Step 4: Streamdown cleanup
- Delete `ai-elements/streamdown-plugins.ts`
- Add `import "../ai-elements/streamdown-overrides.css"` to `message-bubble.tsx`
- Run tests, fix any import breakage
- Visual check: markdown, code blocks, mermaid with Flexoki

### Step 5: Dead code sweep + verify
- Grep for imports of deleted files
- Remove `PreviewAttachment` from composer imports (if no longer used there)
- Verify `streamdown-overrides.css` is still in the bundle
- Run full test suite
- Verify all overwritten AI Elements files compile cleanly

---

## Resolved questions

1. **`use-stick-to-bottom`** — confirmed in `package.json` (`^1.1.3`), installed by AI Elements
2. **Chat API + data URLs** — confirmed `getFilePartsFromUnknownParts()` accepts any string URL, works with `data:` URLs
3. **`MessageResponse` memo props** — new version memos on `children` + `isAnimating`, our usage passes `isStreaming` as `isAnimating` — compatible
4. **Reasoning overwrite** — accepted. AI Elements version (text-sm, larger icons/spacing) ships as-is. Evaluate visually after migration.
5. **Message actions pattern** — Copy only for now. Like/dislike/retry deferred until backend support exists.

## Unresolved questions

1. **Flexoki + streamdown code blocks** — `@streamdown/code` may ship its own color theme. Visual inspection needed after migration

## Post-review revision (2026-03-28)

Code reviewer identified 7 issues with the original tasklist. Scope narrowed:

- **Composer simplification dropped** — data URLs would bloat `conversation_messages.parts`. Storage-backed uploads preserved.
- **`use-scroll-to-bottom.ts` kept** — `analyst-section.tsx` still imports it. Only swapped in chat `message-list.tsx`.
- **`streamdown-plugins.ts` kept** — `message.tsx:15` still imports it. Not dead code.
- **`/api/files/upload` kept** — storage uploads preserved.
- **`disableAttachments`** — just remove the prop (minimal fix).
- **Commit staging** — only touched files, not broad directories.

Final scope: scroll swap (chat only) + copy button + prop fix. See `docs/product/tasks/2026-03-27-ai-elements-migration-tasklist.md` (v2).
