# Image Lightbox / Preview — Reference Analysis

> **Reference repo:** `vercel/ai-chatbot` (v3.1.0) — cloned locally at `/Users/sethlim/Documents/chatbot`
> **Secondary reference:** `core-oss` — cloned locally at `/Users/sethlim/Documents/core-oss`
> **Date:** 2026-04-05

## Situation

When users upload screenshots or images to chat, clicking the thumbnail should let them view the image at full size without leaving the app. Today, Sunder's `PreviewAttachment` wraps images in an `<a href>` that navigates to the raw Supabase storage URL in a new tab — no in-app viewer.

The official Vercel AI Chatbot (`ai-chatbot`) does **not** ship a lightbox either — it has the same gap. Thumbnails render via `PreviewAttachment` with no click-to-preview. The `core-oss` reference **does** ship a working lightbox using `createPortal`.

This document synthesizes both references to define a KISS implementation for Sunder.

---

## 1. Patterns from the Reference Codebases

### A. `ai-chatbot` — PreviewAttachment (the baseline we track)

**File:** `chatbot/components/preview-attachment.tsx` (62 lines)

| Pattern | Detail |
|---------|--------|
| Thumbnail size | `size-16` (64x64px), `object-cover` |
| Container | `group relative size-16 overflow-hidden rounded-lg border bg-muted` |
| Image element | Next.js `<Image>` with `width={64} height={64}` |
| Filename label | Absolute bottom overlay with gradient: `bg-linear-to-t from-black/80 to-transparent` |
| Upload state | Spinner overlay with `bg-black/50` |
| Remove button | Absolute top-right, `opacity-0 group-hover:opacity-100`, `variant="destructive"` |
| Click behavior | **None** — no `onClick`, no `<a>` wrap. Thumbnails are not clickable in the reference. |

**Key insight:** The reference repo's `PreviewAttachment` has **no click target at all** on message-rendered thumbnails. The `onRemove` button only appears in the composer. Our current `<a href>` wrapping is a Sunder addition that we'll replace with the lightbox.

### B. `ai-chatbot` — Message rendering

**File:** `chatbot/components/message.tsx` (lines 89-105)

```tsx
{attachmentsFromMessage.length > 0 && (
  <div className="flex flex-row justify-end gap-2" data-testid="message-attachments">
    {attachmentsFromMessage.map((attachment) => (
      <PreviewAttachment
        attachment={{ name: attachment.filename ?? "file", contentType: attachment.mediaType, url: attachment.url }}
        key={attachment.url}
      />
    ))}
  </div>
)}
```

Pattern: message extracts `file` parts, maps to `PreviewAttachment`. No click handler passed.

### C. `ai-chatbot` — Dialog primitive

**File:** `chatbot/components/ui/dialog.tsx` (122 lines)

Standard Radix `@radix-ui/react-dialog` wrapper with:
- `DialogOverlay`: `fixed inset-0 z-50 bg-black/80` with animate-in/out
- `DialogContent`: centered, `max-w-lg`, zoom animation
- Built-in close button (X icon, top-right)
- Accessible: focus trap, Escape to close

### D. `core-oss` — The actual lightbox implementation

**File:** `core-oss/core-web/src/components/Messages/MessagesView.tsx`

**State (lifted to view level):**
```tsx
const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
```

**Trigger — ImageWithPlaceholder component (lines 344-423):**
```tsx
<button
  type="button"
  onClick={() => onImageClick?.(clickUrl || url)}
  className="block cursor-zoom-in"
>
  {/* image with loading skeleton + error state */}
</button>
```

**Lightbox overlay (lines 3693-3717):**
```tsx
{lightboxImageUrl &&
  createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={() => setLightboxImageUrl(null)}
    >
      <button
        onClick={() => setLightboxImageUrl(null)}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors"
        aria-label="Close"
      >
        <XMarkIcon className="w-6 h-6" />
      </button>
      <img
        src={lightboxImageUrl}
        alt="Full size"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  )}
```

| Pattern | Detail |
|---------|--------|
| Overlay | `createPortal` to `document.body`, `fixed inset-0 z-[9999]` |
| Background | `bg-black/80` |
| Image sizing | `max-w-[90vw] max-h-[90vh] object-contain` |
| Close mechanisms | Click backdrop, click X button |
| Cursor hint | `cursor-zoom-in` on thumbnail |
| State shape | `string \| null` — just the URL |
| Escape key | Not explicitly handled (relies on click) |

---

## 2. Implementation Plan for Sunder

### Approach: Use shadcn Dialog (not raw createPortal)

The `core-oss` reference uses raw `createPortal`. We should use our existing `Dialog` primitive from shadcn instead, because:
- We already have it (`src/components/ui/dialog.tsx`)
- It gives us Escape key, focus trap, and accessible overlay for free
- It matches every other modal in Sunder
- The `ai-chatbot` reference also ships Dialog for this purpose (they just haven't wired it to images yet)

This is a justified drift — same result, better accessibility, less code.

### Files to create

#### `src/components/chat/image-lightbox.tsx` (NEW)

A thin wrapper around Dialog that shows a full-viewport image.

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "Full size image", onClose }: ImageLightboxProps) {
  return (
    <Dialog open={!!src} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80" />
        <DialogContent
          showCloseButton={false}
          className="max-w-[90vw] max-h-[90vh] border-none bg-transparent p-0 shadow-none ring-0"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {src && (
            <img
              src={src}
              alt={alt}
              className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
```

### Files to modify

#### `src/components/chat/preview-attachment.tsx`

Changes:
1. Add `onImageClick?: (url: string) => void` prop
2. For images: replace `<a href>` with `<button onClick>` + `cursor-zoom-in`
3. For non-images: keep `<a href>` (PDFs etc. should still open in browser)
4. When `onImageClick` is not provided (composer context), fall back to no-click behavior (matching reference)

```tsx
// New prop
interface PreviewAttachmentProps {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
  onImageClick?: (url: string) => void;  // NEW
}

// In render — replace the <a> wrapper:
{!isUploading && url ? (
  contentType.startsWith("image/") && onImageClick ? (
    <button
      type="button"
      aria-label={filename}
      className="block size-full cursor-zoom-in"
      onClick={() => onImageClick(url)}
    >
      {previewContent}
      {filenameLabel}
    </button>
  ) : (
    <a aria-label={filename} className="block size-full" href={url}>
      {previewContent}
      {filenameLabel}
    </a>
  )
) : (
  <div className="size-full">
    {previewContent}
    {filenameLabel}
  </div>
)}
```

#### `src/components/chat/message-bubble.tsx`

Changes:
1. Add `useState<string | null>(null)` for lightbox URL
2. Pass `onImageClick={setLightboxSrc}` to every `<PreviewAttachment>` in both user and assistant branches
3. Render `<ImageLightbox>` once at the bottom of the component

```tsx
import { useState } from "react";
import { ImageLightbox } from "./image-lightbox";

// Inside MessageBubble:
const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

// User message attachments:
<PreviewAttachment
  attachment={filePartToAttachment(part)}
  key={...}
  onImageClick={setLightboxSrc}
/>

// Assistant message file parts:
<PreviewAttachment
  key={key}
  attachment={filePartToAttachment(part as ChatFilePart)}
  onImageClick={setLightboxSrc}
/>

// At the end of the component return:
<ImageLightbox
  src={lightboxSrc}
  onClose={() => setLightboxSrc(null)}
/>
```

#### `src/components/chat/preview-attachment.test.tsx`

Changes:
1. Update existing test that checks for `<a>` link on images — it should now check for `<button>` when `onImageClick` is provided
2. Add test: image with `onImageClick` renders button with `cursor-zoom-in`, calls callback on click
3. Add test: image without `onImageClick` renders plain div (no link, no button) — matching reference
4. Add test: non-image attachments still render `<a href>` link

---

## 3. Where We Drift and Why

| Area | Reference (`ai-chatbot`) | Sunder | Drift? | Reason |
|------|--------------------------|--------|--------|--------|
| Overlay mechanism | N/A (no lightbox) | shadcn `Dialog` | Yes — justified | We use Dialog for all modals. Gives us Escape, focus trap, a11y for free. `core-oss` uses raw `createPortal` which lacks these. |
| Thumbnail click in composer | No click behavior | No click behavior | **No drift** | Match reference exactly — composer thumbnails only have remove button |
| Thumbnail click in messages | No click behavior | `onImageClick` → lightbox | Feature addition | Reference hasn't shipped this yet. We follow the `core-oss` pattern. |
| Image component | Next.js `<Image>` | Native `<img>` | Existing drift | Sunder already uses `<img>` in PreviewAttachment. Not changing — thumbnails are user-uploaded with unpredictable URLs. |
| Non-image click | No click behavior | `<a href>` opens in browser | Existing drift | We keep this — PDFs/docs need a way to open. |
| Thumbnail size | `size-16` (64x64) | `size-16` (64x64) | **No drift** | |
| Filename label | `bg-linear-to-t from-black/80` | `bg-gradient-to-t from-black/80` | **No drift** | Same CSS, different Tailwind version syntax |
| Container classes | `group relative size-16 overflow-hidden rounded-lg border bg-muted` | Same | **No drift** | |
| Remove button | destructive, opacity transition | Same | **No drift** | |

---

## 4. What NOT to Build

Per YAGNI:
- No image carousel / prev-next navigation
- No zoom controls
- No annotation tools (Gemini-style)
- No download button on lightbox
- No image loading skeleton in lightbox (image is already cached from thumbnail)
- No drag-to-pan

---

## 5. Testing Checklist

- [ ] Click image thumbnail in user message → lightbox opens with full image
- [ ] Click image thumbnail in assistant message → lightbox opens
- [ ] Press Escape → lightbox closes
- [ ] Click backdrop → lightbox closes
- [ ] Non-image attachment (PDF) → still opens via `<a href>` in browser
- [ ] Composer thumbnails → no lightbox behavior, only remove button
- [ ] Uploading state → no click target
- [ ] Multiple images in one message → each opens its own lightbox
- [ ] Mobile: lightbox renders correctly with viewport constraints
