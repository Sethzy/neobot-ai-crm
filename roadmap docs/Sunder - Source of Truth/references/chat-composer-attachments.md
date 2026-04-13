# Chat Composer — Attachment UX Reference

**Source repo:** `assistant-ui/assistant-ui`  
**Key files in reference:** `packages/ui/src/components/assistant-ui/attachment.tsx`, `packages/ui/src/components/assistant-ui/thread.tsx`  
**Our files:** `src/components/chat/chat-composer.tsx`, `src/components/chat/preview-attachment.tsx`, `src/components/ai-elements/prompt-input.tsx`

---

## i. Patterns the reference codebase uses

### 1. Attachments live INSIDE the composer shell

The entire composer is one visual box. Attachments render at the top of the box, stacked above the text input — not outside/above the box as a separate island.

```tsx
// assistant-ui: packages/ui/src/components/assistant-ui/thread.tsx
const Composer: FC = () => (
  <ComposerPrimitive.Root className="relative flex w-full flex-col">
    <ComposerPrimitive.AttachmentDropzone asChild>
      <div
        data-slot="composer-shell"
        className="flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-background p-(--composer-padding)
                   transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20
                   data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50"
      >
        <ComposerAttachments />          {/* ← thumbnails at top of shell */}
        <ComposerPrimitive.Input
          placeholder="Send a message..."
          className="max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 text-sm outline-none placeholder:text-muted-foreground/80"
          rows={1}
          autoFocus
        />
        <ComposerAction />               {/* ← action bar at bottom */}
      </div>
    </ComposerPrimitive.AttachmentDropzone>
  </ComposerPrimitive.Root>
);
```

The `flex flex-col gap-2` makes the box grow top-to-bottom: attachments row → text input → action bar. The input auto-grows via `min-h-10 max-h-32 resize-none rows={1}`.

### 2. ComposerAttachments — horizontal scroll strip

```tsx
// assistant-ui: packages/ui/src/components/assistant-ui/attachment.tsx
export const ComposerAttachments: FC = () => (
  <div className="flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
    <ComposerPrimitive.Attachments>
      {() => <AttachmentUI />}
    </ComposerPrimitive.Attachments>
  </div>
);
```

Key: `empty:hidden` — the row collapses entirely when there are no attachments. No conditional `if (attachments.length > 0)` needed.

### 3. AttachmentUI — tile with hover dim and always-visible X

```tsx
const AttachmentUI: FC = () => {
  const isComposer = aui.attachment.source !== "message";

  return (
    <Tooltip>
      <AttachmentPrimitive.Root className="relative ...">
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className="size-14 cursor-pointer overflow-hidden rounded-... border bg-muted
                         transition-opacity hover:opacity-75"   // ← subtle hover dim
              role="button"
            >
              <AttachmentThumb />
            </div>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
        {isComposer && <AttachmentRemove />}  {/* ← only in composer, not in message list */}
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />           {/* ← filename tooltip on hover */}
      </TooltipContent>
    </Tooltip>
  );
};
```

- **Tile size:** `size-14` (56 px). For a lone image it scales to `size-24` via `only:*:first:size-24`.
- **Hover:** tile dims to 75% opacity (`transition-opacity hover:opacity-75`).
- **Tooltip:** filename appears above on hover.
- **X button:** always rendered (no `opacity-0`). Only shown in the composer context, not in the message list.

### 4. AttachmentRemove — white circle, always visible, turns red on hover

```tsx
const AttachmentRemove: FC = () => (
  <AttachmentPrimitive.Remove asChild>
    <TooltipIconButton
      tooltip="Remove file"
      className="absolute top-1.5 right-1.5 size-3.5 rounded-full
                 bg-white text-muted-foreground opacity-100 shadow-sm
                 hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
      side="top"
    >
      <XIcon className="size-3 dark:stroke-[2.5px]" />
    </TooltipIconButton>
  </AttachmentPrimitive.Remove>
);
```

- **Always visible** (`opacity-100`). No hidden-until-hover.
- White circle with drop shadow (`bg-white shadow-sm rounded-full`).
- X icon is black, turns destructive red on hover.
- `top-1.5 right-1.5` absolute positioning.

### 5. AttachmentThumb — Avatar with FileText fallback

```tsx
const AttachmentThumb: FC = () => {
  const src = useAttachmentSrc();
  return (
    <Avatar className="h-full w-full rounded-none">
      <AvatarImage src={src} alt="Attachment preview" className="object-cover" />
      <AvatarFallback>
        <FileText className="size-8 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
};
```

Uses ShadCN `Avatar` / `AvatarImage` / `AvatarFallback` — graceful fallback for non-images.

---

## ii. Files to touch

### Files we're changing

| File | Change |
|------|--------|
| `src/components/chat/preview-attachment.tsx` | Match tile + remove button styling to reference |
| `src/components/chat/chat-composer.tsx` | Move attachment strip **inside** `PromptInput` shell |
| `src/components/ai-elements/prompt-input.tsx` | Expose a slot/children area above the textarea inside the shell |

### Tests to update

| File | Why |
|------|-----|
| `src/components/chat/chat-composer.test.tsx` | Attachment strip is now inside the `PromptInput` form, not above it |
| `src/components/chat/preview-attachment.test.tsx` | X button styling change (was hidden, now visible) |

### Docs / reference to check before implementing

- `packages/ui/src/components/assistant-ui/thread.tsx` — `Composer` component (full shell layout)
- `packages/ui/src/components/assistant-ui/attachment.tsx` — `AttachmentUI`, `AttachmentRemove`, `ComposerAttachments`
- `apps/docs/content/docs/ui/thread.mdx` — anatomy docs for the Thread/Composer

---

## iii. Where we drift today — and whether to keep drifting

### Drift 1 — Attachments outside the shell (CLOSE)

**Current:** `chat-composer.tsx` renders attachments in a `div` **above** the `PromptInput` form. This is the "jank" — it looks like a floating island above the input box.

**Reference:** Attachments are inside the shell `div`, above the textarea, inside the same `flex flex-col` container.

**Decision: Eliminate.** Move the attachment strip inside `PromptInput`. The `prompt-input.tsx` component already has the full attachment context internally — we just need to render thumbnails inside the shell.

Concretely: add an attachment strip render slot inside the `PromptInput` component's shell div (above the `PromptInputTextarea`), and remove the external strip from `chat-composer.tsx`.

---

### Drift 2 — X button hidden until hover (CLOSE)

**Current (after today's fix):** `opacity-100` always visible. Before today's fix it was `opacity-0 group-hover:opacity-100`. Now it's always visible but with a `variant="destructive"` button which shows red background immediately — looks aggressive.

**Reference:** White circle, black X, turns red icon on hover only. Never hidden.

**Decision: Align.** Update `PreviewAttachment` X button to: `bg-white text-black rounded-full shadow-sm size-3.5 absolute top-1.5 right-1.5` with `hover:[&_svg]:text-destructive`.

---

### Drift 3 — No hover dim on tile (CLOSE)

**Current:** No hover effect on the tile itself.

**Reference:** `transition-opacity hover:opacity-75` on the tile wrapper div.

**Decision: Align.** Add `transition-opacity hover:opacity-75` to the tile `div` in `PreviewAttachment`.

---

### Drift 4 — No filename tooltip (MINOR, CLOSE)

**Current:** Filename shown only as truncated gradient overlay at bottom of tile.

**Reference:** `Tooltip` above the tile shows full filename.

**Decision: Align.** Wrap tile in a `Tooltip` + `TooltipContent` with the filename.

---

### Drift 5 — Upload state (KEEP)

**Current:** We upload files to Supabase Storage before adding to the attachment list, and show a spinner overlay during upload. The `isUploading` prop drives this.

**Reference:** assistant-ui uses an `AttachmentAdapter` — files are managed client-side with blob URLs and processed at send time. We deliberately upload eagerly at attach time to generate a stable `url` + `storagePath` before the message is sent.

**Decision: Keep this drift.** Our upload-on-attach pattern is intentional (the agent needs a Supabase URL, not a blob URL). The `isUploading` spinner overlay stays. We just inherit the visual patterns for the rest.

---

### Drift 6 — Separate `PreviewAttachment` for message list vs composer (KEEP)

**Current:** `PreviewAttachment` is reused in both the composer and message list. The `onRemove` prop controls whether the X button appears.

**Reference:** Uses `isComposer` context flag to conditionally render `AttachmentRemove`. Same component, different behavior.

**Decision: Our approach is equivalent and simpler** — `onRemove` is undefined in message list, X doesn't render. No need to change.

---

## Summary of changes

1. **Move attachment strip inside `PromptInput` shell** — biggest visual fix, eliminates the floating island
2. **Tile hover dim** — `transition-opacity hover:opacity-75` on the tile div
3. **X button styling** — white circle, black icon, red on hover, always visible
4. **Filename tooltip** — wrap tile in ShadCN `Tooltip`
5. **Tile size** — bump from `size-16` (64px) to match reference `size-14` (56px) or keep at 16 — either is fine, both are in range

Implementation order: (1) is structural; (2)–(4) are cosmetic and can go in the same PR.
